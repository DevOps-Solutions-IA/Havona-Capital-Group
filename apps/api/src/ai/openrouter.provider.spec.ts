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
    jest.spyOn(global, 'fetch').mockResolvedValue(
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

    await expect(provider.complete(request)).resolves.toMatchObject({
      provider: 'openrouter',
      model: 'provider/model',
      toolCalls: [{ id: 'call-1', name: 'create_task' }],
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16, costUsd: 0.001 },
    });
  });

  it('redacta fallos de autenticación como error tipado', async () => {
    process.env.OPENROUTER_API_KEY = 'local-test-key';
    process.env.AI_MODEL = 'provider/model';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = new OpenRouterProvider(new AIConfig());

    await expect(provider.complete(request)).rejects.toMatchObject({
      code: 'AI_PROVIDER_AUTHENTICATION_FAILED',
      retryable: false,
    });
  });
});
