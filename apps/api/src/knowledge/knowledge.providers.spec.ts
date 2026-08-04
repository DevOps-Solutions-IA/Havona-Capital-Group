import { DeterministicEmbeddingProvider, cosineSimilarity } from './knowledge.providers';

describe('EmbeddingProvider determinista de pruebas', () => {
  it('es estable, dimensional y no consume proveedores externos', async () => {
    const provider = new DeterministicEmbeddingProvider();
    const [first, second, distinct] = await provider.embed([
      'misma fuente',
      'misma fuente',
      'otra fuente',
    ]);
    expect(first).toHaveLength(64);
    expect(first).toEqual(second);
    expect(first).not.toEqual(distinct);
    expect(cosineSimilarity(first!, second!)).toBeCloseTo(1);
  });
});
