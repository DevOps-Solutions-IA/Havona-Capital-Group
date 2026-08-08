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
    opportunity: { findUnique: jest.fn() },
    needSolutionMapping: { findUnique: jest.fn() },
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
    config.status.mockReturnValue({ email: { configured: true }, whatsapp: { configured: true } });
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
  it('exige opt-in para clasificación comercial', async () => {
    db.communicationThread.findFirst.mockResolvedValue({
      id: 'thread',
      channel: 'EMAIL',
      status: 'OPEN',
      handlingMode: 'HUMAN',
      contactIdentity: 'person@example.com',
      consent: { commercialStatus: 'UNKNOWN' },
      messages: [],
    });
    await expect(
      service.send(
        { id: 'self', permissions: [] },
        'thread',
        { text: 'hola', messageClassification: 'COMMERCIAL' },
        {},
      ),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_CONSENT_REQUIRED' });
  });
  it('impide que Henry envíe en un hilo pausado', async () => {
    db.communicationThread.findFirst.mockResolvedValue({
      id: 'thread',
      channel: 'EMAIL',
      status: 'OPEN',
      handlingMode: 'PAUSED',
      contactIdentity: 'person@example.com',
      consent: { commercialStatus: 'OPTED_IN' },
      messages: [],
    });
    await expect(
      service.send(
        { id: 'self', permissions: [] },
        'thread',
        { text: 'hola', generatedByHenry: true },
        {},
      ),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_FORBIDDEN' });
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
  it('permite discovery por necesidad sin producto y persiste contexto autoritativo', async () => {
    db.communicationThread.findFirst.mockResolvedValue({
      id: 'thread',
      channel: 'EMAIL',
      status: 'OPEN',
      handlingMode: 'HUMAN',
      contactIdentity: 'person@example.com',
      opportunityId: 'opportunity',
      consent: { commercialStatus: 'OPTED_IN' },
      messages: [],
    });
    db.opportunity.findUnique.mockResolvedValue({
      customerNeedId: 'need',
      authorizedSolutionId: null,
      authorizedProductId: null,
      customerNeed: { status: 'ACTIVE' },
      authorizedSolution: null,
      authorizedProduct: null,
    });
    db.communicationMessage.upsert.mockResolvedValue({
      id: 'message',
      generatedByHenry: false,
    });
    await service.send(
      { id: 'self', permissions: [] },
      'thread',
      { text: 'Seguimiento consultivo', messageClassification: 'RELATIONSHIP' },
      {},
    );
    expect(db.communicationMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            commercialContext: expect.objectContaining({
              customerNeedId: 'need',
              authorizedProductId: null,
            }),
          }),
        }),
      }),
    );
  });
  it('rechaza producto inactivo sin traducir interest legacy', async () => {
    db.communicationThread.findFirst.mockResolvedValue({
      id: 'thread',
      channel: 'EMAIL',
      status: 'OPEN',
      handlingMode: 'HUMAN',
      contactIdentity: 'person@example.com',
      opportunityId: 'opportunity',
      consent: { commercialStatus: 'OPTED_IN' },
      messages: [],
    });
    db.opportunity.findUnique.mockResolvedValue({
      customerNeedId: null,
      authorizedSolutionId: null,
      authorizedProductId: 'product',
      customerNeed: null,
      authorizedSolution: null,
      authorizedProduct: {
        status: 'INACTIVE',
        carrier: 'PAN_AMERICAN_LIFE_COLOMBIA',
      },
    });
    await expect(
      service.send(
        { id: 'self', permissions: [] },
        'thread',
        { text: 'Producto', messageClassification: 'RELATIONSHIP' },
        {},
      ),
    ).rejects.toMatchObject({ code: 'PALIG_PRODUCT_INACTIVE' });
    expect(db.communicationMessage.upsert).not.toHaveBeenCalled();
  });
});
