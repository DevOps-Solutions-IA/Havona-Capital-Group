import { KnowledgeService } from './knowledge.service';

const extracted = (status: 'EXTRACTED_NATIVE' | 'FAILED' = 'EXTRACTED_NATIVE') => ({
  mimeType: 'application/pdf', pageCount: 1, documentText: null, documentWarnings: [],
  extractionMetadata: {
    extractorVersion: 'test-v1', ocrProvider: 'test', ocrVersion: '1',
    startedAt: new Date('2026-01-01T00:00:00Z'), completedAt: new Date('2026-01-01T00:00:01Z'),
  },
  pages: [{
    pageNumber: 1, nativeText: status === 'FAILED' ? '' : 'Contenido nativo suficientemente largo para persistir.',
    finalText: status === 'FAILED' ? '' : 'Contenido nativo suficientemente largo para persistir.',
    extractionMethod: status === 'FAILED' ? 'OCR' : 'NATIVE', characterCount: status === 'FAILED' ? 0 : 49,
    warnings: status === 'FAILED' ? ['KNOWLEDGE_OCR_FAILED'] : [], blocks: [], tables: [], section: null,
    extractionStatus: status,
  }],
});

describe('Knowledge extraction report persistence', () => {
  function setup(result = extracted()) {
    let report: any = null;
    const operation = () => jest.fn(async () => ({}));
    const db: any = {
      knowledgeVersion: {
        findUnique: jest.fn(async () => ({
          id: 'version-1', documentId: 'document-1', storageKey: 'originals/hash', mimeType: 'application/pdf',
          ingestions: [{ id: 'ingestion-1' }], document: { id: 'document-1' },
        })),
        update: operation(),
      },
      knowledgeDocument: { update: operation() },
      knowledgeIngestion: { update: operation() },
      knowledgeChunk: { deleteMany: operation(), createMany: operation() },
      knowledgePageExtraction: { deleteMany: operation(), create: operation() },
      knowledgeExtractionReport: {
        findUnique: jest.fn(async () => report),
        upsert: jest.fn(async ({ create, update }) => {
          report = report ? { ...report, ...update } : create;
          return report;
        }),
      },
      $transaction: jest.fn(async (operations: any[]) => Promise.all(operations)),
    };
    const service = new KnowledgeService(
      db, {} as any, {} as any,
      { get: jest.fn(async () => Buffer.from('pdf')) } as any,
      { model: 'test', dimension: 2, embed: jest.fn(async (texts: string[]) => texts.map(() => [1, 0])) } as any,
      {} as any,
      { extract: jest.fn(async () => result) } as any,
    );
    return { service, db };
  }

  it('reintento reemplaza páginas/chunks y reutiliza un solo reporte', async () => {
    const { service, db } = setup();
    await service.processVersion('version-1');
    await service.processVersion('version-1');
    expect(db.knowledgeChunk.deleteMany).toHaveBeenCalledTimes(2);
    expect(db.knowledgePageExtraction.deleteMany).toHaveBeenCalledTimes(2);
    expect(db.knowledgeExtractionReport.upsert).toHaveBeenCalledTimes(2);
    const firstId = db.knowledgeExtractionReport.upsert.mock.calls[0][0].create.id;
    const secondId = db.knowledgeExtractionReport.upsert.mock.calls[1][0].create.id;
    expect(secondId).toBe(firstId);
    expect(db.knowledgeChunk.createMany).toHaveBeenCalledTimes(2);
    expect(db.knowledgeChunk.createMany).toHaveBeenLastCalledWith({
      data: [expect.objectContaining({ id: expect.any(String), versionId: 'version-1', position: 0 })],
    });
  });

  it('persiste reporte FAILED y no crea chunks cuando una página falla', async () => {
    const { service, db } = setup(extracted('FAILED'));
    await expect(service.processVersion('version-1')).rejects.toThrow('KNOWLEDGE_EXTRACTION_PAGE_FAILED');
    expect(db.knowledgeExtractionReport.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'FAILED', failedPages: 1 }),
    }));
    expect(db.knowledgeChunk.createMany).not.toHaveBeenCalled();
  });
});
