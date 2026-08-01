import { Injectable } from '@nestjs/common';

const integer = (value: string | undefined, fallback: number, minimum: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

const decimal = (value: string | undefined, fallback: number, minimum: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

@Injectable()
export class AIConfig {
  readonly provider = (process.env.AI_PROVIDER ?? 'openrouter').trim().toLowerCase();
  readonly model = (process.env.AI_MODEL ?? '').trim();
  readonly apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
  readonly baseUrl = (process.env.AI_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  readonly timeoutMs = integer(process.env.AI_TIMEOUT_MS, 30_000, 1_000, 120_000);
  readonly maxRetries = integer(process.env.AI_MAX_RETRIES, 2, 0, 3);
  readonly maxInputTokens = integer(process.env.AI_MAX_INPUT_TOKENS, 8_000, 256, 64_000);
  readonly maxOutputTokens = integer(process.env.AI_MAX_OUTPUT_TOKENS, 1_200, 64, 8_000);
  readonly maxToolCalls = integer(process.env.AI_MAX_TOOL_CALLS, 4, 0, 10);
  readonly temperature = decimal(process.env.AI_TEMPERATURE, 0.2, 0, 1);
  readonly applicationUrl = (process.env.APP_ORIGIN ?? 'http://localhost:3000').trim();

  validateProvider() {
    if (this.provider !== 'openrouter') {
      throw new Error(`Proveedor AI no soportado: ${this.provider}`);
    }
  }
}
