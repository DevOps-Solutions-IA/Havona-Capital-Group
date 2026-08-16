import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { CommunicationsController } from './communications.controller';

describe('Resend webhook', () => {
  const key = Buffer.from('webhook-test-key').toString('base64');
  const config: any = { resendWebhookSecret: `whsec_${key}` };
  const communications: any = {
    claimWebhook: jest.fn(),
    completeWebhook: jest.fn(),
    failWebhook: jest.fn(),
    recordDelivery: jest.fn(),
    receiveInbound: jest.fn(),
    providerEventId: jest.fn(),
  };
  const controller = new CommunicationsController(communications, config);

  beforeEach(() => {
    jest.clearAllMocks();
    communications.claimWebhook.mockResolvedValue(true);
  });

  function signed(type: string) {
    const id = 'msg_webhook_id';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = {
      type,
      data: { email_id: 'provider-email-id', created_at: new Date().toISOString() },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = `v1,${createHmac('sha256', Buffer.from(key, 'base64'))
      .update(`${id}.${timestamp}.${rawBody.toString('utf8')}`)
      .digest('base64')}`;
    return { req: { rawBody, body } as any, id, timestamp, signature };
  }

  it.each([
    ['email.sent', 'SENT'],
    ['email.delivered', 'DELIVERED'],
    ['email.bounced', 'BOUNCED'],
    ['email.complained', 'COMPLAINED'],
    ['email.failed', 'FAILED'],
  ])('valida firma y mapea %s a %s', async (type, status) => {
    const event = signed(type);
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, event.signature),
    ).resolves.toEqual({ received: true });
    expect(communications.recordDelivery).toHaveBeenCalledWith(
      'provider-email-id',
      event.id,
      status,
      expect.any(Date),
      type,
      expect.objectContaining({ provider: 'RESEND' }),
    );
    expect(communications.completeWebhook).toHaveBeenCalledWith('RESEND', event.id);
  });

  it('rechaza firma ausente o expirada y ACK seguro para duplicado', async () => {
    const event = signed('email.delivered');
    await expect(controller.resendWebhook(event.req, '', '', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const expired = String(Math.floor(Date.now() / 1000) - 301);
    await expect(
      controller.resendWebhook(event.req, event.id, expired, event.signature),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.resendWebhook(event.req, event.id, 'not-a-timestamp', event.signature),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, 'v1,invalid-non-empty'),
    ).rejects.toBeInstanceOf(BadRequestException);
    communications.claimWebhook.mockResolvedValue(false);
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, event.signature),
    ).resolves.toEqual({ received: true, duplicate: true });
    expect(communications.recordDelivery).not.toHaveBeenCalled();
  });

  it('procesa de forma segura un messageId inexistente', async () => {
    const event = signed('email.delivered');
    communications.recordDelivery.mockResolvedValue(null);
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, event.signature),
    ).resolves.toEqual({ received: true });
    expect(communications.completeWebhook).toHaveBeenCalledWith('RESEND', event.id);
  });

  it('marca fallo intermedio y un retry posterior recupera el efecto', async () => {
    const event = signed('email.delivered');
    communications.recordDelivery.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, event.signature),
    ).rejects.toThrow('database unavailable');
    expect(communications.failWebhook).toHaveBeenCalledWith('RESEND', event.id);
    communications.recordDelivery.mockResolvedValueOnce({ status: 'DELIVERED' });
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, event.signature),
    ).resolves.toEqual({ received: true });
    expect(communications.recordDelivery).toHaveBeenCalledTimes(2);
    expect(communications.completeWebhook).toHaveBeenCalledTimes(1);
  });

  it('un evento ya procesado conserva ACK idempotente', async () => {
    const event = signed('email.delivered');
    communications.claimWebhook.mockResolvedValue(false);
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, event.signature),
    ).resolves.toEqual({ received: true, duplicate: true });
    expect(communications.recordDelivery).not.toHaveBeenCalled();
    expect(communications.completeWebhook).not.toHaveBeenCalled();
  });

  it('registra evento desconocido sin fallar ni alterar el mensaje', async () => {
    const event = signed('email.delivery_delayed');
    await expect(
      controller.resendWebhook(event.req, event.id, event.timestamp, event.signature),
    ).resolves.toEqual({ received: true });
    expect(communications.claimWebhook).toHaveBeenCalled();
    expect(communications.recordDelivery).not.toHaveBeenCalled();
    expect(communications.completeWebhook).toHaveBeenCalledWith('RESEND', event.id);
  });
});
