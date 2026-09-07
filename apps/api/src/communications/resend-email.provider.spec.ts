import { ResendEmailProvider } from './resend-email.provider';

describe('ResendEmailProvider', () => {
  const config: any = {
    resendApiKey: 'never-log-this',
    resendFromEmail: 'mensajes@mail.havonacapitalgroup.com',
    resendFromName: 'HAVONA CAPITAL GROUP',
    resendReplyTo: 'respuestas@mail.havonacapitalgroup.com',
    resendTimeout: 1000,
    status: () => ({ email: { configured: true } }),
  };
  afterEach(() => jest.restoreAllMocks());

  it('devuelve provider ID sin confundir aceptación con entrega', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'resend-message-id' }), { status: 200 }),
      );
    await expect(
      new ResendEmailProvider(config).send({
        to: 'authorized@example.com',
        subject: 'Asunto',
        text: 'Texto',
        idempotencyKey: 'operation/1',
      }),
    ).resolves.toMatchObject({ providerMessageId: 'resend-message-id' });
  });

  it('redacta rechazo permanente y timeout como errores seguros', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'invalid_from_address', message: config.resendApiKey }), {
        status: 422,
      }),
    );
    await expect(
      new ResendEmailProvider(config).send({
        to: 'authorized@example.com',
        subject: 'Asunto',
        text: 'Texto',
        idempotencyKey: 'operation/2',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
    await expect(
      new ResendEmailProvider(config).send({
        to: 'authorized@example.com',
        subject: 'Asunto',
        text: 'Texto',
        idempotencyKey: 'operation/3',
      }),
    ).rejects.not.toThrow(config.resendApiKey);
  });
});
