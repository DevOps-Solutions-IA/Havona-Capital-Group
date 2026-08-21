import { KnowledgeService } from './knowledge.service';

describe('Knowledge publication integrity gate', () => {
  const actor = { id: 'admin', roles: ['SUPER_ADMIN'], permissions: ['knowledge.publish'] };
  const setup = (document: any) => {
    const db: any = {
      knowledgeDocument: { findUnique: jest.fn().mockResolvedValue(document), update: jest.fn() },
      knowledgeVersion: { updateMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async () => []),
    };
    const audit = { record: jest.fn() };
    const service = new KnowledgeService(
      db, audit as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    return { service, db, audit };
  };

  it('bloquea publicación sin reporte de extracción', async () => {
    const { service } = setup({ versions: [{ id: 'v', version: 1, checksum: 'a', extractionReport: null }], stagedAssets: [] });
    await expect(service.publish('d', actor)).rejects.toThrow('KNOWLEDGE_EXTRACTION_NOT_COMPLETED');
  });

  it('bloquea publicación con páginas fallidas', async () => {
    const { service } = setup({
      versions: [{ id: 'v', version: 1, checksum: 'a', extractionReport: { status: 'COMPLETED', failedPages: 1 } }],
      stagedAssets: [],
    });
    await expect(service.publish('d', actor)).rejects.toThrow('KNOWLEDGE_EXTRACTION_PAGE_FAILED');
  });

  it('bloquea inconsistencia canónica', async () => {
    const { service } = setup({
      versions: [{ id: 'v', version: 1, checksum: 'a', extractionReport: { status: 'COMPLETED', failedPages: 0 } }],
      stagedAssets: [{ sha256: 'b' }],
    });
    await expect(service.publish('d', actor)).rejects.toThrow('KNOWLEDGE_CANONICAL_CONSISTENCY_FAILED');
  });

  it('permite UNKNOWN con extracción completa y consistencia canónica', async () => {
    const { service, db, audit } = setup({
      versions: [{ id: 'v', version: 1, checksum: 'a', currentStatus: 'UNKNOWN', extractionReport: { status: 'COMPLETED', failedPages: 0 } }],
      stagedAssets: [{ sha256: 'a' }],
    });
    await expect(service.publish('d', actor)).resolves.toEqual({ documentId: 'd', version: 1, status: 'PUBLISHED' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      'KNOWLEDGE_DOCUMENT_PUBLISHED', 'KnowledgeDocument', 'd',
      expect.objectContaining({ actorUserId: 'admin' }), { version: 1 },
    );
  });
});
