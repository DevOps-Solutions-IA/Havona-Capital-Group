import { AutomationService } from './automation.service';
import { createWorkflowSchema } from './automation.types';

describe('HAVONA Automations Core', () => {
  const db: any = {},
    audit: any = { record: jest.fn() },
    queue: any = {
      enqueueOutbox: jest.fn(),
      enqueueExecution: jest.fn(),
      cancelExecution: jest.fn(),
      scheduleWorkflow: jest.fn(),
      cancelSchedule: jest.fn(),
    };
  const access: any = { assertUserScope: jest.fn(), teamMembers: jest.fn() },
    crm: any = { createTask: jest.fn(), assign: jest.fn(), moveOpportunity: jest.fn() };
  const communications: any = { send: jest.fn(), setMode: jest.fn() },
    henry: any = { reasonForAutomation: jest.fn() };
  const eventBus: any = { publish: jest.fn() };
  const service = new AutomationService(
    db,
    audit,
    queue,
    access,
    crm,
    communications,
    henry,
    eventBus,
  );

  it('acepta únicamente triggers y actions allowlisted', () => {
    expect(
      createWorkflowSchema.safeParse({
        name: 'Seguimiento real',
        scope: 'OWN',
        trigger: { type: 'PROSPECT_CREATED', definition: {} },
        actions: [
          { type: 'CREATE_CRM_TASK', definition: { title: 'Contactar' }, approvalMode: 'AUTO' },
        ],
      }).success,
    ).toBe(true);
    expect(
      createWorkflowSchema.safeParse({
        name: 'Código libre',
        trigger: { type: 'eval', definition: {} },
        actions: [{ type: 'javascript', definition: {} }],
      }).success,
    ).toBe(false);
  });
  it('evalúa condiciones sin eval ni JavaScript dinámico', () => {
    const evaluate = (service as any).evaluateCondition.bind(service);
    expect(
      evaluate(
        { field: 'prospect.stage', operator: 'EQUALS', value: 'new' },
        { prospect: { stage: 'new' } },
      ),
    ).toBe(true);
    expect(
      evaluate({ field: 'daysInactive', operator: 'GTE', value: 14 }, { daysInactive: 7 }),
    ).toBe(false);
  });
  it('obliga aprobación para mutaciones sensibles y razonamiento Henry', () => {
    const validate = (service as any).validateWorkflow.bind(service);
    for (const type of [
      'SEND_EMAIL',
      'SEND_WHATSAPP_TEXT',
      'ASSIGN_CONSULTANT',
      'UPDATE_CRM_STAGE',
      'HENRY_REASONING',
    ])
      expect(() => validate([{ type, definition: {}, approvalMode: 'AUTO' }])).toThrow(
        'requiere confirmación',
      );
  });
  it('genera clave de ejecución determinística', () => {
    const key = (service as any).executionKey.bind(service);
    expect(key('event-1', 'workflow-1', '00000000-0000-4000-8000-000000000001', 1)).toBe(
      key('event-1', 'workflow-1', '00000000-0000-4000-8000-000000000001', 1),
    );
    expect(key('event-1', 'workflow-1', '00000000-0000-4000-8000-000000000001', 1)).not.toBe(
      key('event-1', 'workflow-1', '00000000-0000-4000-8000-000000000001', 2),
    );
  });
  it('delega eventos al bus transaccional', async () => {
    eventBus.publish.mockResolvedValueOnce({ duplicate: false });
    const input: any = {
      eventId: 'provider:event:1',
      type: 'COMMUNICATION_INBOUND',
      entityType: 'CommunicationThread',
      entityId: '00000000-0000-4000-8000-000000000001',
      payload: {},
    };
    await expect(service.publishEvent(input)).resolves.toEqual({ duplicate: false });
    expect(eventBus.publish).toHaveBeenCalledWith(input);
  });
  it('detiene una ejecución cuando existe suppression', async () => {
    db.automationExecution = {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'e',
          workflowId: 'w',
          workflowVersion: 1,
          entityType: 'Prospect',
          entityId: 'p',
          status: 'QUEUED',
          currentStep: 0,
          context: {},
          workflow: { status: 'ACTIVE', maxSteps: 25, actions: [] },
          approvals: [],
        }),
      update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'e', ...data })),
    };
    db.automationSuppression = { findFirst: jest.fn().mockResolvedValue({ id: 's' }) };
    const result = await service.execute('e');
    expect(result.status).toBe('SUPPRESSED');
    expect(result.failureCode).toBe('AUTOMATION_SUPPRESSED');
  });
  it('rechaza delay inválido y evita loops de pasos ilimitados', () => {
    expect(() =>
      (service as any).validateWorkflow([
        { type: 'DELAY', definition: { delayMinutes: 0 }, approvalMode: 'AUTO' },
      ]),
    ).toThrow('Delay inválido');
    expect(() =>
      (service as any).validateWorkflow(
        Array.from({ length: 26 }, () => ({
          type: 'CREATE_CRM_TASK',
          definition: {},
          approvalMode: 'AUTO',
        })),
      ),
    ).toThrow('máximo');
  });
  it('programa disparadores temporales en BullMQ y no usa timers en memoria', async () => {
    const schedule = {
      id: '00000000-0000-4000-8000-000000000011',
      workflowId: 'w',
      timezone: 'America/Bogota',
    };
    db.automationSchedule = { upsert: jest.fn().mockResolvedValue(schedule) };
    await (service as any).activateSchedules({
      id: 'w',
      triggers: [
        {
          type: 'SCHEDULED_TIME',
          definition: {
            runAt: '2030-01-01T10:00:00.000Z',
            entityType: 'Prospect',
            entityId: '00000000-0000-4000-8000-000000000001',
          },
        },
      ],
    });
    expect(queue.scheduleWorkflow).toHaveBeenCalledWith(
      schedule.id,
      'w',
      expect.any(Date),
      undefined,
      'America/Bogota',
    );
  });
  it('rechaza programaciones sin entidad persistente', async () => {
    await expect(
      (service as any).activateSchedules({
        id: 'w',
        triggers: [{ type: 'RECURRING_SCHEDULE', definition: { cron: '0 9 * * 1-5' } }],
      }),
    ).rejects.toThrow('entityType y entityId');
  });
  it('ejecuta acciones corporativas mediante CRM y Communications Core', async () => {
    db.user = {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000002',
          isActive: true,
          roles: [
            {
              role: {
                name: 'ADMIN',
                permissions: [{ permission: { key: 'communications.takeover' } }],
              },
            },
          ],
        }),
    };
    const execution: any = {
      id: 'e',
      entityType: 'Prospect',
      entityId: '00000000-0000-4000-8000-000000000001',
      context: {},
      workflow: { ownerUserId: '00000000-0000-4000-8000-000000000002' },
    };
    communications.setMode.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000003',
      handlingMode: 'HUMAN',
    });
    await expect(
      (service as any).executeAction(
        {
          ...execution,
          entityType: 'CommunicationThread',
          entityId: '00000000-0000-4000-8000-000000000003',
        },
        { id: 'a', type: 'REQUEST_HUMAN_ESCALATION', definition: {} },
      ),
    ).resolves.toEqual(expect.objectContaining({ mode: 'HUMAN' }));
    expect(communications.setMode).toHaveBeenCalled();
  });
  it('limita el alcance del gerente a miembros explícitos de su equipo', async () => {
    access.teamMembers.mockResolvedValueOnce([{ id: 'consultant-a' }]);
    await expect(
      (service as any).ownerScope({ id: 'manager', permissions: ['automations.manage_team'] }),
    ).resolves.toEqual(['manager', 'consultant-a']);
    expect(access.teamMembers).toHaveBeenCalled();
  });
  it('mantiene al consultor aislado en su propio ámbito', async () => {
    await expect(
      (service as any).ownerScope({ id: 'consultant', permissions: ['automations.manage_own'] }),
    ).resolves.toEqual(['consultant']);
  });
});
