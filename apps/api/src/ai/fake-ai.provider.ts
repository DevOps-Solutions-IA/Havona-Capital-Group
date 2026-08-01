import {
  AICompletionRequest,
  AICompletionResult,
  AIProvider,
  AIProviderError,
} from './ai-provider';

export class FakeAIProvider implements AIProvider {
  readonly name = 'fake';
  readonly model = 'fake/henry-test';
  private queue: Array<AICompletionResult | Error>;

  constructor(responses: Array<AICompletionResult | Error> = []) {
    this.queue = [...responses];
  }

  isConfigured() {
    return true;
  }

  enqueue(response: AICompletionResult | Error) {
    this.queue.push(response);
  }

  async complete(_request: AICompletionRequest) {
    const response = this.queue.shift();
    if (!response) throw new AIProviderError('FAKE_RESPONSE_MISSING', 'No hay respuesta fake configurada');
    if (response instanceof Error) throw response;
    return response;
  }
}
