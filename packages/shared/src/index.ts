const SENSITIVE_KEYS = /authorization|cookie|password|secret|token/i;

export function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValues);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redactSensitiveValues(child),
    ]),
  );
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

export const HAVONA_RESEND_DOMAIN = 'mail.havonacapitalgroup.com';
const EMAIL_IDENTITY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailIdentity(value: string) {
  const extracted = value.match(/<([^>]+)>/)?.[1] ?? value;
  const normalized = extracted.trim().toLowerCase();
  return EMAIL_IDENTITY.test(normalized) ? normalized : null;
}

export type ResendAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type ResendEmailRequest = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: ResendAttachment[];
  idempotencyKey: string;
  timeoutMs: number;
};

export class ResendTransportError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly httpStatus?: number,
  ) {
    super(code);
    this.name = 'ResendTransportError';
  }
}

export function isAuthorizedResendSender(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${HAVONA_RESEND_DOMAIN}`) && normalized.split('@').length === 2;
}

function safeProviderCode(value: unknown) {
  const code = typeof value === 'string' ? value : 'rejected';
  return `RESEND_${code.replace(/[^a-z0-9_-]/gi, '_').toUpperCase()}`.slice(0, 100);
}

export async function sendResendEmail(
  input: ResendEmailRequest,
  fetcher: typeof fetch = fetch,
): Promise<{ providerMessageId: string; acceptedAt: Date }> {
  if (!isAuthorizedResendSender(input.fromEmail))
    throw new ResendTransportError('RESEND_SENDER_DOMAIN_INVALID', false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${input.fromName} <${input.fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: input.replyTo || undefined,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          content_type: attachment.contentType,
        })),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
    };
    if (!response.ok || !data.id) {
      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 && data.name === 'concurrent_idempotent_requests');
      throw new ResendTransportError(safeProviderCode(data.name), retryable, response.status);
    }
    return { providerMessageId: data.id, acceptedAt: new Date() };
  } catch (error) {
    if (error instanceof ResendTransportError) throw error;
    if ((error as Error).name === 'AbortError')
      throw new ResendTransportError('RESEND_TIMEOUT', true, 504);
    throw new ResendTransportError('RESEND_UNAVAILABLE', true, 503);
  } finally {
    clearTimeout(timer);
  }
}

export type PaligMessagingContext = {
  customerNeedId: string | null;
  customerNeedStatus: string | null;
  authorizedSolutionId: string | null;
  authorizedSolutionStatus: string | null;
  solutionProductId: string | null;
  authorizedProductId: string | null;
  authorizedProductStatus: string | null;
  authorizedProductCarrier: string | null;
  mappingStatus: string | null;
};

export function validatePaligMessagingContext(context: PaligMessagingContext): string | null {
  if (context.customerNeedId && context.customerNeedStatus !== 'ACTIVE')
    return 'PALIG_NEED_INACTIVE';
  if (context.authorizedSolutionId && context.authorizedSolutionStatus !== 'ACTIVE')
    return 'PALIG_SOLUTION_INACTIVE';
  if (
    context.authorizedProductId &&
    (context.authorizedProductStatus !== 'ACTIVE' ||
      context.authorizedProductCarrier !== 'PAN_AMERICAN_LIFE_COLOMBIA')
  )
    return 'PALIG_PRODUCT_INACTIVE';
  if (
    context.solutionProductId &&
    context.authorizedProductId &&
    context.solutionProductId !== context.authorizedProductId
  )
    return 'PALIG_CONTEXT_MISMATCH';
  if (context.customerNeedId && context.authorizedSolutionId && context.mappingStatus !== 'ACTIVE')
    return 'PALIG_MAPPING_INACTIVE';
  return null;
}
