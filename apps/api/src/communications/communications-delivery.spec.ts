import { CommunicationsService } from './communications.service';

describe('Communications delivery governance', () => {
  const db: any = {
    communicationWebhookEvent: { create: jest.fn() },
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
