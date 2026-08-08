import {
  isAuthorizedResendSender,
  redactSensitiveValues,
  ResendTransportError,
  sendResendEmail,
  validatePaligMessagingContext,
} from './index';

describe('redactSensitiveValues', () => {
  it('redacts nested secrets without mutating safe fields', () => {
    expect(redactSensitiveValues({ user: 'a', nested: { accessToken: 'x' } })).toEqual({
      user: 'a',
      nested: { accessToken: '[REDACTED]' },
    });
  });
});

describe('validatePaligMessagingContext', () => {
  const discovery = {
    customerNeedId: 'need',
    customerNeedStatus: 'ACTIVE',
    authorizedSolutionId: null,
    authorizedSolutionStatus: null,
    solutionProductId: null,
    authorizedProductId: null,
    authorizedProductStatus: null,
    authorizedProductCarrier: null,
    mappingStatus: null,
  };

  it('permite discovery sin producto y bloquea producto no autorizado', () => {
    expect(validatePaligMessagingContext(discovery)).toBeNull();
    expect(
      validatePaligMessagingContext({
        ...discovery,
        authorizedProductId: 'product',
        authorizedProductStatus: 'ACTIVE',
        authorizedProductCarrier: 'OTHER_CARRIER',
      }),
    ).toBe('PALIG_PRODUCT_INACTIVE');
  });
});

describe('sendResendEmail', () => {
  const input = {
    apiKey: 'never-log-this',
    fromEmail: 'mensajes@mail.havonacapitalgroup.com',
    fromName: 'HAVONA CAPITAL GROUP',
    to: 'authorized@example.com',
    subject: 'Asunto',
    text: 'Texto',
    html: '<p>Texto</p>',
    replyTo: 'respuesta@mail.havonacapitalgroup.com',
    attachments: [
      { filename: 'documento.pdf', content: 'dGVzdA==', contentType: 'application/pdf' },
    ],
    idempotencyKey: 'operation/123',
    timeoutMs: 1000,
  };

  it('mapea el contrato productivo, reply-to, adjuntos e idempotencia', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'resend-id' }), { status: 200 }));
    await expect(sendResendEmail(input, fetcher)).resolves.toMatchObject({
      providerMessageId: 'resend-id',
    });
    const request = fetcher.mock.calls[0]![1] as RequestInit;
    expect((request.headers as Record<string, string>)['Idempotency-Key']).toBe('operation/123');
    expect(JSON.parse(String(request.body))).toMatchObject({
      from: 'HAVONA CAPITAL GROUP <mensajes@mail.havonacapitalgroup.com>',
      reply_to: 'respuesta@mail.havonacapitalgroup.com',
      attachments: [{ filename: 'documento.pdf', content: 'dGVzdA==' }],
    });
  });

  it('clasifica errores transitorios y permanentes sin filtrar payloads', async () => {
    const transient = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: input.apiKey }), {
        status: 429,
      }),
    );
    await expect(sendResendEmail(input, transient)).rejects.toMatchObject({
      code: 'RESEND_RATE_LIMIT_EXCEEDED',
      retryable: true,
    });
    const permanent = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ name: 'invalid_from_address' }), { status: 422 }),
      );
    await expect(sendResendEmail(input, permanent)).rejects.toMatchObject({
      code: 'RESEND_INVALID_FROM_ADDRESS',
      retryable: false,
    });
    await expect(sendResendEmail(input, permanent)).rejects.not.toThrow(input.apiKey);
  });

  it('restringe la identidad remitente al subdominio corporativo', () => {
    expect(isAuthorizedResendSender('mail@mail.havonacapitalgroup.com')).toBe(true);
    expect(isAuthorizedResendSender('mail@other-carrier.example')).toBe(false);
    expect(() => new ResendTransportError('SAFE', false)).not.toThrow();
  });
});
