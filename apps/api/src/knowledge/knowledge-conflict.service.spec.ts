import { KnowledgeService } from './knowledge.service';

describe('Knowledge conflict engine', () => {
  const actor = { id: 'reviewer', roles: ['ADMIN'], permissions: ['knowledge.review'] };

  it('conserva conflicto de autoridad y vigencia desconocida al registrar un hecho divergente', async () => {
    const created: any[] = [];
    const tx = {
      knowledgeFact: { create: jest.fn(async ({ data }) => ({ id: 'new-fact', ...data })) },
      knowledgeConflict: {
        create: jest.fn(async ({ data }) => {
          created.push(data);
          return data;
        }),
      },
    };
    const db: any = {
      knowledgeVersion: {
        findUnique: jest.fn(async () => ({
          id: 'version-training', documentId: 'document', authorizedProductId: 'product',
          currentStatus: 'UNKNOWN', authorityRank: 5,
        })),
      },
      knowledgeFact: {
        findMany: jest.fn(async () => [{
          value: { amount: '50000' }, customerSpecific: false, versionId: 'version-contract',
          version: { authorityRank: 2 },
        }]),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new KnowledgeService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const result = await service.addFact('version-training', {
      claimKey: 'accidents.rdh.daily', subject: 'RDH', predicate: 'dailyAmount',
      value: { amount: '300000', currency: 'COP' },
    }, actor);

    expect(result.conflictsCreated).toBe(2);
    expect(created.map((item) => item.type)).toEqual([
      'VALIDITY_UNKNOWN', 'AUTHORITY_CONFLICT',
    ]);
    expect(created[1].details).toEqual({
      claimKey: 'accidents.rdh.daily', primaryAuthorityRank: 5, secondaryAuthorityRank: 2,
    });
  });

  it('no crea conflicto por hechos equivalentes', async () => {
    const tx = {
      knowledgeFact: { create: jest.fn(async ({ data }) => data) },
      knowledgeConflict: { create: jest.fn() },
    };
    const db: any = {
      knowledgeVersion: { findUnique: jest.fn(async () => ({
        id: 'v2', documentId: 'd', authorizedProductId: null,
        currentStatus: 'CURRENT', authorityRank: 2,
      })) },
      knowledgeFact: { findMany: jest.fn(async () => [{
        value: { covered: true }, customerSpecific: false, versionId: 'v1',
        version: { authorityRank: 2 },
      }]) },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new KnowledgeService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const result = await service.addFact('v2', {
      claimKey: 'coverage.accident', subject: 'Accidente', predicate: 'covered',
      value: { covered: true },
    }, actor);
    expect(result.conflictsCreated).toBe(0);
    expect(tx.knowledgeConflict.create).not.toHaveBeenCalled();
  });
});
