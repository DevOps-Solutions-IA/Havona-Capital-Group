import { CommunicationsService } from './communications.service';

describe('Communications delivery governance', () => {
  const db: any = {
    communicationWebhookEvent: { create: jest.fn(), updateMany: jest.fn() },
    communicationMessage: { findUnique: jest.fn(), update: jest.fn() },
    messageDeliveryEvent: { upsert: jest.fn() },
    communicationConsent: { upsert: jest.fn() },
    communicationThread: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit: any = { record: jest.fn() };
  const service = new CommunicationsService(db, audit, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((callback: any) => callback(db));
    db.messageDeliveryEvent.upsert.mockResolvedValue({});
    db.communicationMessage.update.mockImplementation(({ data }: any) => data);
  });

  it('deduplica atómicamente una carrera P2002', async () => {
    db.communicationWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.registerWebhook('RESEND', 'event', 'email.sent', {})).resolves.toBe(false);
  });

  it('reclama un evento nuevo como QUEUED y solo después lo marca PROCESSED', async () => {
    db.communicationWebhookEvent.create.mockResolvedValue({});
    db.communicationWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.claimWebhook('RESEND', 'event-new', 'email.sent', {})).resolves.toBe(true);
    expect(db.communicationWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'QUEUED', attempts: 1 }) }),
    );
    await service.completeWebhook('RESEND', 'event-new');
    expect(db.communicationWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'QUEUED' }),
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
  });

  it('permite reclamar FAILED para retry sin reclamar PROCESSED/QUEUED', async () => {
    db.communicationWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
    db.communicationWebhookEvent.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.claimWebhook('RESEND', 'event-retry', 'email.sent', {})).resolves.toBe(
      true,
    );
    expect(db.communicationWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'FAILED' }),
        data: expect.objectContaining({ status: 'QUEUED', attempts: { increment: 1 } }),
      }),
    );
    db.communicationWebhookEvent.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.claimWebhook('RESEND', 'event-done', 'email.sent', {})).resolves.toBe(
      false,
    );
  });

  it('marca un claim fallido como FAILED recuperable', async () => {
    db.communicationWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    await service.failWebhook('RESEND', 'event-failed');
    expect(db.communicationWebhookEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'QUEUED' }),
        data: { status: 'FAILED', errorCode: 'WEBHOOK_PROCESSING_FAILED' },
      }),
    );
  });

  it('persiste SENT tardío sin degradar DELIVERED', async () => {
    db.communicationMessage.findUnique.mockResolvedValue({
      id: 'message',
      threadId: 'thread',
      status: 'DELIVERED',
    });
    await expect(
      service.recordDelivery('provider', 'event', 'SENT', new Date()),
    ).resolves.toMatchObject({ status: 'DELIVERED' });
    expect(db.messageDeliveryEvent.upsert).toHaveBeenCalled();
    expect(db.communicationMessage.update).not.toHaveBeenCalled();
  });

  it('un retry del mismo delivery usa upsert y no duplica el evento', async () => {
    db.communicationMessage.findUnique.mockResolvedValue({
      id: 'message',
      threadId: 'thread',
      status: 'SENT',
    });
    await service.recordDelivery('provider', 'same-event', 'DELIVERED', new Date());
    db.communicationMessage.findUnique.mockResolvedValue({
      id: 'message',
      threadId: 'thread',
      status: 'DELIVERED',
    });
    await service.recordDelivery('provider', 'same-event', 'DELIVERED', new Date());
    expect(db.messageDeliveryEvent.upsert).toHaveBeenCalledTimes(2);
    expect(db.messageDeliveryEvent.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { providerEventId: 'same-event' }, update: {} }),
    );
  });

  it.each(['BOUNCED', 'COMPLAINED'] as const)(
    '%s crea suppression, bloquea hilo y conserva evento específico',
    async (status) => {
      db.communicationMessage.findUnique.mockResolvedValue({
        id: 'message',
        threadId: 'thread',
        status: 'SENT',
      });
      await service.recordDelivery('provider', `event-${status}`, status, new Date(), status);
      expect(db.communicationConsent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ commercialStatus: 'SUPPRESSED' }),
        }),
      );
      expect(db.communicationThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'BLOCKED', handlingMode: 'PAUSED' } }),
      );
      expect(db.communicationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status }) }),
      );
    },
  );
});
