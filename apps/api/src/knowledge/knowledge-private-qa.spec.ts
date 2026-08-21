import { KnowledgeService } from './knowledge.service';
import { PALIG_PRIVATE_QA_GOLDEN } from './palig-private-qa-golden';

describe('PALIG private QA isolation', () => {
  it('mantiene al menos 50 casos Golden y cubre abstención', () => {
    expect(PALIG_PRIVATE_QA_GOLDEN.length).toBeGreaterThanOrEqual(50);
    expect(PALIG_PRIVATE_QA_GOLDEN.filter((item) => item.abstain)).toHaveLength(5);
    expect(new Set(PALIG_PRIVATE_QA_GOLDEN.filter((item) => item.expectedFilename).map((item) => item.expectedFilename)).size).toBe(12);
  });

  it('rechaza retrieval QA sobre colección consumible por Henry', async () => {
    const db = { knowledgeCollection: { findUnique: jest.fn().mockResolvedValue({ id: 'c', isActive: true, henryEnabled: true }) } };
    const service = new KnowledgeService(db as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.searchPrivateQa('consulta', {
      id: 'admin', roles: ['SUPER_ADMIN'], permissions: ['knowledge.admin', 'knowledge.read'],
    }, { collectionId: 'c' })).rejects.toThrow('KNOWLEDGE_PRIVATE_QA_COLLECTION_REQUIRED');
  });
});
