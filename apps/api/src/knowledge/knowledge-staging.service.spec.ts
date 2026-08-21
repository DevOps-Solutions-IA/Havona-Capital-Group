import { createHash } from 'node:crypto';
import { KnowledgeStagingService } from './knowledge-staging.service';

describe('Knowledge PALIG ingestion staging', () => {
  const actor = { id: 'actor', roles: ['ADMIN'], permissions: ['knowledge.upload', 'knowledge.review'] };
  const file = (name: string, content: string) => ({
    originalname: name, mimetype: 'application/pdf', buffer: Buffer.from(content),
    size: Buffer.byteLength(content),
  } as Express.Multer.File);

  function setup(scanStatus: 'CLEAN' | 'PENDING_SCAN' | 'QUARANTINED' | 'SCAN_FAILED' = 'CLEAN') {
    const rows: any[] = [];
    const storage = {
      exists: jest.fn(async () => false), put: jest.fn(async () => undefined),
      get: jest.fn(), delete: jest.fn(async () => undefined), stat: jest.fn(),
    };
    const db: any = { knowledgeStagedAsset: {
      findFirst: jest.fn(async ({ where }) => rows.find((row) => row.sha256 === where.sha256) ?? null),
      create: jest.fn(async ({ data }) => { const row = { id: `s${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); const { storageKey: _, ...safe } = row; return safe; }),
      findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(),
    } };
    const scanner = { scan: jest.fn(async () => ({ status: scanStatus, scanner: 'test', ...(scanStatus === 'PENDING_SCAN' ? { errorCode: 'SCANNER_UNAVAILABLE' } : {}) })) };
    const audit = { record: jest.fn() };
    const service = new KnowledgeStagingService(db, audit as any, {} as any, storage as any, scanner as any);
    return { service, db, storage, scanner, rows, audit };
  }

  it('calcula hash server-side y usa defaults UNKNOWN/no público', async () => {
    const { service, rows } = setup();
    const result = await service.stage(file('tarifario.pdf', 'contenido-a'), {}, actor);
    expect(result).toMatchObject({ status: 'READY_FOR_REVIEW', scanStatus: 'CLEAN', proposedCurrentStatus: 'UNKNOWN', proposedPublicAllowed: false });
    expect(rows[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty('storageKey');
  });

  it('mismo hash y nombre diferente conserva referencia sin segunda copia física', async () => {
    const { service, storage } = setup();
    await service.stage(file('original.pdf', 'igual'), {}, actor);
    const duplicate = await service.stage(file('copia.pdf', 'igual'), {}, actor);
    expect(duplicate).toMatchObject({ status: 'DUPLICATE', duplicateOfId: 's1' });
    expect(storage.put).toHaveBeenCalledTimes(1);
  });

  it('mismo nombre y contenido distinto no es duplicado', async () => {
    const { service, storage } = setup();
    await service.stage(file('version.pdf', 'v1'), {}, actor);
    const next = await service.stage(file('version.pdf', 'v2'), {}, actor);
    expect(next.status).toBe('READY_FOR_REVIEW');
    expect(storage.put).toHaveBeenCalledTimes(2);
  });

  it('scanner no disponible queda PENDING y no finge CLEAN', async () => {
    const { service } = setup('PENDING_SCAN');
    await expect(service.stage(file('pending.pdf', 'x'), {}, actor)).resolves.toMatchObject({
      status: 'STAGED', scanStatus: 'PENDING_SCAN', errorCode: 'SCANNER_UNAVAILABLE',
    });
  });

  it('quarantine no puede aprobarse ni promoverse', async () => {
    const { service, db } = setup('QUARANTINED');
    db.knowledgeStagedAsset.findUnique.mockResolvedValue({ id: 'q', scanStatus: 'QUARANTINED' });
    await expect(service.review('q', { approved: true }, actor)).rejects.toThrow('KNOWLEDGE_STAGING_SCAN_BLOCKED');
    await expect(service.promote('q', { title: 'Doc', collectionId: 'c', classification: 'GENERAL' }, actor))
      .rejects.toThrow('KNOWLEDGE_STAGING_NOT_APPROVED');
  });

  it('scan fallido queda bloqueado para revisión y promoción', async () => {
    const { service, db } = setup('SCAN_FAILED');
    await expect(service.stage(file('failed.pdf', 'x'), {}, actor)).resolves.toMatchObject({
      status: 'STAGED', scanStatus: 'SCAN_FAILED', proposedPublicAllowed: false,
    });
    db.knowledgeStagedAsset.findUnique.mockResolvedValue({ id: 'f', scanStatus: 'SCAN_FAILED' });
    await expect(service.review('f', { approved: true }, actor))
      .rejects.toThrow('KNOWLEDGE_STAGING_SCAN_BLOCKED');
    await expect(service.promote('f', { title: 'Doc', collectionId: 'c', classification: 'GENERAL' }, actor))
      .rejects.toThrow('KNOWLEDGE_STAGING_NOT_APPROVED');
  });

  it('promoción alimenta el pipeline existente sin aprobar ni publicar automáticamente', async () => {
    const { service, db, storage } = setup();
    const content = Buffer.from('evidencia revisada');
    const sha256 = createHash('sha256').update(content).digest('hex');
    storage.get.mockResolvedValue(content);
    db.knowledgeStagedAsset.findUnique.mockResolvedValue({
      id: 'approved', scanStatus: 'CLEAN', reviewStatus: 'APPROVED', status: 'READY_FOR_REVIEW',
      storageKey: `originals/${sha256}`, sha256, fileSize: content.length,
      mimeType: 'application/pdf', originalFilename: 'evidencia.pdf',
      proposedSourceType: 'CONTRACTUAL', proposedAuthorityLevel: 'CONTRACTUAL_SPECIFIC',
      proposedCurrentStatus: 'UNKNOWN', proposedPublicAllowed: false,
      proposedConsultantAllowed: true, proposedManagerAllowed: true,
      proposedTrainingAllowed: false, proposedCustomerNeeds: [],
    });
    db.knowledgeStagedAsset.update.mockResolvedValue({});
    const knowledge = (service as any).knowledge;
    knowledge.createDocument = jest.fn(async () => ({ id: 'document-1', status: 'PROCESSING' }));

    await expect(service.promote('approved', {
      title: 'Evidencia', collectionId: 'collection-1', classification: 'GENERAL',
    }, actor)).resolves.toEqual({
      stagingId: 'approved', documentId: 'document-1', status: 'PROCESSING',
    });
    expect(knowledge.createDocument).toHaveBeenCalledTimes(1);
    expect(knowledge.approve).toBeUndefined();
    expect(knowledge.publish).toBeUndefined();
  });

  it('vincula un duplicado al documento canónico sin duplicar contenido ni embeddings', async () => {
    const { service, db, storage, audit } = setup();
    db.knowledgeStagedAsset.findUnique
      .mockResolvedValueOnce({
        id: 'duplicate', duplicateOfId: 'canonical', sha256: 'a'.repeat(64),
        scanStatus: 'CLEAN', reviewStatus: 'APPROVED', status: 'DUPLICATE',
      })
      .mockResolvedValueOnce({
        sha256: 'a'.repeat(64), promotedDocumentId: 'document-1', status: 'PROMOTED',
      });
    db.knowledgeStagedAsset.update.mockResolvedValue({});
    await expect(service.promote('duplicate', {
      title: 'Referencia duplicada', collectionId: 'collection-1', classification: 'GENERAL',
    }, actor)).resolves.toEqual({
      stagingId: 'duplicate', documentId: 'document-1', status: 'CANONICAL_LINKED',
    });
    expect(storage.get).not.toHaveBeenCalled();
    expect((service as any).knowledge.createDocument).toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(
      'KNOWLEDGE_STAGING_CANONICAL_LINKED', 'KnowledgeStagedAsset', 'duplicate',
      { actorUserId: actor.id }, expect.objectContaining({ canonicalStagingId: 'canonical' }),
    );
  });

  it('bloquea duplicado cuando el canónico aún no fue promovido', async () => {
    const { service, db } = setup();
    db.knowledgeStagedAsset.findUnique
      .mockResolvedValueOnce({
        id: 'duplicate', duplicateOfId: 'canonical', sha256: 'a'.repeat(64),
        scanStatus: 'CLEAN', reviewStatus: 'APPROVED', status: 'DUPLICATE',
      })
      .mockResolvedValueOnce({ sha256: 'a'.repeat(64), promotedDocumentId: null, status: 'READY_FOR_REVIEW' });
    await expect(service.promote('duplicate', {
      title: 'Referencia', collectionId: 'collection-1', classification: 'GENERAL',
    }, actor)).rejects.toThrow('KNOWLEDGE_CANONICAL_NOT_PROMOTED');
  });

  it('limpia el objeto nuevo si falla persistencia de staging', async () => {
    const { service, db, storage } = setup();
    db.knowledgeStagedAsset.create.mockRejectedValueOnce(new Error('DB_FAILED'));
    await expect(service.stage(file('error.pdf', 'x'), {}, actor)).rejects.toThrow('DB_FAILED');
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });
});
