import { AIConfig } from './ai-config';
import { AIProviderError } from './ai-provider';
import { OpenRouterProvider } from './openrouter.provider';

const request = {
  messages: [{ role: 'user' as const, content: 'Hola' }],
  tools: [],
  maxOutputTokens: 100,
  temperature: 0.2,
};

describe('OpenRouterProvider', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('rechaza una configuración incompleta sin llamar al proveedor', async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_MODEL;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const provider = new OpenRouterProvider(new AIConfig());

    await expect(provider.complete(request)).rejects.toMatchObject<Partial<AIProviderError>>({
      code: 'AI_CONFIGURATION_REQUIRED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('normaliza contenido, tools y uso reportado por OpenRouter', async () => {
    process.env.OPENROUTER_API_KEY = 'local-test-key';
    process.env.AI_MODEL = 'provider/model';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'provider/model',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: null,
                tool_calls: [
                  { id: 'call-1', function: { name: 'create_task', arguments: '{"title":"Llamar"}' } },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16, cost: 0.001 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const provider = new OpenRouterProvider(new AIConfig());

    await expect(provider.complete({ ...request, tools: [{ name: 'create_task', description: 'Crea una tarea', parameters: { type: 'object', properties: {} } }] })).resolves.toMatchObject({
      provider: 'openrouter',
      model: 'provider/model',
      toolCalls: [{ id: 'call-1', name: 'create_task' }],
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16, costUsd: 0.001 },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Title']).toBe('HAVONA CAPITAL GROUP - Henry');
    expect([...headers['X-Title']!].every((character) => character.charCodeAt(0) <= 255)).toBe(true);
    expect(body).toEqual(expect.objectContaining({ max_tokens: 100, temperature: 0.2 }));
    expect(body).not.toHaveProperty('max_output_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body.tools[0]).toEqual(expect.objectContaining({ type: 'function', function: expect.objectContaining({ name: expect.any(String), parameters: expect.any(Object) }) }));
  });

  it('omite tools y tool_choice cuando la petición no incluye herramientas', async () => {
    process.env.OPENROUTER_API_KEY = 'local-test-key';
    process.env.AI_MODEL = 'provider/model';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: 'OK' } }], usage: {},
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new OpenRouterProvider(new AIConfig());
    await provider.complete(request);
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('parallel_tool_calls');
  });

  it('redacta fallos de autenticación como error tipado', async () => {
    process.env.OPENROUTER_API_KEY = 'local-test-key';
    process.env.AI_MODEL = 'provider/model';
    const warning = jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 401, message: 'Invalid key local-test-key Bearer exposed-token' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = new OpenRouterProvider(new AIConfig());

    const error = provider.complete(request);
    await expect(error).rejects.toMatchObject({
      code: 'AI_PROVIDER_AUTHENTICATION_FAILED',
      retryable: false,
    });
    await expect(error).rejects.not.toThrow(/local-test-key|exposed-token/);
    expect(warning.mock.calls.flat().join(' ')).not.toMatch(/local-test-key|exposed-token/);
    expect(warning.mock.calls.flat().join(' ')).toContain('"status":401');
  });

  it('clasifica timeout sin revelar detalles de transporte', async () => {
    process.env.OPENROUTER_API_KEY = 'local-test-key';
    process.env.AI_MODEL = 'provider/model';
    process.env.AI_MAX_RETRIES = '0';
    jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('connection details', 'AbortError'));
    const provider = new OpenRouterProvider(new AIConfig());

    await expect(provider.complete(request)).rejects.toMatchObject({
      code: 'AI_PROVIDER_TIMEOUT',
    });
  });

  it('clasifica y registra un error de red sin filtrar secretos', async () => {
    process.env.OPENROUTER_API_KEY = 'local-test-key';
    process.env.AI_MODEL = 'provider/model';
    process.env.AI_MAX_RETRIES = '0';
    const warning = jest.spyOn(console, 'warn').mockImplementation();
    const networkError = new TypeError('fetch failed', { cause: Object.assign(new Error('socket'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) });
    jest.spyOn(global, 'fetch').mockRejectedValue(networkError);
    const provider = new OpenRouterProvider(new AIConfig());

    await expect(provider.complete(request)).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
    const logged = warning.mock.calls.flat().join(' ');
    expect(logged).toContain('UND_ERR_CONNECT_TIMEOUT');
    expect(logged).toContain('"transport":"UNDICI"');
    expect(logged).not.toContain('local-test-key');
  });
});
