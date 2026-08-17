import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { resolveKnowledgeGovernance, type KnowledgeGovernanceInput } from './knowledge-governance';
import { MALWARE_SCANNER, MalwareScanner, STORAGE_PROVIDER, StorageProvider } from './knowledge.providers';
import { KnowledgeService } from './knowledge.service';
import type { KnowledgeActor } from './knowledge.types';

type StageProposal = KnowledgeGovernanceInput & {
  documentDate?: string;
  versionLabel?: string;
  authorizedProductId?: string;
  authorizedSolutionId?: string;
  customerNeedKeys?: string[];
  country?: string;
  notes?: string;
};

@Injectable()
export class KnowledgeStagingService {
  private readonly logger = new Logger(KnowledgeStagingService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly knowledge: KnowledgeService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async stage(file: Express.Multer.File, proposal: StageProposal, actor: KnowledgeActor) {
    if (!actor.permissions.includes('knowledge.upload')) throw new BadRequestException('KNOWLEDGE_FORBIDDEN');
    if (!file?.buffer?.length) throw new BadRequestException('KNOWLEDGE_FILE_SIZE_INVALID');
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.db.knowledgeStagedAsset.findFirst({
      where: { sha256 },
      orderBy: { createdAt: 'asc' },
    });
    const scan = duplicate
      ? { status: duplicate.scanStatus, errorCode: duplicate.errorCode }
      : await this.scanner.scan(file.buffer, { mimeType: file.mimetype, sha256 });
    const clean = scan.status === 'CLEAN';
    const storageKey = duplicate?.storageKey ?? `${clean ? 'originals' : 'quarantine'}/${sha256}`;
    const storageCreated = !duplicate && !(await this.storage.exists(storageKey));
    if (storageCreated) await this.storage.put(storageKey, file.buffer);
    try {
      const governance = resolveKnowledgeGovernance({
        ...proposal,
        currentStatus: proposal.currentStatus ?? 'UNKNOWN',
        publicAllowed: false,
      });
      const staged = await this.db.knowledgeStagedAsset.create({
        data: {
          sha256,
          originalFilename: file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255),
          mimeType: file.mimetype,
          fileSize: file.size,
          storageKey,
          status: duplicate ? 'DUPLICATE' : clean ? 'READY_FOR_REVIEW' : 'STAGED',
          scanStatus: scan.status,
          duplicateOfId: duplicate?.id,
          proposedSourceType: governance.sourceType,
          proposedAuthorityLevel: governance.authorityLevel,
          proposedCurrentStatus: 'UNKNOWN',
          proposedDocumentDate: proposal.documentDate
            ? new Date(`${proposal.documentDate}T00:00:00.000Z`)
            : null,
          proposedVersionLabel: proposal.versionLabel,
          proposedAuthorizedProductId: proposal.authorizedProductId,
          proposedAuthorizedSolutionId: proposal.authorizedSolutionId,
          proposedCustomerNeeds: proposal.customerNeedKeys ?? [],
          proposedPublicAllowed: false,
          proposedConsultantAllowed: governance.consultantAllowed,
          proposedManagerAllowed: governance.managerAllowed,
          proposedTrainingAllowed: governance.trainingAllowed,
          carrier: proposal.carrier ?? null,
          country: proposal.country ?? 'CO',
          notes: proposal.notes,
          errorCode: scan.errorCode,
          createdById: actor.id,
        },
        select: this.safeSelection(),
      });
      this.logger.log({ event: duplicate ? 'knowledge.staging.duplicate' : 'knowledge.staging.created', stagingId: staged.id, scanStatus: staged.scanStatus });
      await this.audit.record('KNOWLEDGE_STAGING_CREATED', 'KnowledgeStagedAsset', staged.id,
        { actorUserId: actor.id }, { sha256, duplicate: Boolean(duplicate), scanStatus: staged.scanStatus });
      return staged;
    } catch (error) {
      if (storageCreated) {
        await this.storage.delete(storageKey).catch(() =>
          this.logger.error({ event: 'knowledge.storage.cleanup_failed', objectHash: sha256 }),
        );
      }
      throw error;
    }
  }

  list(actor: KnowledgeActor) {
    if (!actor.permissions.includes('knowledge.review')) throw new BadRequestException('KNOWLEDGE_FORBIDDEN');
    return this.db.knowledgeStagedAsset.findMany({
      select: this.safeSelection(), orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async review(id: string, input: StageProposal & { approved: boolean }, actor: KnowledgeActor) {
    if (!actor.permissions.includes('knowledge.review')) throw new BadRequestException('KNOWLEDGE_FORBIDDEN');
    const staged = await this.db.knowledgeStagedAsset.findUnique({ where: { id } });
    if (!staged) throw new NotFoundException('KNOWLEDGE_STAGING_NOT_FOUND');
    if (input.approved && staged.scanStatus !== 'CLEAN')
      throw new BadRequestException('KNOWLEDGE_STAGING_SCAN_BLOCKED');
    const governance = resolveKnowledgeGovernance(input);
    return this.db.knowledgeStagedAsset.update({
      where: { id },
      data: {
        reviewStatus: input.approved ? 'APPROVED' : 'REJECTED',
        reviewedById: actor.id,
        reviewedAt: new Date(),
        proposedSourceType: governance.sourceType,
        proposedAuthorityLevel: governance.authorityLevel,
        proposedCurrentStatus: input.currentStatus ?? 'UNKNOWN',
        proposedDocumentDate: input.documentDate ? new Date(`${input.documentDate}T00:00:00.000Z`) : undefined,
        proposedVersionLabel: input.versionLabel,
        proposedAuthorizedProductId: input.authorizedProductId,
        proposedAuthorizedSolutionId: input.authorizedSolutionId,
        proposedCustomerNeeds: input.customerNeedKeys ?? undefined,
        proposedPublicAllowed: governance.publicAllowed,
        proposedConsultantAllowed: governance.consultantAllowed,
        proposedManagerAllowed: governance.managerAllowed,
        proposedTrainingAllowed: governance.trainingAllowed,
        carrier: input.carrier,
        country: input.country,
        notes: input.notes,
      },
      select: this.safeSelection(),
    });
  }

  async promote(
    id: string,
    input: { title: string; collectionId: string; classification: any; description?: string },
    actor: KnowledgeActor,
    processingMode: 'QUEUE' | 'MANUAL' = 'QUEUE',
  ) {
    const staged = await this.db.knowledgeStagedAsset.findUnique({ where: { id } });
    if (!staged) throw new NotFoundException('KNOWLEDGE_STAGING_NOT_FOUND');
    if (staged.scanStatus !== 'CLEAN' || staged.reviewStatus !== 'APPROVED')
      throw new BadRequestException('KNOWLEDGE_STAGING_NOT_APPROVED');
    if (staged.status === 'PROMOTED') throw new BadRequestException('KNOWLEDGE_STAGING_ALREADY_PROMOTED');
    if (staged.duplicateOfId) {
      const canonical = await this.db.knowledgeStagedAsset.findUnique({
        where: { id: staged.duplicateOfId },
        select: { sha256: true, promotedDocumentId: true, status: true },
      });
      if (!canonical || canonical.sha256 !== staged.sha256)
        throw new BadRequestException('KNOWLEDGE_CANONICAL_CONSISTENCY_FAILED');
      if (!canonical.promotedDocumentId || canonical.status !== 'PROMOTED')
        throw new BadRequestException('KNOWLEDGE_CANONICAL_NOT_PROMOTED');
      await this.db.knowledgeStagedAsset.update({
        where: { id }, data: { status: 'PROMOTED', promotedDocumentId: canonical.promotedDocumentId },
      });
      await this.audit.record(
        'KNOWLEDGE_STAGING_CANONICAL_LINKED', 'KnowledgeStagedAsset', id,
        { actorUserId: actor.id },
        { canonicalStagingId: staged.duplicateOfId, documentId: canonical.promotedDocumentId },
      );
      return { stagingId: id, documentId: canonical.promotedDocumentId, status: 'CANONICAL_LINKED' };
    }
    const buffer = await this.storage.get(staged.storageKey);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    if (checksum !== staged.sha256 || buffer.length !== staged.fileSize)
      throw new BadRequestException('KNOWLEDGE_STORAGE_INTEGRITY_FAILED');
    const needs = Array.isArray(staged.proposedCustomerNeeds)
      ? staged.proposedCustomerNeeds.filter((item): item is string => typeof item === 'string')
      : [];
    const document = await this.knowledge.createDocument({
      ...input,
      sourceType: staged.proposedSourceType ?? undefined,
      authorityLevel: staged.proposedAuthorityLevel ?? undefined,
      currentStatus: staged.proposedCurrentStatus,
      publicAllowed: staged.proposedPublicAllowed,
      consultantAllowed: staged.proposedConsultantAllowed,
      managerAllowed: staged.proposedManagerAllowed,
      trainingAllowed: staged.proposedTrainingAllowed,
      carrier: staged.carrier ?? undefined,
      authorizedProductId: staged.proposedAuthorizedProductId ?? undefined,
      authorizedSolutionId: staged.proposedAuthorizedSolutionId ?? undefined,
      customerNeedKeys: needs,
      documentDate: staged.proposedDocumentDate?.toISOString().slice(0, 10),
      versionLabel: staged.proposedVersionLabel ?? undefined,
      notes: staged.notes ?? undefined,
    }, {
      buffer, size: buffer.length, mimetype: staged.mimeType,
      originalname: staged.originalFilename,
    } as Express.Multer.File, actor, undefined, processingMode);
    await this.db.knowledgeStagedAsset.update({
      where: { id }, data: { status: 'PROMOTED', promotedDocumentId: document.id },
    });
    return { stagingId: id, documentId: document.id, status: 'PROCESSING' };
  }

  private safeSelection() {
    return {
      id: true, sha256: true, originalFilename: true, mimeType: true, fileSize: true,
      status: true, scanStatus: true, reviewStatus: true, duplicateOfId: true,
      proposedSourceType: true, proposedAuthorityLevel: true, proposedCurrentStatus: true,
      proposedDocumentDate: true, proposedVersionLabel: true, proposedAuthorizedProductId: true,
      proposedAuthorizedSolutionId: true, proposedCustomerNeeds: true,
      proposedPublicAllowed: true, proposedConsultantAllowed: true, proposedManagerAllowed: true,
      proposedTrainingAllowed: true, carrier: true, country: true, notes: true, errorCode: true,
      promotedDocumentId: true, createdAt: true, updatedAt: true,
    } as const;
  }
}
