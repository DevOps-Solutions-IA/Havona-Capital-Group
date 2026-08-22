export type AIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCallId?: string;
  toolCalls?: AIToolCall[];
};

export type AIToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AIToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AICompletionRequest = {
  messages: AIMessage[];
  tools: AIToolDefinition[];
  maxOutputTokens: number;
  temperature: number;
  signal?: AbortSignal;
};

export type AICompletionResult = {
  provider: string;
  model: string;
  content: string | null;
  toolCalls: AIToolCall[];
  finishReason: string | null;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    costSource?: 'PROVIDER';
  };
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export class AIProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
