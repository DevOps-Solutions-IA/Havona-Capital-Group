import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@havona/database';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { canonicalMarkdownDryRun, type MarkdownCanonicalDocument } from './markdown-canonical.service';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeStagingService } from './knowledge-staging.service';
import type { KnowledgeActor } from './knowledge.types';

export const PALIG_PRIVATE_QA_SOURCE = '/mnt/d/Herry/archivos.md';
export const PALIG_PRIVATE_QA_COLLECTION_KEY = 'palig-private-qa';

@Injectable()
export class KnowledgePrivateQaService {
  constructor(
    private readonly db: PrismaService,
    private readonly staging: KnowledgeStagingService,
    private readonly knowledge: KnowledgeService,
    private readonly audit: AuditService,
  ) {}

  async baseline() {
    const [documents, versions, chunks, embeddings, staged, published, publicAllowed, henryVisible] =
      await Promise.all([
        this.db.knowledgeDocument.count(),
        this.db.knowledgeVersion.count(),
        this.db.knowledgeChunk.count(),
        this.db.knowledgeChunk.count({ where: { embedding: { not: Prisma.JsonNull } } }),
        this.db.knowledgeStagedAsset.count(),
        this.db.knowledgeVersion.count({ where: { status: 'PUBLISHED' } }),
        this.db.knowledgeVersion.count({ where: { publicAllowed: true } }),
        this.db.knowledgeVersion.count({
          where: { status: 'PUBLISHED', document: { collection: { henryEnabled: true } } },
        }),
      ]);
    return { documents, versions, chunks, embeddings, staged, published, publicAllowed, henryVisible };
  }

  async ingest(source: string, actor: KnowledgeActor) {
    if (resolve(source) !== PALIG_PRIVATE_QA_SOURCE)
      throw new BadRequestException('KNOWLEDGE_PRIVATE_QA_SOURCE_NOT_ALLOWED');
    const dryRun = await canonicalMarkdownDryRun(source);
    const collection = await this.db.knowledgeCollection.upsert({
      where: { key: PALIG_PRIVATE_QA_COLLECTION_KEY },
      create: {
        key: PALIG_PRIVATE_QA_COLLECTION_KEY,
        name: 'PALIG Private QA',
        description: 'Colección privada, no publicable ni consumible por Henry.',
        allowedRoles: ['SUPER_ADMIN'],
        isActive: false,
        henryEnabled: false,
      },
      update: { allowedRoles: ['SUPER_ADMIN'], isActive: false, henryEnabled: false },
    });
    const results: Array<{ filename: string; documentId: string; versionId: string; chunks: number; reused: boolean }> = [];
    for (const canonical of dryRun.documents) {
      const existing = await this.db.knowledgeVersion.findFirst({
        where: { checksum: canonical.manifest.sha256, document: { collectionId: collection.id } },
        include: { document: true },
      });
      if (existing) {
        const chunks = await this.db.knowledgeChunk.count({ where: { versionId: existing.id } });
        if (existing.status === 'REVIEW' && chunks === canonical.manifest.chunkCount) {
          results.push({ filename: canonical.manifest.filename, documentId: existing.documentId, versionId: existing.id, chunks, reused: true });
          continue;
        }
        const processed = await this.knowledge.processVersion(existing.id);
        await this.db.knowledgeDocument.update({
          where: { id: existing.documentId },
          data: { tags: this.manifestMetadata(canonical) },
        });
        results.push({ filename: canonical.manifest.filename, documentId: existing.documentId, versionId: existing.id, chunks: processed.chunks, reused: false });
        continue;
      }
      const file = await this.file(source, canonical);
      const proposal = {
        sourceType: canonical.manifest.sourceType,
        authorityLevel: canonical.manifest.authorityLevel,
        currentStatus: 'UNKNOWN' as const,
        publicAllowed: false,
        consultantAllowed: false,
        managerAllowed: false,
        trainingAllowed: false,
        carrier: 'PAN_AMERICAN_LIFE_COLOMBIA' as const,
        versionLabel: canonical.manifest.version ?? undefined,
        customerNeedKeys: canonical.manifest.customerNeeds,
        notes: 'PRIVATE_QA; VALIDITY_NOT_CONFIRMED',
      };
      const priorStaged = await this.db.knowledgeStagedAsset.findFirst({
        where: { sha256: canonical.manifest.sha256, originalFilename: canonical.manifest.filename },
        orderBy: { createdAt: 'asc' },
      });
      const staged = priorStaged ?? await this.staging.stage(file, proposal, actor);
      if (staged.scanStatus !== 'CLEAN')
        throw new Error(`KNOWLEDGE_PRIVATE_QA_SCAN_BLOCKED:${canonical.manifest.filename}`);
      if (staged.reviewStatus !== 'APPROVED')
        await this.staging.review(staged.id, { ...proposal, approved: true }, actor);
      const promoted = await this.staging.promote(staged.id, {
        title: canonical.manifest.title,
        description: `PRIVATE_QA canonical Markdown: ${canonical.manifest.productOrTopic}`,
        collectionId: collection.id,
        classification: 'ADMINISTRATION',
      }, actor, 'MANUAL');
      const version = await this.db.knowledgeVersion.findFirstOrThrow({
        where: { documentId: promoted.documentId }, orderBy: { version: 'desc' },
      });
      const processed = await this.knowledge.processVersion(version.id);
      await this.db.knowledgeDocument.update({
        where: { id: promoted.documentId },
        data: { tags: this.manifestMetadata(canonical) },
      });
      results.push({ filename: canonical.manifest.filename, documentId: promoted.documentId, versionId: version.id, chunks: processed.chunks, reused: false });
    }
    await this.preserveVidaFlexConflict(results);
    await this.audit.record('KNOWLEDGE_PRIVATE_QA_INGESTED', 'KnowledgeCollection', collection.id,
      { actorUserId: actor.id }, { documents: results.length, sourceHashes: dryRun.documents.map((item) => item.manifest.sha256) });
    return { collection, documents: results, manifest: dryRun.documents.map((item) => item.manifest) };
  }

  search(query: string, collectionId: string, actor: KnowledgeActor, limit = 5) {
    return this.knowledge.searchPrivateQa(query, actor, { collectionId, limit });
  }

  async assertHenryIsolation(actor: KnowledgeActor, privateChecksums: string[]) {
    const leaked = await this.db.knowledgeVersion.count({
      where: {
        checksum: { in: privateChecksums },
        OR: [{ status: 'PUBLISHED' }, { publicAllowed: true }, { document: { collection: { henryEnabled: true } } }],
      },
    });
    const search = await this.knowledge.search('PALIG PRIVATE QA canonical validation marker', actor, { limit: 12 });
    const returned = new Set(search.results.map((item) => item.citation.documentId));
    const privateIds = await this.db.knowledgeVersion.findMany({ where: { checksum: { in: privateChecksums } }, select: { documentId: true } });
    if (leaked || privateIds.some((item) => returned.has(item.documentId)))
      throw new Error('KNOWLEDGE_PRIVATE_QA_HENRY_LEAK');
    return { leaked: 0, henryResultsFromPrivateQa: 0 };
  }

  private async file(source: string, canonical: MarkdownCanonicalDocument) {
    const buffer = await readFile(resolve(source, canonical.manifest.filename));
    return { buffer, size: buffer.length, mimetype: 'text/markdown', originalname: canonical.manifest.filename } as Express.Multer.File;
  }

  private manifestMetadata(document: MarkdownCanonicalDocument): Prisma.InputJsonValue {
    return {
      privateQa: true,
      originalSource: document.manifest.sourceFilename,
      productOrTopic: document.manifest.productOrTopic,
      parserVersion: 'markdown-structural-v1',
      chunkerVersion: 'markdown-structural-v1',
      warnings: document.manifest.warnings,
      manifest: document.manifest,
    } as unknown as Prisma.InputJsonValue;
  }

  private async preserveVidaFlexConflict(results: Array<{ filename: string; versionId: string }>) {
    const legacy = results.find((item) => item.filename === 'Vida_Flex_MAX_CANONICAL.md');
    const dated = results.find((item) => item.filename === 'VIDA_FLEX_MAX_2026_CANONICAL.md');
    if (!legacy || !dated) throw new Error('KNOWLEDGE_PRIVATE_QA_VIDA_FLEX_PAIR_MISSING');
    const existing = await this.db.knowledgeConflict.findFirst({
      where: { type: 'VERSION_CONFLICT', topic: 'VIDA_FLEX_MAX_VERSION_VALIDITY',
        primaryVersionId: legacy.versionId, secondaryVersionId: dated.versionId },
    });
    if (!existing) await this.db.knowledgeConflict.create({ data: {
      type: 'VERSION_CONFLICT', topic: 'VIDA_FLEX_MAX_VERSION_VALIDITY',
      primaryVersionId: legacy.versionId, secondaryVersionId: dated.versionId,
      details: { reason: 'BOTH_SOURCES_REMAIN_UNKNOWN', resolution: 'HUMAN_REVIEW_REQUIRED' },
    } });
  }
}
