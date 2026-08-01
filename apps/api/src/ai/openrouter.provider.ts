import { Injectable } from '@nestjs/common';
import { AIConfig } from './ai-config';
import {
  AICompletionRequest,
  AICompletionResult,
  AIMessage,
  AIProvider,
  AIProviderError,
} from './ai-provider';

type OpenRouterResponse = {
  model?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      tool_calls?: Array<{
        id?: unknown;
        function?: { name?: unknown; arguments?: unknown };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    cost?: unknown;
  };
  error?: { message?: unknown; code?: unknown };
};

const optionalNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

@Injectable()
export class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter';

  constructor(private readonly config: AIConfig) {
    this.config.validateProvider();
  }

  get model() {
    return this.config.model;
  }

  isConfigured() {
    return Boolean(this.config.apiKey && this.config.model);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new AIProviderError('AI_CONFIGURATION_REQUIRED', 'Proveedor o modelo AI no configurado');
    }

    let lastError: AIProviderError | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.execute(request);
      } catch (error) {
        const providerError =
          error instanceof AIProviderError
            ? error
            : new AIProviderError('AI_PROVIDER_UNAVAILABLE', 'El proveedor AI no está disponible', true);
        lastError = providerError;
        if (!providerError.retryable || attempt === this.config.maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 1_000)));
      }
    }
    throw lastError ?? new AIProviderError('AI_PROVIDER_UNAVAILABLE', 'Proveedor AI no disponible');
  }

  private async execute(request: AICompletionRequest): Promise<AICompletionResult> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.config.applicationUrl,
          'X-Title': 'HAVONA CAPITAL GROUP — Henry',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages.map((message) => this.mapMessage(message)),
          tools: request.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: 'auto',
          parallel_tool_calls: false,
          max_completion_tokens: Math.min(request.maxOutputTokens, this.config.maxOutputTokens),
          temperature: request.temperature,
          stream: false,
        }),
      });
    } catch (error) {
      const timeoutError = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new AIProviderError(
        timeoutError ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE',
        timeoutError ? 'El proveedor AI excedió el tiempo permitido' : 'No fue posible contactar al proveedor AI',
        !request.signal?.aborted,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as OpenRouterResponse;
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      const code =
        response.status === 401 || response.status === 403
          ? 'AI_PROVIDER_AUTHENTICATION_FAILED'
          : response.status === 402
            ? 'AI_PROVIDER_CREDIT_REQUIRED'
            : response.status === 429
              ? 'AI_PROVIDER_RATE_LIMITED'
              : 'AI_PROVIDER_ERROR';
      throw new AIProviderError(
        code,
        typeof payload.error?.message === 'string' ? payload.error.message.slice(0, 300) : 'OpenRouter rechazó la solicitud',
        retryable,
      );
    }

    const choice = payload.choices?.[0];
    if (!choice?.message) {
      throw new AIProviderError('AI_PROVIDER_INVALID_RESPONSE', 'OpenRouter devolvió una respuesta inválida');
    }
    const toolCalls = (choice.message.tool_calls ?? []).map((call) => {
      if (
        typeof call.id !== 'string' ||
        typeof call.function?.name !== 'string' ||
        typeof call.function.arguments !== 'string'
      ) {
        throw new AIProviderError('AI_PROVIDER_INVALID_TOOL_CALL', 'OpenRouter devolvió una herramienta inválida');
      }
      return { id: call.id, name: call.function.name, arguments: call.function.arguments };
    });
    const usage = payload.usage ?? {};
    const cost = optionalNumber(usage.cost);
    return {
      provider: this.name,
      model: typeof payload.model === 'string' ? payload.model : this.config.model,
      content: typeof choice.message.content === 'string' ? choice.message.content : null,
      toolCalls,
      finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
      usage: {
        inputTokens: optionalNumber(usage.prompt_tokens),
        outputTokens: optionalNumber(usage.completion_tokens),
        totalTokens: optionalNumber(usage.total_tokens),
        costUsd: cost,
        costSource: cost === undefined ? undefined : 'PROVIDER',
      },
    };
  }

  private mapMessage(message: AIMessage) {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content ?? '' };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content ?? '' };
  }
}
