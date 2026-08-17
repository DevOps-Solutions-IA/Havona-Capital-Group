import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
import { parseCanonicalMarkdown, type MarkdownCanonicalDocument } from './markdown-canonical.service';

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertJsonSafe(value: unknown, field: string): void {
  if (value === undefined) throw new Error(`${field}:UNDEFINED`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${field}:NON_FINITE_NUMBER`);
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol')
    throw new Error(`${field}:NON_JSON_TYPE`);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error(`${field}:SPARSE_ARRAY`);
    value.forEach((item, index) => assertJsonSafe(item, `${field}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new Error(`${field}:INVALID_DATE`);
      return;
    }
    for (const [key, item] of Object.entries(value)) assertJsonSafe(item, `${field}.${key}`);
  }
}

export function validateKnowledgeChunkCreateManyPayload(
  rows: Prisma.KnowledgeChunkCreateManyInput[],
  expectedDimension: number,
) {
  rows.forEach((row, chunkIndex) => {
    const fail = (field: string, reason: string): never => {
      throw new Error(`KNOWLEDGE_CHUNK_PAYLOAD_INVALID:chunk=${chunkIndex}:field=${field}:reason=${reason}`);
    };
    if (typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)) fail('id', 'UUID');
    if (!UUID_PATTERN.test(row.versionId)) fail('versionId', 'UUID');
    if (!Number.isInteger(row.position) || row.position < 0) fail('position', 'INTEGER');
    if (row.section && row.section.length > 300) fail('section', 'MAX_LENGTH_300');
    if (typeof row.structuralType !== 'string' || !['TEXT', 'TABLE', 'MIXED'].includes(row.structuralType))
      fail('structuralType', 'ENUM');
    if (!row.textHash || row.textHash.length !== 64) fail('textHash', 'SHA256');
    if (!Number.isInteger(row.tokenEstimate) || row.tokenEstimate < 0) fail('tokenEstimate', 'INTEGER');
    if (row.embeddingModel && row.embeddingModel.length > 160) fail('embeddingModel', 'MAX_LENGTH_160');
    if (row.embeddingDimension !== expectedDimension) fail('embeddingDimension', 'DIMENSION');
    if (!(row.embeddedAt instanceof Date) || Number.isNaN(row.embeddedAt.getTime())) fail('embeddedAt', 'DATE');
    for (const field of ['headingPath', 'extractionMethods', 'extractionWarnings', 'structure', 'embedding'] as const) {
      try { assertJsonSafe(row[field], field); } catch (error) {
        fail(field, error instanceof Error ? error.message : 'JSON');
      }
    }
    const embedding = row.embedding as unknown;
    if (!Array.isArray(embedding) || embedding.length !== expectedDimension) fail('embedding', 'VECTOR_DIMENSION');
  });
}

function safePrismaDiagnostic(error: unknown) {
  const candidate = error as { name?: string; code?: string; meta?: unknown; clientVersion?: string; message?: string };
  const message = candidate.message ?? String(error);
  const terminal = message.match(/\n(?:Argument|Invalid value|Unknown argument|Error parsing)[\s\S]*$/)?.[0]?.trim();
  return {
    name: candidate.name ?? 'UnknownError',
    code: candidate.code ?? null,
    meta: candidate.meta ?? null,
    clientVersion: candidate.clientVersion ?? null,
    message: terminal ?? message.replace(/(\bdata:\s*)[\s\S]*/m, '$1[PAYLOAD_REDACTED]'),
    messageHash: createHash('sha256').update(message).digest('hex'),
  };
}
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
const tableQueryPattern =
  /\b(tabla|tarif(?:a|as|ario)|prima(?:s)?|plan(?:es)?|edad(?:es)?|ingreso|permanencia|valor(?:es)? asegurad(?:o|os|a|as)|suma(?:s)? asegurad(?:a|as))\b/i;

export const hybridKnowledgeScore = (input: {
  query: string;
  content: string;
  title: string;
  section: string | null;
  headingPath: unknown;
  structuralType: 'TEXT' | 'TABLE' | 'MIXED';
  semantic: number;
}) => {
  const headingPath = Array.isArray(input.headingPath)
    ? input.headingPath.filter((item): item is string => typeof item === 'string').join(' ')
    : '';
  const context = [input.title, input.section ?? '', headingPath].join(' ');
  const structural = tableQueryPattern.test(input.query) && input.structuralType === 'TABLE' ? 1 : 0;
  return input.semantic * 0.48 + keywordScore(input.query, input.content) * 0.3 +
    keywordScore(input.query, context) * 0.14 + structural * 0.08;
};
const injectionPattern =
  /(ignore|ignora).{0,30}(instructions|instrucciones)|system prompt|execute[_ ]sql|api[_ ]key/i;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
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
    processingMode: 'QUEUE' | 'MANUAL' = 'QUEUE',
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
      if (processingMode === 'QUEUE') await this.queue.enqueue(versionId);
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

  private chunks(extracted: ExtractedDocument, markdown?: MarkdownCanonicalDocument) {
    const chunks: Array<{
      section: string | null;
      content: string;
      pageStart: number | null;
      pageEnd: number | null;
      structuralType: 'TEXT' | 'TABLE' | 'MIXED';
      extractionMethods: string[];
      warnings: string[];
      structure: Prisma.InputJsonValue | null;
      headingPath: string[];
    }> = [];
    if (markdown) {
      return markdown.chunks.map((chunk) => ({
        section: chunk.section,
        content: chunk.content,
        pageStart: null,
        pageEnd: null,
        structuralType: chunk.structuralType,
        extractionMethods: ['NATIVE'],
        warnings: chunk.warnings,
        structure: chunk.structuralType === 'TABLE'
          ? ({ markdown: chunk.content, headingPath: chunk.headingPath } as Prisma.InputJsonValue)
          : null,
        headingPath: chunk.headingPath,
      }));
    }
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
        headingPath: [],
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
        headingPath: page.section ? [page.section] : [],
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
        headingPath: page.section ? [page.section] : [],
      });
    }
    return chunks;
  }
  async processVersion(versionId: string) {
    const processStartedAt = new Date();
    let attemptedChunkCount = 0;
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
      const markdown = version.mimeType === 'text/markdown'
        ? parseCanonicalMarkdown(version.originalName, buffer)
        : undefined;
      const chunks = this.chunks(extracted, markdown);
      attemptedChunkCount = chunks.length;
      const failedPages = extracted.pages.filter((page) => page.extractionStatus === 'FAILED').length;
      const charactersExtracted = extracted.pageCount === null
        ? extracted.documentText?.length ?? 0
        : extracted.pages.reduce((total, page) => total + page.characterCount, 0);
      if (!failedPages && charactersExtracted < 20 && !extracted.pages.every((page) => page.extractionStatus === 'EMPTY_CONFIRMED'))
        throw new Error('KNOWLEDGE_EXTRACTION_EMPTY');
      log.push({ stage: 'CHUNKING', at: new Date().toISOString() });
      const vectors = failedPages ? [] : await this.embeddings.embed(chunks.map((item) => item.content));
      const chunkRows: Prisma.KnowledgeChunkCreateManyInput[] = (!failedPages ? chunks : []).map((item, index) => ({
        id: randomUUID(),
        versionId,
        position: index,
        section: item.section,
        headingPath: item.headingPath,
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
      }));
      validateKnowledgeChunkCreateManyPayload(chunkRows, this.embeddings.dimension);
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
        tablesDetected: markdown?.manifest.tableCount ?? extracted.pages.reduce((total, page) => total + page.tables.length, 0),
        documentWarnings: (markdown?.manifest.warnings ?? extracted.documentWarnings) as Prisma.InputJsonValue,
        extractorVersion: markdown ? 'markdown-structural-v1' : extracted.extractionMetadata.extractorVersion,
        ocrProvider: extracted.extractionMetadata.ocrProvider,
        ocrVersion: extracted.extractionMetadata.ocrVersion,
        chunkerVersion: markdown ? 'markdown-structural-v1' : CHUNKER_VERSION,
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
        ...(!failedPages && chunkRows.length ? [this.db.knowledgeChunk.createMany({ data: chunkRows })] : []),
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
      const diagnostic = safePrismaDiagnostic(error);
      this.logger.error({
        event: 'knowledge.ingestion.prisma_or_pipeline_failure',
        operation: 'KnowledgeChunk.createMany',
        versionId,
        documentId: version.documentId,
        chunkCount: attemptedChunkCount,
        error: diagnostic,
      });
      const code = diagnostic.code
        ? `PRISMA_${diagnostic.code}`
        : diagnostic.message.startsWith('KNOWLEDGE_')
          ? diagnostic.message.split(':')[0]!.slice(0, 100)
          : 'KNOWLEDGE_INGESTION_FAILED';
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
      const failureStageLog = [
        ...log,
        { stage: 'FAILED', at: new Date().toISOString(), diagnostic },
      ] as unknown as Prisma.InputJsonValue;
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
            errorMessage: diagnostic.message.slice(0, 500),
            attempts: { increment: 1 },
            stageLog: failureStageLog,
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
    return this.searchScoped(query, actor, options, {
      statuses: options?.historicalAt ? ['PUBLISHED', 'DEPRECATED'] : ['PUBLISHED'],
      henryEnabled: true,
      recordGap: true,
    });
  }

  async searchPrivateQa(
    query: string,
    actor: KnowledgeActor,
    options: { collectionId: string; limit?: number },
  ): Promise<KnowledgeSearchResult> {
    this.assert('knowledge.admin', actor);
    const collection = await this.db.knowledgeCollection.findUnique({ where: { id: options.collectionId } });
    if (!collection || collection.henryEnabled || collection.isActive)
      throw new ForbiddenException('KNOWLEDGE_PRIVATE_QA_COLLECTION_REQUIRED');
    return this.searchScoped(query, actor, options, {
      statuses: ['REVIEW'], henryEnabled: false, recordGap: false,
    });
  }

  private async searchScoped(
    query: string,
    actor: KnowledgeActor,
    options: { historicalAt?: string; collectionId?: string; limit?: number } | undefined,
    scope: { statuses: Array<'PUBLISHED' | 'DEPRECATED' | 'REVIEW'>; henryEnabled: boolean; recordGap: boolean },
  ): Promise<KnowledgeSearchResult> {
    this.assert('knowledge.read', actor);
    const queryVector = (await this.embeddings.embed([query]))[0] ?? [];
    const now = options?.historicalAt ? new Date(options.historicalAt) : new Date();
    const rows = await this.db.knowledgeChunk.findMany({
      where: {
        version: {
          status: { in: scope.statuses },
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
          ],
          document: {
            ...(options?.collectionId ? { collectionId: options.collectionId } : {}),
            classification: { in: this.classifications(actor) as any },
            collection: { henryEnabled: scope.henryEnabled },
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
        const semantic = cosineSimilarity(queryVector, vector);
        return {
          row,
          score: hybridKnowledgeScore({
            query,
            content: row.content,
            title: row.version.document.title,
            section: row.section,
            headingPath: row.headingPath,
            structuralType: row.structuralType,
            semantic,
          }),
        };
      })
      .filter((item) => item.score >= Number(process.env.RAG_MIN_SCORE ?? 0.18))
      .sort((a, b) => b.score - a.score || a.row.version.authorityRank - b.row.version.authorityRank)
      .slice(0, Math.min(options?.limit ?? 6, Number(process.env.RAG_MAX_CHUNKS ?? 8)));
    if (!ranked.length) {
      if (scope.recordGap) await this.recordGap(query, actor);
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
