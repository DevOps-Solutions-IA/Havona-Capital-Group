import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@havona/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  cosineSimilarity,
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
  MALWARE_SCANNER,
  MalwareScanner,
  STORAGE_PROVIDER,
  StorageProvider,
} from './knowledge.providers';
import { KnowledgeActor, KNOWLEDGE_NOT_FOUND, KnowledgeSearchResult } from './knowledge.types';
import { KnowledgeQueueService } from './knowledge-queue.service';
import { canUseKnowledgeVersion, knowledgeValidityWarning } from './knowledge-governance';
import { resolveKnowledgeGovernance, type KnowledgeGovernanceInput } from './knowledge-governance';
import {
  CHUNKER_VERSION,
  DocumentExtractor,
  type ExtractedDocument,
} from './document-extraction.service';

type VersionGovernanceInput = KnowledgeGovernanceInput & {
  versionLabel?: string;
  documentDate?: string;
  authorizedProductId?: string;
  authorizedSolutionId?: string;
  productCode?: string;
  sourceLocator?: string;
  country?: string;
  notes?: string;
  customerNeedKeys?: string[];
};

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/html',
]);
const ROLE_CLASSIFICATIONS: Record<string, string[]> = {
  CONSULTOR: ['GENERAL', 'SALES', 'TRAINING', 'COMPLIANCE'],
  GERENTE: ['GENERAL', 'SALES', 'MANAGERS', 'TRAINING', 'COMPLIANCE'],
  ADMIN: ['GENERAL', 'SALES', 'MANAGERS', 'ADMINISTRATION', 'COMPLIANCE', 'TRAINING', 'TECHNOLOGY'],
  SUPER_ADMIN: [
    'GENERAL',
    'SALES',
    'MANAGERS',
    'ADMINISTRATION',
    'COMPLIANCE',
    'TRAINING',
    'TECHNOLOGY',
  ],
};
const normalizedWords = (value: string) =>
  new Set(
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü]+/gi, ' ')
      .split(/\s+/)
      .filter((item) => item.length > 2),
  );
const keywordScore = (query: string, content: string) => {
  const terms = normalizedWords(query),
    words = normalizedWords(content);
  if (!terms.size) return 0;
  return [...terms].filter((term) => words.has(term)).length / terms.size;
};
const injectionPattern =
  /(ignore|ignora).{0,30}(instructions|instrucciones)|system prompt|execute[_ ]sql|api[_ ]key/i;

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: KnowledgeQueueService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    private readonly extractor: DocumentExtractor,
  ) {}

  private classifications(actor: KnowledgeActor) {
    return [...new Set(actor.roles.flatMap((role) => ROLE_CLASSIFICATIONS[role] ?? []))];
  }
  private assert(permission: string, actor: KnowledgeActor) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('KNOWLEDGE_FORBIDDEN');
  }
  private canRead(
    document: {
      classification: string;
      collection: { allowedRoles: unknown };
      permissions?: Array<{ role: string | null; userId: string | null }>;
    },
    actor: KnowledgeActor,
  ) {
    if (!this.classifications(actor).includes(document.classification)) return false;
    const roles = Array.isArray(document.collection.allowedRoles)
      ? document.collection.allowedRoles.filter((item): item is string => typeof item === 'string')
      : [];
    const collectionAllowed = !roles.length || roles.some((role) => actor.roles.includes(role));
    const explicit = document.permissions ?? [];
    return (
      collectionAllowed &&
      (!explicit.length ||
        explicit.some(
          (item) => item.userId === actor.id || (item.role && actor.roles.includes(item.role)),
        ))
    );
  }

  list(actor: KnowledgeActor, query?: { status?: string; collectionId?: string }) {
    this.assert('knowledge.read', actor);
    return this.db.knowledgeDocument
      .findMany({
        where: {
          ...(query?.status ? { status: query.status as any } : {}),
          ...(query?.collectionId ? { collectionId: query.collectionId } : {}),
          classification: { in: this.classifications(actor) as any },
        },
        include: {
          collection: true,
          permissions: true,
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: { ingestions: { orderBy: { startedAt: 'desc' }, take: 1 } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      })
      .then((rows) => rows.filter((row) => this.canRead(row, actor)));
  }

  collections(actor: KnowledgeActor) {
    this.assert('knowledge.read', actor);
    return this.db.knowledgeCollection
      .findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
      .then((rows) =>
        rows.filter((row) => {
          const roles = Array.isArray(row.allowedRoles) ? row.allowedRoles : [];
          return (
            !roles.length ||
            roles.some((role) => typeof role === 'string' && actor.roles.includes(role))
          );
        }),
      );
  }
  createCollection(
    input: { key: string; name: string; description?: string; allowedRoles: string[] },
    actor: KnowledgeActor,
  ) {
    this.assert('knowledge.admin', actor);
    return this.db.knowledgeCollection.create({ data: input });
  }

  private validateFile(file?: Express.Multer.File) {
    const max = Number(process.env.KNOWLEDGE_MAX_FILE_SIZE ?? 15_000_000);
    if (!file || file.size <= 0 || file.size > max)
      throw new BadRequestException('KNOWLEDGE_FILE_SIZE_INVALID');
    if (!ALLOWED_MIME.has(file.mimetype)) throw new BadRequestException('KNOWLEDGE_MIME_INVALID');
    if (/\.(exe|js|sh|bat|cmd|com|msi)$/i.test(file.originalname))
      throw new BadRequestException('KNOWLEDGE_FILE_DANGEROUS');
  }

  private async assertClean(file: Express.Multer.File, checksum: string) {
    const result = await this.scanner.scan(file.buffer, { mimeType: file.mimetype, sha256: checksum });
    if (result.status !== 'CLEAN') {
      throw new BadRequestException(result.errorCode ?? `KNOWLEDGE_SCAN_${result.status}`);
    }
  }

  async createDocument(
    input: {
      title: string;
      description?: string;
      collectionId: string;
      classification: any;
      language?: string;
      effectiveFrom?: string;
      effectiveUntil?: string;
      changeSummary?: string;
    } & VersionGovernanceInput,
    file: Express.Multer.File,
    actor: KnowledgeActor,
    request?: any,
  ) {
    this.assert('knowledge.upload', actor);
    this.validateFile(file);
    const collection = await this.db.knowledgeCollection.findUnique({
      where: { id: input.collectionId },
    });
    if (!collection) throw new NotFoundException('KNOWLEDGE_COLLECTION_NOT_FOUND');
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.assertClean(file, checksum);
    const existing = await this.db.knowledgeVersion.findFirst({
      where: { checksum, document: { collectionId: input.collectionId } },
    });
    if (existing) throw new BadRequestException('KNOWLEDGE_DUPLICATE_CHECKSUM');
    const documentId = randomUUID(),
      versionId = randomUUID(),
      storageKey = `originals/${checksum}`;
    const governance = await this.resolveVersionGovernance(input);
    const storageCreated = !(await this.storage.exists(storageKey));
    if (storageCreated) await this.storage.put(storageKey, file.buffer);
    let persisted = false;
    try {
      const document = await this.db.knowledgeDocument.create({
        data: {
          id: documentId,
          collectionId: input.collectionId,
          title: input.title,
          description: input.description,
          type: file.mimetype,
          language: input.language ?? 'es',
          classification: input.classification,
          ownerUserId: actor.id,
          status: 'PROCESSING',
          versions: {
            create: {
              id: versionId,
              version: 1,
              checksum,
              storageKey,
              originalName: file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255),
              mimeType: file.mimetype,
              fileSize: file.size,
              effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
              effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
              changeSummary: input.changeSummary,
              ...governance,
              createdById: actor.id,
              ingestions: {
                create: {
                  status: 'UPLOAD',
                  stageLog: [{ stage: 'UPLOAD', at: new Date().toISOString() }],
                },
              },
            },
          },
        },
        include: { versions: true },
      });
      persisted = true;
      await this.queue.enqueue(versionId);
      await this.audit.record(
        'KNOWLEDGE_DOCUMENT_UPLOADED',
        'KnowledgeDocument',
        documentId,
        {
          actorUserId: actor.id,
          ipAddress: request?.ip,
          userAgent: request?.headers?.['user-agent'],
        },
        { checksum, mimeType: file.mimetype, size: file.size },
      );
      return this.getDocument(documentId, actor);
    } catch (error) {
      if (!persisted && storageCreated) await this.storage.delete(storageKey);
      throw error;
    }
  }

  async addVersion(
    documentId: string,
    input: { effectiveFrom?: string; effectiveUntil?: string; changeSummary: string } & VersionGovernanceInput,
    file: Express.Multer.File,
    actor: KnowledgeActor,
  ) {
    this.assert('knowledge.upload', actor);
    this.validateFile(file);
    const document = await this.db.knowledgeDocument.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!document) throw new NotFoundException('KNOWLEDGE_DOCUMENT_NOT_FOUND');
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.assertClean(file, checksum);
    if (await this.db.knowledgeVersion.findFirst({ where: { documentId, checksum } }))
      throw new BadRequestException('KNOWLEDGE_DUPLICATE_CHECKSUM');
    const version = (document.versions[0]?.version ?? 0) + 1,
      id = randomUUID(),
      storageKey = `originals/${checksum}`;
    const governance = await this.resolveVersionGovernance(input);
    const storageCreated = !(await this.storage.exists(storageKey));
    if (storageCreated) await this.storage.put(storageKey, file.buffer);
    let persisted = false;
    try {
      const row = await this.db.knowledgeVersion.create({
        data: {
          id,
          documentId,
          version,
          checksum,
          storageKey,
          originalName: file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255),
          mimeType: file.mimetype,
          fileSize: file.size,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
          changeSummary: input.changeSummary,
          ...governance,
          createdById: actor.id,
          ingestions: {
            create: {
              status: 'UPLOAD',
              stageLog: [{ stage: 'UPLOAD', at: new Date().toISOString() }],
            },
          },
        },
      });
      persisted = true;
      await this.db.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: 'PROCESSING' },
      });
      await this.queue.enqueue(row.id);
      return row;
    } catch (error) {
      if (!persisted && storageCreated) await this.storage.delete(storageKey);
      throw error;
    }
  }

  private async resolveVersionGovernance(input: VersionGovernanceInput) {
    const governance = resolveKnowledgeGovernance(input);
    const [product, solution, needs] = await Promise.all([
      input.authorizedProductId
        ? this.db.authorizedProduct.findUnique({ where: { id: input.authorizedProductId } })
        : null,
      input.authorizedSolutionId
        ? this.db.authorizedSolution.findUnique({
            where: { id: input.authorizedSolutionId },
            include: { product: true },
          })
        : null,
      input.customerNeedKeys?.length
        ? this.db.customerNeed.findMany({ where: { key: { in: input.customerNeedKeys as any } } })
        : [],
    ]);
    if (input.authorizedProductId && (!product || product.carrier !== 'PAN_AMERICAN_LIFE_COLOMBIA'))
      throw new BadRequestException('KNOWLEDGE_PRODUCT_NOT_AUTHORIZED');
    if (input.authorizedSolutionId && !solution)
      throw new BadRequestException('KNOWLEDGE_SOLUTION_NOT_AUTHORIZED');
    if (
      solution?.productId &&
      input.authorizedProductId &&
      solution.productId !== input.authorizedProductId
    )
      throw new BadRequestException('KNOWLEDGE_PRODUCT_SOLUTION_MISMATCH');
    if (solution?.product && solution.product.carrier !== 'PAN_AMERICAN_LIFE_COLOMBIA')
      throw new BadRequestException('KNOWLEDGE_PRODUCT_NOT_AUTHORIZED');
    if (
      governance.publicAllowed &&
      ((product && product.status !== 'ACTIVE') || (solution && solution.status !== 'ACTIVE'))
    )
      throw new BadRequestException('KNOWLEDGE_PUBLIC_CATALOG_INACTIVE');
    if (needs.length !== new Set(input.customerNeedKeys ?? []).size)
      throw new BadRequestException('KNOWLEDGE_NEED_NOT_AUTHORIZED');
    return {
      ...governance,
      carrier: input.carrier ?? product?.carrier ?? solution?.product?.carrier ?? null,
      versionLabel: input.versionLabel,
      documentDate: input.documentDate ? new Date(`${input.documentDate}T00:00:00.000Z`) : null,
      authorizedProductId: input.authorizedProductId,
      authorizedSolutionId: input.authorizedSolutionId,
      productCode: input.productCode,
      sourceLocator: input.sourceLocator,
      country: input.country ?? 'CO',
      notes: input.notes,
      customerNeeds: needs.length
        ? { create: needs.map((need) => ({ customerNeedId: need.id })) }
        : undefined,
    };
  }

  async addFact(
    versionId: string,
    input: {
      claimKey: string;
      subject: string;
      predicate: string;
      value: Prisma.InputJsonValue;
      productVariant?: string;
      plan?: string;
      conditions?: Prisma.InputJsonValue;
      customerSpecific?: boolean;
    },
    actor: KnowledgeActor,
  ) {
    this.assert('knowledge.review', actor);
    const version = await this.db.knowledgeVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('KNOWLEDGE_VERSION_NOT_FOUND');
    const competing = await this.db.knowledgeFact.findMany({
      where: {
        claimKey: input.claimKey,
        versionId: { not: versionId },
        version: {
          OR: [
            { documentId: version.documentId },
            ...(version.authorizedProductId
              ? [{ authorizedProductId: version.authorizedProductId }]
              : []),
          ],
        },
      },
      include: { version: true },
    });
    const conflicts = competing.filter(
      (fact) => JSON.stringify(fact.value) !== JSON.stringify(input.value),
    );
    return this.db.$transaction(async (tx) => {
      const fact = await tx.knowledgeFact.create({ data: { versionId, ...input } });
      if (version.currentStatus === 'UNKNOWN') {
        await tx.knowledgeConflict.create({
          data: {
            type: 'VALIDITY_UNKNOWN',
            topic: input.claimKey,
            primaryVersionId: versionId,
            details: { claimKey: input.claimKey },
          },
        });
      }
      for (const conflict of conflicts) {
        await tx.knowledgeConflict.create({
          data: {
            type:
              input.customerSpecific || conflict.customerSpecific
                ? 'CUSTOMER_SPECIFIC'
                : conflict.version.authorityRank === version.authorityRank
                  ? 'VERSION_CONFLICT'
                  : 'AUTHORITY_CONFLICT',
            topic: input.claimKey,
            primaryVersionId: versionId,
            secondaryVersionId: conflict.versionId,
            details: {
              claimKey: input.claimKey,
              primaryAuthorityRank: version.authorityRank,
              secondaryAuthorityRank: conflict.version.authorityRank,
            },
          },
        });
      }
      return {
        fact,
        conflictsCreated: conflicts.length + (version.currentStatus === 'UNKNOWN' ? 1 : 0),
      };
    });
  }

  private chunks(extracted: ExtractedDocument) {
    const chunks: Array<{
      section: string | null;
      content: string;
      pageStart: number | null;
      pageEnd: number | null;
      structuralType: 'TEXT' | 'TABLE' | 'MIXED';
      extractionMethods: string[];
      warnings: string[];
      structure: Prisma.InputJsonValue | null;
    }> = [];
    const appendText = (
      text: string,
      metadata: Omit<(typeof chunks)[number], 'content'>,
    ) => {
      const blocks = text.replace(/\r/g, '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
      let current = '';
      for (const block of blocks) {
        if (`${current}\n\n${block}`.length > 1400 && current) {
          chunks.push({ ...metadata, content: current });
          current = block;
        } else current = current ? `${current}\n\n${block}` : block;
      }
      if (current) chunks.push({ ...metadata, content: current });
    };
    if (extracted.pageCount === null) {
      appendText(extracted.documentText ?? '', {
        section: null, pageStart: null, pageEnd: null, structuralType: 'TEXT',
        extractionMethods: ['NATIVE'], warnings: extracted.documentWarnings,
        structure: null,
      });
      return chunks;
    }
    for (const page of extracted.pages) {
      if (page.finalText) appendText(page.finalText, {
        section: page.section,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        structuralType: page.tables.length ? 'MIXED' : 'TEXT',
        extractionMethods: [page.extractionMethod],
        warnings: page.warnings,
        structure: null,
      });
      for (const table of page.tables) chunks.push({
        section: page.section,
        content: table.rawText,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        structuralType: 'TABLE',
        extractionMethods: [page.extractionMethod],
        warnings: table.warnings,
        structure: table as unknown as Prisma.InputJsonValue,
      });
    }
    return chunks;
  }
  async processVersion(versionId: string) {
    const processStartedAt = new Date();
    const version = await this.db.knowledgeVersion.findUnique({
      where: { id: versionId },
      include: { ingestions: { orderBy: { startedAt: 'desc' }, take: 1 }, document: true },
    });
    if (!version?.storageKey) throw new NotFoundException('KNOWLEDGE_VERSION_NOT_FOUND');
    const ingestion = version.ingestions[0];
    if (!ingestion) throw new Error('KNOWLEDGE_INGESTION_NOT_FOUND');
    const log = [{ stage: 'VALIDATION', at: new Date().toISOString() }];
    try {
      const buffer = await this.storage.get(version.storageKey);
      const extracted = await this.extractor.extract(buffer, version.mimeType);
      log.push({ stage: 'EXTRACTION', at: new Date().toISOString() });
      const chunks = this.chunks(extracted);
      const failedPages = extracted.pages.filter((page) => page.extractionStatus === 'FAILED').length;
      const charactersExtracted = extracted.pageCount === null
        ? extracted.documentText?.length ?? 0
        : extracted.pages.reduce((total, page) => total + page.characterCount, 0);
      if (!failedPages && charactersExtracted < 20 && !extracted.pages.every((page) => page.extractionStatus === 'EMPTY_CONFIRMED'))
        throw new Error('KNOWLEDGE_EXTRACTION_EMPTY');
      log.push({ stage: 'CHUNKING', at: new Date().toISOString() });
      const vectors = failedPages ? [] : await this.embeddings.embed(chunks.map((item) => item.content));
      const existingReport = await this.db.knowledgeExtractionReport.findUnique({ where: { versionId } });
      const reportId = existingReport?.id ?? randomUUID();
      const reportData = {
        status: failedPages ? 'FAILED' as const : 'COMPLETED' as const,
        mimeType: extracted.mimeType,
        totalPages: extracted.pageCount,
        nativePages: extracted.pages.filter((page) => page.extractionStatus === 'EXTRACTED_NATIVE').length,
        ocrPages: extracted.pages.filter((page) => page.extractionStatus === 'EXTRACTED_OCR').length,
        mixedPages: extracted.pages.filter((page) => page.extractionStatus === 'EXTRACTED_MIXED').length,
        emptyConfirmedPages: extracted.pages.filter((page) => page.extractionStatus === 'EMPTY_CONFIRMED').length,
        failedPages,
        pagesWithWarnings: extracted.pages.filter((page) => page.warnings.length).length,
        charactersExtracted,
        tablesDetected: extracted.pages.reduce((total, page) => total + page.tables.length, 0),
        documentWarnings: extracted.documentWarnings as Prisma.InputJsonValue,
        extractorVersion: extracted.extractionMetadata.extractorVersion,
        ocrProvider: extracted.extractionMetadata.ocrProvider,
        ocrVersion: extracted.extractionMetadata.ocrVersion,
        chunkerVersion: CHUNKER_VERSION,
        extractionStartedAt: extracted.extractionMetadata.startedAt,
        extractionCompletedAt: extracted.extractionMetadata.completedAt,
      };
      await this.db.$transaction([
        this.db.knowledgeChunk.deleteMany({ where: { versionId } }),
        this.db.knowledgePageExtraction.deleteMany({ where: { reportId } }),
        this.db.knowledgeExtractionReport.upsert({
          where: { versionId },
          create: { id: reportId, versionId, ...reportData },
          update: reportData,
        }),
        ...extracted.pages.map((page) => this.db.knowledgePageExtraction.create({ data: {
          reportId,
          pageNumber: page.pageNumber,
          status: page.extractionStatus,
          extractionMethod: page.extractionMethod,
          nativeCharacters: page.nativeText.length,
          finalCharacters: page.characterCount,
          tablesDetected: page.tables.length,
          warnings: page.warnings as Prisma.InputJsonValue,
          blocks: page.blocks as unknown as Prisma.InputJsonValue,
          tables: page.tables as unknown as Prisma.InputJsonValue,
        } })),
        ...(!failedPages ? chunks : []).map((item, index) =>
          this.db.knowledgeChunk.create({
            data: {
              versionId,
              position: index,
              section: item.section,
              pageStart: item.pageStart,
              pageEnd: item.pageEnd,
              structuralType: item.structuralType,
              extractionMethods: item.extractionMethods,
              extractionWarnings: item.warnings,
              structure: item.structure ?? Prisma.JsonNull,
              content: item.content,
              textHash: createHash('sha256').update(item.content).digest('hex'),
              tokenEstimate: Math.ceil(item.content.length / 4),
              embedding: vectors[index] ?? [],
              embeddingModel: this.embeddings.model,
              embeddingDimension: this.embeddings.dimension,
              embeddedAt: new Date(),
            },
          }),
        ),
        this.db.knowledgeVersion.update({ where: { id: versionId }, data: { status: failedPages ? 'FAILED' : 'REVIEW' } }),
        this.db.knowledgeDocument.update({
          where: { id: version.documentId },
          data: { status: failedPages ? 'FAILED' : 'REVIEW' },
        }),
        this.db.knowledgeIngestion.update({
          where: { id: ingestion.id },
          data: {
            status: failedPages ? 'FAILED' : 'REVIEW',
            stageLog: [
              ...log,
              { stage: 'EMBEDDING', at: new Date().toISOString() },
              { stage: 'REVIEW', at: new Date().toISOString() },
            ],
            completedAt: new Date(),
          },
        }),
      ]);
      if (failedPages) throw new BadRequestException('KNOWLEDGE_EXTRACTION_PAGE_FAILED');
      return { chunks: chunks.length, status: 'REVIEW' };
    } catch (error) {
      const code =
        error instanceof Error ? error.message.slice(0, 100) : 'KNOWLEDGE_INGESTION_FAILED';
      const report = await this.db.knowledgeExtractionReport.findUnique({ where: { versionId } });
      if (!report) await this.db.knowledgeExtractionReport.create({
        data: {
          versionId,
          status: 'FAILED',
          mimeType: version.mimeType,
          failedPages: 0,
          documentWarnings: [code],
          extractorVersion: 'unavailable-after-failure',
          chunkerVersion: CHUNKER_VERSION,
          extractionStartedAt: processStartedAt,
          extractionCompletedAt: new Date(),
        },
      });
      await this.db.$transaction([
        this.db.knowledgeVersion.update({ where: { id: versionId }, data: { status: 'FAILED' } }),
        this.db.knowledgeDocument.update({
          where: { id: version.documentId },
          data: { status: 'FAILED' },
        }),
        this.db.knowledgeIngestion.update({
          where: { id: ingestion.id },
          data: {
            status: 'FAILED',
            errorCode: code,
            errorMessage: 'La ingesta falló; consulte observabilidad técnica.',
            attempts: { increment: 1 },
            stageLog: log,
            completedAt: new Date(),
          },
        }),
      ]);
      throw new BadRequestException(code);
    }
  }

  async approve(documentId: string, actor: KnowledgeActor, request?: any) {
    this.assert('knowledge.review', actor);
    const document = await this.db.knowledgeDocument.findUnique({
      where: { id: documentId },
      include: { versions: { where: { status: 'REVIEW' }, orderBy: { version: 'desc' }, take: 1 } },
    });
    const version = document?.versions[0];
    if (!document || !version) throw new BadRequestException('KNOWLEDGE_NOT_READY_FOR_APPROVAL');
    await this.db.$transaction([
      this.db.knowledgeVersion.update({
        where: { id: version.id },
        data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
      }),
      this.db.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: 'APPROVED' },
      }),
    ]);
    await this.audit.record(
      'KNOWLEDGE_DOCUMENT_APPROVED',
      'KnowledgeDocument',
      documentId,
      {
        actorUserId: actor.id,
        ipAddress: request?.ip,
        userAgent: request?.headers?.['user-agent'],
      },
      { version: version.version },
    );
    return { documentId, version: version.version, status: 'APPROVED' };
  }

  async publish(documentId: string, actor: KnowledgeActor, request?: any) {
    this.assert('knowledge.publish', actor);
    const document = await this.db.knowledgeDocument.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          where: { status: 'APPROVED' }, orderBy: { version: 'desc' }, take: 1,
          include: { extractionReport: true },
        },
        stagedAssets: { select: { sha256: true } },
      },
    });
    const version = document?.versions[0];
    if (!document || !version) throw new BadRequestException('KNOWLEDGE_NOT_READY_FOR_PUBLISH');
    if (!version.extractionReport || version.extractionReport.status !== 'COMPLETED')
      throw new BadRequestException('KNOWLEDGE_EXTRACTION_NOT_COMPLETED');
    if (version.extractionReport.failedPages > 0)
      throw new BadRequestException('KNOWLEDGE_EXTRACTION_PAGE_FAILED');
    if (document.stagedAssets.some((asset) => asset.sha256 !== version.checksum))
      throw new BadRequestException('KNOWLEDGE_CANONICAL_CONSISTENCY_FAILED');
    await this.db.$transaction([
      this.db.knowledgeVersion.updateMany({
        where: { documentId, status: 'PUBLISHED' },
        data: { status: 'DEPRECATED' },
      }),
      this.db.knowledgeVersion.update({
        where: { id: version.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      }),
      this.db.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: 'PUBLISHED', currentVersion: version.version },
      }),
    ]);
    await this.audit.record(
      'KNOWLEDGE_DOCUMENT_PUBLISHED',
      'KnowledgeDocument',
      documentId,
      {
        actorUserId: actor.id,
        ipAddress: request?.ip,
        userAgent: request?.headers?.['user-agent'],
      },
      { version: version.version },
    );
    return { documentId, version: version.version, status: 'PUBLISHED' };
  }
  async deprecate(documentId: string, actor: KnowledgeActor) {
    this.assert('knowledge.publish', actor);
    await this.db.$transaction([
      this.db.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: 'DEPRECATED' },
      }),
      this.db.knowledgeVersion.updateMany({
        where: { documentId, status: 'PUBLISHED' },
        data: { status: 'DEPRECATED' },
      }),
    ]);
    return { documentId, status: 'DEPRECATED' };
  }

  async getDocument(id: string, actor: KnowledgeActor) {
    this.assert('knowledge.read', actor);
    const row = await this.db.knowledgeDocument.findUnique({
      where: { id },
      include: {
        collection: true,
        permissions: true,
        versions: {
          orderBy: { version: 'desc' },
          include: {
            ingestions: { orderBy: { startedAt: 'desc' }, take: 1 },
            extractionReport: { include: { pages: { orderBy: { pageNumber: 'asc' } } } },
          },
        },
      },
    });
    if (!row || !this.canRead(row, actor))
      throw new NotFoundException('KNOWLEDGE_DOCUMENT_NOT_FOUND');
    return row;
  }

  async search(
    query: string,
    actor: KnowledgeActor,
    options?: { historicalAt?: string; collectionId?: string; limit?: number },
  ): Promise<KnowledgeSearchResult> {
    this.assert('knowledge.read', actor);
    const queryVector = (await this.embeddings.embed([query]))[0] ?? [];
    const now = options?.historicalAt ? new Date(options.historicalAt) : new Date();
    const rows = await this.db.knowledgeChunk.findMany({
      where: {
        version: {
          status: options?.historicalAt ? { in: ['PUBLISHED', 'DEPRECATED'] } : 'PUBLISHED',
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
          ],
          document: {
            ...(options?.collectionId ? { collectionId: options.collectionId } : {}),
            classification: { in: this.classifications(actor) as any },
          },
        },
      },
      include: {
        version: {
          include: {
            document: { include: { collection: true, permissions: true } },
            authorizedProduct: { select: { id: true, name: true } },
            authorizedSolution: { select: { id: true, name: true } },
            customerNeeds: { include: { customerNeed: { select: { key: true } } } },
            conflictsAsPrimary: {
              where: { status: 'OPEN' },
              select: { type: true, topic: true },
            },
            conflictsAsSecondary: {
              where: { status: 'OPEN' },
              select: { type: true, topic: true },
            },
          },
        },
      },
      take: 2000,
    });
    const ranked = rows
      .filter(
        (row) =>
          this.canRead(row.version.document, actor) && canUseKnowledgeVersion(row.version, actor),
      )
      .map((row) => {
        const vector = Array.isArray(row.embedding)
          ? row.embedding.filter((item): item is number => typeof item === 'number')
          : [];
        const semantic = cosineSimilarity(queryVector, vector),
          keyword = keywordScore(query, row.content);
        return { row, score: semantic * 0.55 + keyword * 0.45 };
      })
      .filter((item) => item.score >= Number(process.env.RAG_MIN_SCORE ?? 0.18))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(options?.limit ?? 6, Number(process.env.RAG_MAX_CHUNKS ?? 8)));
    if (!ranked.length) {
      await this.recordGap(query, actor);
      return {
        query,
        answerStatus: 'INSUFFICIENT',
        confidence: 'INSUFFICIENT',
        results: [],
        message: KNOWLEDGE_NOT_FOUND,
      };
    }
    const suspicious = ranked.filter((item) => injectionPattern.test(item.row.content));
    if (suspicious.length)
      console.warn(
        JSON.stringify({
          event: 'knowledge_prompt_injection_pattern',
          chunkIds: suspicious.map((item) => item.row.id),
          actorId: actor.id,
        }),
      );
    const results = ranked.map(({ row, score }) => ({
      score,
      content: row.content,
      citation: {
        documentId: row.version.document.id,
        title: row.version.document.title,
        version: row.version.version,
        section: row.section,
        page: row.pageStart,
        chunkId: row.id,
        snippet: row.content.slice(0, 280),
        sourceType: row.version.sourceType,
        authorityRank: row.version.authorityRank,
        versionLabel: row.version.versionLabel,
        currentStatus: row.version.currentStatus,
        effectiveFrom: row.version.effectiveFrom,
        effectiveUntil: row.version.effectiveUntil,
        product: row.version.authorizedProduct,
        solution: row.version.authorizedSolution,
        customerNeeds: row.version.customerNeeds.map((item) => item.customerNeed.key),
        conflicts: [
          ...row.version.conflictsAsPrimary,
          ...row.version.conflictsAsSecondary,
        ],
        warning: knowledgeValidityWarning(row.version.currentStatus),
      },
    }));
    const topDocs = new Map(
      results
        .slice(0, 4)
        .map((item) => [
          item.citation.documentId,
          { title: item.citation.title, version: item.citation.version },
        ]),
    );
    const explicitConflict = results.some((item) => item.citation.conflicts.length > 0);
    const heuristicConflict = topDocs.size > 1 &&
      results.slice(0, 2).every((item) => item.score >= 0.65) &&
      /\b(no|prohibido|excluye)\b/i.test(results[0]!.content) !==
        /\b(no|prohibido|excluye)\b/i.test(results[1]!.content);
    const conflict = explicitConflict || heuristicConflict;
    return {
      query,
      answerStatus: conflict ? 'CONFLICT' : 'GROUNDED',
      confidence: conflict
        ? 'LOW'
        : results[0]!.score >= 0.72 && topDocs.size >= 2
          ? 'HIGH'
          : results[0]!.score >= 0.45
            ? 'MEDIUM'
            : 'LOW',
      results,
      ...(conflict ? { conflict: { documents: [...topDocs.values()] } } : {}),
    };
  }
  private async recordGap(query: string, actor: KnowledgeActor) {
    const topic =
      [...normalizedWords(query)].sort().slice(0, 12).join(' ').slice(0, 200) ||
      'consulta-sin-terminos';
    const existing = await this.db.knowledgeGap.findUnique({ where: { normalizedTopic: topic } });
    const samples =
      existing && Array.isArray(existing.sampleQueries)
        ? existing.sampleQueries
            .filter((item): item is string => typeof item === 'string')
            .slice(-4)
        : [];
    await this.db.knowledgeGap.upsert({
      where: { normalizedTopic: topic },
      create: {
        normalizedTopic: topic,
        sampleQueries: [...samples, query.slice(0, 200)],
        rolesAffected: actor.roles,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: new Date(),
        sampleQueries: [...samples, query.slice(0, 200)],
        rolesAffected: actor.roles,
      },
    });
  }
  gaps(actor: KnowledgeActor) {
    this.assert('knowledge.admin', actor);
    return this.db.knowledgeGap.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
      take: 100,
    });
  }
}
