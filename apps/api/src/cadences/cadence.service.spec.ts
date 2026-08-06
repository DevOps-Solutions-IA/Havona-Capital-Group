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
      { id: 'enrollment', version: { stopConditions: ['OPT_OUT'] } },
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
});
