import { ConfiguredEmbeddingProvider, DeterministicEmbeddingProvider, cosineSimilarity } from './knowledge.providers';

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

describe('ConfiguredEmbeddingProvider', () => {
  const original = process.env;
  afterEach(() => { process.env = original; jest.restoreAllMocks(); });

  it('procesa el proveedor real por lotes sin cambiar orden ni dimensión', async () => {
    process.env = { ...original, NODE_ENV: 'development', EMBEDDING_PROVIDER: 'openrouter',
      EMBEDDING_MODEL: 'provider/model', EMBEDDING_DIMENSION: '3', EMBEDDING_BASE_URL: 'https://provider.test/v1',
      EMBEDDING_API_KEY: 'test-secret', EMBEDDING_BATCH_SIZE: '2' };
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const input = (JSON.parse(String(init?.body)) as { input: string[] }).input;
      return { ok: true, json: async () => ({ data: input.map((_text, index) => ({ index, embedding: [1, 0, 0] })) }) } as Response;
    });
    const vectors = await new ConfiguredEmbeddingProvider().embed(['a', 'b', 'c']);
    expect(vectors).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
