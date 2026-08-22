import { AutomationService } from './automation.service';
import {
  AUTOMATION_TRIGGER_COVERAGE,
  GOLDEN_OPERATIONAL_SET,
} from './automation-operational-coverage';
import { AUTOMATION_TRIGGER_TYPES } from './automation.types';

describe('Henry CRM + Automation Operational Core', () => {
  const db: any = {
    task: { findMany: jest.fn() },
    prospect: { findMany: jest.fn() },
    calendarEventLink: { findMany: jest.fn() },
    communicationMessage: { findMany: jest.fn(), findFirst: jest.fn() },
    domainOutboxEvent: { updateMany: jest.fn(), findMany: jest.fn() },
    automationSchedule: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const audit: any = { record: jest.fn() };
  const queue: any = {
    scheduleOperationalScan: jest.fn(),
    enqueueOutbox: jest.fn(),
    scheduleWorkflow: jest.fn(),
  };
  const access: any = { teamMembers: jest.fn() };
  const eventBus: any = { publish: jest.fn() };
  const service = new AutomationService(
    db,
    audit,
    queue,
    access,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    eventBus,
    {} as any,
  );
  const now = new Date('2030-01-20T15:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    db.task.findMany.mockResolvedValue([]);
    db.prospect.findMany.mockResolvedValue([]);
    db.calendarEventLink.findMany.mockResolvedValue([]);
    db.communicationMessage.findMany.mockResolvedValue([]);
    db.communicationMessage.findFirst.mockResolvedValue(null);
    eventBus.publish.mockResolvedValue({ duplicate: false });
    db.domainOutboxEvent.updateMany.mockResolvedValue({ count: 0 });
    db.domainOutboxEvent.findMany.mockResolvedValue([]);
    db.automationSchedule.findMany.mockResolvedValue([]);
  });

  it('mantiene una matriz completa trigger → producer → consumer', () => {
    expect(AUTOMATION_TRIGGER_COVERAGE).toHaveLength(AUTOMATION_TRIGGER_TYPES.length);
    expect(AUTOMATION_TRIGGER_COVERAGE.map((row) => row.trigger).sort()).toEqual(
      [...AUTOMATION_TRIGGER_TYPES].sort(),
    );
    expect(AUTOMATION_TRIGGER_COVERAGE.every((row) => row.consumer === 'AUTOMATIONS_CORE')).toBe(
      true,
    );
    expect(AUTOMATION_TRIGGER_COVERAGE.filter((row) => row.producer === null)).toEqual([]);
  });

  it('mantiene 30 escenarios operativos con contrato determinista completo', () => {
    expect(GOLDEN_OPERATIONAL_SET).toHaveLength(30);
    for (const scenario of GOLDEN_OPERATIONAL_SET) {
      expect(scenario).toEqual(
        expect.objectContaining({
          event: expect.any(String),
          expectedExecution: expect.any(String),
          scope: expect.any(String),
          confirmation: expect.any(String),
          idempotent: true,
          audited: true,
          result: expect.any(String),
        }),
      );
    }
  });

  it('publica una sola señal determinista por vencimiento', async () => {
    db.task.findMany.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        prospectId: '00000000-0000-4000-8000-000000000002',
        opportunityId: null,
        assigneeId: '00000000-0000-4000-8000-000000000003',
        dueAt: new Date('2030-01-19T15:00:00.000Z'),
      },
    ]);
    await service.scanOperationalSignals(now);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'task:overdue:00000000-0000-4000-8000-000000000001:2030-01-19T15:00:00.000Z',
        type: 'TASK_OVERDUE',
        actorUserId: '00000000-0000-4000-8000-000000000003',
      }),
    );
  });

  it('detecta inactividad sin PII y excluye actividad futura válida', async () => {
    const base = {
      createdAt: new Date('2029-12-01T00:00:00.000Z'),
      updatedAt: new Date('2030-01-01T00:00:00.000Z'),
      lastCapturedAt: new Date('2030-01-01T00:00:00.000Z'),
      assignments: [{ assigneeId: '00000000-0000-4000-8000-000000000003' }],
      interactions: [],
      activities: [],
      communicationThreads: [],
      calendarEvents: [],
      cadenceEnrollments: [],
    };
    db.prospect.findMany.mockResolvedValue([
      {
        ...base,
        id: '00000000-0000-4000-8000-000000000004',
        tasks: [],
      },
      {
        ...base,
        id: '00000000-0000-4000-8000-000000000005',
        tasks: [{ id: 'future-task' }],
      },
    ]);
    await service.scanOperationalSignals(now);
    const inactive = eventBus.publish.mock.calls
      .map(([event]: any[]) => event)
      .filter((event: any) => event.type === 'PROSPECT_INACTIVE');
    expect(inactive).toHaveLength(1);
    expect(inactive[0].entityId).toBe('00000000-0000-4000-8000-000000000004');
    expect(inactive[0].payload).not.toHaveProperty('name');
    expect(inactive[0].payload).not.toHaveProperty('email');
    expect(inactive[0].payload).not.toHaveProperty('phone');
  });

  it('no produce no-reply si hubo respuesta posterior', async () => {
    db.communicationMessage.findMany.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000006',
        threadId: '00000000-0000-4000-8000-000000000007',
        createdAt: new Date('2030-01-17T00:00:00.000Z'),
        thread: { prospectId: null, opportunityId: null, assignedUserId: null },
      },
    ]);
    db.communicationMessage.findFirst.mockResolvedValue({ id: 'reply' });
    await service.scanOperationalSignals(now);
    expect(
      eventBus.publish.mock.calls.some(([event]: any[]) => event.type === 'COMMUNICATION_NO_REPLY'),
    ).toBe(false);
  });

  it('aísla workflows OWN y permite TEAM sólo para membresías reales', async () => {
    const scope = (service as any).matchesWorkflowScope.bind(service);
    const event = { payload: { assignedUserId: 'consultant-b' } };
    expect(
      await scope(
        { scope: 'OWN', ownerUserId: 'consultant-a', createdById: 'consultant-a' },
        event,
      ),
    ).toBe(false);
    db.user.findUnique.mockResolvedValue({
      id: 'manager',
      isActive: true,
      roles: [
        {
          role: {
            name: 'GERENTE',
            permissions: [{ permission: { key: 'automations.manage_team' } }],
          },
        },
      ],
    });
    access.teamMembers.mockResolvedValue([{ id: 'consultant-b' }]);
    expect(
      await scope({ scope: 'TEAM', ownerUserId: 'manager', createdById: 'manager' }, event),
    ).toBe(true);
  });

  it('rechaza scope no demostrable en vez de inferir propiedad', async () => {
    await expect(
      (service as any).matchesWorkflowScope(
        { scope: 'OWN', ownerUserId: 'owner', createdById: 'owner' },
        { actorUserId: 'owner', payload: {} },
      ),
    ).resolves.toBe(false);
  });

  it('recupera leases PROCESSING vencidos y rearma el scan en BullMQ', async () => {
    db.domainOutboxEvent.findMany.mockResolvedValue([{ eventId: 'recoverable-event' }]);
    await expect(service.recoverPending()).resolves.toEqual({ outbox: 1, schedules: 0 });
    expect(db.domainOutboxEvent.updateMany).toHaveBeenCalledWith({
      where: { status: 'PROCESSING', availableAt: { lte: expect.any(Date) } },
      data: { status: 'FAILED', failureCode: 'AUTOMATION_RECOVERY_PENDING' },
    });
    expect(queue.enqueueOutbox).toHaveBeenCalledWith('recoverable-event');
    expect(queue.scheduleOperationalScan).toHaveBeenCalled();
  });
});
