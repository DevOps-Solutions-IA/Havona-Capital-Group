import { BadRequestException } from '@nestjs/common';
import { CadenceService } from './cadence.service';

describe('HAVONA Enterprise Cadences', () => {
  const db: any = {
    automationEvent: { findUnique: jest.fn() },
    cadenceEnrollment: { findMany: jest.fn(), update: jest.fn() },
    cadenceStepExecution: { updateMany: jest.fn() },
  };
  const audit: any = { record: jest.fn() };
  const access: any = { authorizeRelations: jest.fn(), teamMembers: jest.fn() };
  const queue: any = { cancelCadenceEnrollment: jest.fn() };
  const service = new CadenceService(db, audit, access, queue, {} as any, {} as any, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('detiene por inbound real aunque Henry todavía no clasifique la respuesta', async () => {
    db.automationEvent.findUnique.mockResolvedValue({
      type: 'COMMUNICATION_INBOUND',
      entityType: 'CommunicationThread',
      entityId: 'thread',
      payload: { threadId: 'thread' },
    });
    db.cadenceEnrollment.findMany.mockResolvedValue([
      { id: 'enrollment', version: { stopConditions: ['CUSTOMER_REPLIED'] } },
    ]);
    db.cadenceEnrollment.update.mockResolvedValue({ id: 'enrollment', status: 'STOPPED' });
    db.cadenceStepExecution.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.handleDomainEvent('event:inbound')).resolves.toEqual({ stopped: 1 });
    expect(queue.cancelCadenceEnrollment).toHaveBeenCalledWith('enrollment');
  });

  it('no detiene por un evento no relacionado', async () => {
    db.automationEvent.findUnique.mockResolvedValue({ type: 'PROSPECT_UPDATED', payload: {} });
    await expect(service.handleDomainEvent('event:unrelated')).resolves.toEqual({ stopped: 0 });
    expect(queue.cancelCadenceEnrollment).not.toHaveBeenCalled();
  });

  it('no amplía un stop a todas las cadencias cuando el evento carece de relaciones', async () => {
    db.automationEvent.findUnique.mockResolvedValue({
      type: 'COMMUNICATION_INBOUND',
      entityType: 'Unknown',
      entityId: 'unknown',
      payload: {},
    });
    await expect(service.handleDomainEvent('event:without-scope')).resolves.toEqual({ stopped: 0 });
    expect(db.cadenceEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('opt-out gana y cancela pasos futuros', async () => {
    db.automationEvent.findUnique.mockResolvedValue({
      type: 'COMMUNICATION_OPT_OUT',
      entityType: 'CommunicationThread',
      entityId: 'thread',
      payload: {},
    });
    db.cadenceEnrollment.findMany.mockResolvedValue([
      { id: 'enrollment', version: { stopConditions: [] } },
    ]);
    db.cadenceEnrollment.update.mockResolvedValue({});
    db.cadenceStepExecution.updateMany.mockResolvedValue({ count: 2 });
    await service.handleDomainEvent('event:optout');
    expect(db.cadenceStepExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED', failureCode: 'OPT_OUT' }),
      }),
    );
  });

  it('pausa toda cadencia relacionada durante takeover humano', async () => {
    db.automationEvent.findUnique.mockResolvedValue({
      type: 'COMMUNICATION_HUMAN_ESCALATION',
      entityType: 'CommunicationThread',
      entityId: 'thread',
      payload: {},
    });
    db.cadenceEnrollment.findMany.mockResolvedValue([
      { id: 'enrollment', version: { stopConditions: [] } },
    ]);
    db.cadenceEnrollment.update.mockResolvedValue({ id: 'enrollment', status: 'PAUSED' });
    db.cadenceStepExecution.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.handleDomainEvent('event:takeover')).resolves.toEqual({ stopped: 1 });
    expect(db.cadenceEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAUSED', stopReason: 'HUMAN_TAKEOVER' }),
      }),
    );
  });

  it('bloquea takeover humano, pausa y supresión en la revalidación final', () => {
    const assertThread = (service as any).assertThread.bind(service);
    expect(() =>
      assertThread({
        status: 'OPEN',
        handlingMode: 'HUMAN',
        consent: { commercialStatus: 'OPTED_IN' },
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertThread({
        status: 'OPEN',
        handlingMode: 'HENRY',
        consent: { commercialStatus: 'SUPPRESSED' },
      }),
    ).toThrow('CONSENT_BLOCK');
  });

  it('rechaza envío sin template y WhatsApp futuro sin provider', () => {
    const validate = (service as any).validateSteps.bind(service);
    expect(() =>
      validate([{ type: 'SEND_EMAIL', approvalMode: 'HUMAN_ONLY', definition: {} }]),
    ).toThrow('CADENCE_TEMPLATE_REQUIRED');
    expect(() =>
      validate([{ type: 'SEND_WHATSAPP_FUTURE', approvalMode: 'HUMAN_ONLY', definition: {} }]),
    ).toThrow('CADENCE_PROVIDER_UNAVAILABLE');
  });

  it('normaliza la próxima ejecución a una ventana laboral explícita', () => {
    const next = (service as any).nextAllowed(new Date('2026-08-09T14:00:00.000Z'), {
      days: [1, 2, 3, 4, 5],
      start: '08:00',
      end: '18:00',
      timezone: 'America/Bogota',
    });
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      weekday: 'short',
    }).format(next);
    expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(weekday);
  });

  it('revalida un prospecto vigente con email normalizado antes del dispatch', async () => {
    const contactDb: any = {
      prospect: {
        findUnique: jest.fn().mockResolvedValue({ normalizedEmail: 'valid@example.com' }),
      },
      communicationThread: {
        findUnique: jest.fn().mockResolvedValue({
          prospectId: 'prospect',
          status: 'OPEN',
          handlingMode: 'HENRY',
          consent: { commercialStatus: 'OPTED_IN' },
        }),
      },
      emailTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          activeVersionId: 'version',
          status: 'ACTIVE',
          versions: [{ id: 'version' }],
        }),
      },
      cadenceStepExecution: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const contactService = new CadenceService(
      contactDb,
      audit,
      access,
      queue,
      {} as any,
      {} as any,
      {} as any,
    );
    const item = {
      id: 'execution',
      status: 'CLAIMED',
      enrollment: {
        id: 'enrollment',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60_000),
        prospectId: 'prospect',
        communicationThreadId: 'thread',
        opportunityId: null,
        version: {
          frequencyPolicy: { maxPerDay: 2, maxPerSevenDays: 3, minimumIntervalMinutes: 1 },
        },
      },
      step: { type: 'SEND_EMAIL', templateKey: 'meeting.post_meeting_summary' },
    };

    await expect((contactService as any).revalidate(item)).resolves.toBeUndefined();
    expect(contactDb.prospect.findUnique).toHaveBeenCalledWith({
      where: { id: 'prospect' },
      select: { normalizedEmail: true },
    });
    expect(contactDb.emailTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          key: 'meeting.post_meeting_summary',
          locale: 'es-CO',
          isCorporate: true,
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('conserva CONTACT_INVALID si el email se elimina después del enrollment', async () => {
    const contactDb: any = {
      prospect: { findUnique: jest.fn().mockResolvedValue({ normalizedEmail: null }) },
      communicationThread: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'OPEN',
          handlingMode: 'HENRY',
          consent: { commercialStatus: 'OPTED_IN' },
        }),
      },
    };
    const contactService = new CadenceService(
      contactDb,
      audit,
      access,
      queue,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      (contactService as any).revalidate({
        enrollment: {
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 60_000),
          prospectId: 'prospect',
          communicationThreadId: 'thread',
          opportunityId: null,
        },
        step: { type: 'SEND_EMAIL', templateKey: null },
      }),
    ).rejects.toThrow('CONTACT_INVALID');
  });

  it('no despacha si una respuesta detiene el enrollment antes del claim final', async () => {
    const raceDb: any = {
      cadenceStepExecution: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const raceService = new CadenceService(
      raceDb,
      audit,
      access,
      queue,
      {} as any,
      {} as any,
      {} as any,
    );
    const item = { status: 'SCHEDULED', enrollment: { status: 'ACTIVE' } };
    jest.spyOn(raceService as any, 'loadStep').mockResolvedValue(item);
    jest.spyOn(raceService as any, 'revalidate').mockResolvedValue(undefined);
    const perform = jest
      .spyOn(raceService as any, 'perform')
      .mockResolvedValue({ status: 'QUEUED' });

    await expect(raceService.executeStep('execution')).resolves.toEqual({ ignored: true });
    expect(perform).not.toHaveBeenCalled();
  });

  it('no confunde el contexto de un error Prisma con CONTACT_INVALID', () => {
    const classify = (service as any).failure.bind(service);
    expect(
      classify(
        new Error('Invalid findUnique invocation near: if (!prospect.email) throw CONTACT_INVALID'),
      ),
    ).toEqual({ code: 'POLICY_BLOCK', retryable: false });
  });
});
