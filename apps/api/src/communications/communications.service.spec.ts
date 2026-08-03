import { ForbiddenException } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
describe('HAVONA Communications Core', () => {
  const db: any = {
    calendarTeamMembership: { findMany: jest.fn() },
    communicationThread: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    communicationMessage: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    communicationConsent: { findUnique: jest.fn() },
    whatsAppTemplate: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    communicationAssignment: { updateMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit: any = { record: jest.fn() },
    access: any = { assertUserScope: jest.fn(), authorizeRelations: jest.fn() },
    config: any = { status: jest.fn(), attachmentMaxSize: 100 },
    queue: any = { enqueueSend: jest.fn() };
  const service = new CommunicationsService(db, audit, access, config, queue);
  beforeEach(() => {
    jest.clearAllMocks();
    db.communicationThread.findMany.mockResolvedValue([]);
    db.communicationThread.count.mockResolvedValue(0);
    db.$transaction.mockImplementation((arg: any) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : arg({
            communicationAssignment: db.communicationAssignment,
            communicationThread: db.communicationThread,
          }),
    );
  });
  it('CONSULTOR lista únicamente hilos asignados propios', async () => {
    await service.list(
      { id: 'self', roles: ['CONSULTOR'], permissions: ['communications.read'] },
      {},
    );
    expect(db.communicationThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedUserId: { in: ['self'] } }),
      }),
    );
  });
  it('GERENTE limita el ámbito a membresías explícitas', async () => {
    db.calendarTeamMembership.findMany.mockResolvedValue([{ memberId: 'member' }]);
    await service.list(
      {
        id: 'manager',
        roles: ['GERENTE'],
        permissions: ['communications.read', 'communications.manage_team'],
      },
      {},
    );
    expect(db.communicationThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assignedUserId: { in: ['manager', 'member'] } }),
      }),
    );
  });
  it('delega IDOR y consistencia CRM al acceso corporativo', async () => {
    db.communicationThread.findFirst.mockResolvedValue({ id: 'thread', messages: [] });
    access.authorizeRelations.mockRejectedValue(new ForbiddenException());
    await expect(
      service.linkCrm({ id: 'consultant', permissions: [] }, 'thread', { prospectId: 'cross' }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.communicationThread.update).not.toHaveBeenCalled();
  });
  it('bloquea envío a contacto suprimido', async () => {
    db.communicationThread.findFirst.mockResolvedValue({
      id: 'thread',
      channel: 'EMAIL',
      status: 'OPEN',
      contactIdentity: 'person@example.com',
      consent: { commercialStatus: 'OPTED_OUT' },
      messages: [],
    });
    await expect(
      service.send({ id: 'self', permissions: [] }, 'thread', { text: 'hola' }, {}),
    ).rejects.toMatchObject({ code: 'CONTACT_SUPPRESSED' });
    expect(queue.enqueueSend).not.toHaveBeenCalled();
  });
  it('exige plantilla fuera de ventana WhatsApp', async () => {
    db.communicationThread.findFirst.mockResolvedValue({
      id: 'thread',
      channel: 'WHATSAPP',
      status: 'OPEN',
      contactIdentity: '+573001112233',
      consent: null,
      messages: [],
    });
    config.status.mockReturnValue({ whatsapp: { configured: true } });
    db.communicationMessage.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 25 * 3600000),
    });
    await expect(
      service.send({ id: 'self', permissions: [] }, 'thread', { text: 'hola' }, {}),
    ).rejects.toMatchObject({ code: 'WHATSAPP_TEMPLATE_REQUIRED' });
  });
  it('takeover humano se audita sin invocar a Henry', async () => {
    db.communicationThread.findFirst.mockResolvedValue({
      id: 'thread',
      handlingMode: 'HENRY',
      messages: [],
    });
    db.communicationThread.update.mockResolvedValue({ id: 'thread', handlingMode: 'HUMAN' });
    await service.setMode(
      { id: 'self', permissions: ['communications.takeover'] },
      'thread',
      'HUMAN',
      {},
    );
    expect(audit.record).toHaveBeenCalledWith(
      'COMMUNICATION_HUMAN_TAKEOVER',
      'CommunicationThread',
      'thread',
      {},
      expect.objectContaining({ mode: 'HUMAN' }),
    );
  });
});
