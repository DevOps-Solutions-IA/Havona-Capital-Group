import { CrmService } from './crm.service';
import { Prisma } from '@havona/database';

describe('CrmService', () => {
  const consultant = {
    id: '11111111-1111-4111-8111-111111111111',
    permissions: ['crm.read_assigned', 'crm.opportunities', 'crm.tasks.own'],
  };
  it('limita la bandeja del consultor a asignaciones activas', async () => {
    const db = {
      prospect: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (values: Promise<unknown>[]) => Promise.all(values)),
    } as any;
    const service = new CrmService(db, { record: jest.fn() } as any);
    await service.prospects(
      { page: 1, pageSize: 25, sortBy: 'lastCapturedAt', sortOrder: 'desc' },
      consultant,
    );
    expect(db.prospect.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignments: { some: { assigneeId: consultant.id, endedAt: null } },
        }),
      }),
    );
  });

  it('exige resultado explícito al mover una oportunidad a Cerrado', async () => {
    const db = {
      opportunity: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'opp',
          prospectId: 'prospect',
          stageId: 'old',
          status: 'OPEN',
          stage: { key: 'new' },
        }),
      },
      pipelineStage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'closed', key: 'closed', name: 'Cerrado' }),
      },
      $transaction: jest.fn(),
    } as any;
    const service = new CrmService(db, { record: jest.fn() } as any);
    await expect(
      service.moveOpportunity('opp', { stageId: 'closed' }, consultant, {
        auth: { user: consultant },
        headers: {},
      }),
    ).rejects.toThrow('Debe indicar el resultado');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('impide que un consultor actualice tareas ajenas', async () => {
    const db = { task: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    const service = new CrmService(db, { record: jest.fn() } as any);
    await expect(
      service.taskStatus('task', 'COMPLETED' as any, consultant, {
        auth: { user: consultant },
        headers: {},
      }),
    ).rejects.toThrow('Tarea no encontrada');
    expect(db.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task',
        assigneeId: consultant.id,
        prospect: { assignments: { some: { assigneeId: consultant.id, endedAt: null } } },
      },
    });
  });

  it('emite PROSPECT_STAGE_CHANGED después de una transición válida', async () => {
    const updatedAt = new Date('2030-01-01T10:00:00.000Z');
    const tx: any = {
      prospect: {
        update: jest.fn().mockResolvedValue({ id: 'prospect', status: 'REVIEWED', updatedAt }),
      },
      activity: { create: jest.fn() },
    };
    const db: any = {
      prospect: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prospect' }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ status: 'NEW', assignments: [{ assigneeId: consultant.id }] }),
      },
      $transaction: jest.fn((operation) => operation(tx)),
    };
    const events = { publish: jest.fn() };
    const service = new CrmService(db, { record: jest.fn() } as any, events as any);
    await service.updateProspect('prospect', { status: 'REVIEWED' }, consultant, {
      auth: { user: consultant },
      headers: {},
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'prospect:stage:prospect:2030-01-01T10:00:00.000Z',
        type: 'PROSPECT_STAGE_CHANGED',
        actorUserId: consultant.id,
        payload: {
          prospectId: 'prospect',
          assignedUserId: consultant.id,
          previousStatus: 'NEW',
          newStatus: 'REVIEWED',
        },
      }),
    );
  });

  it('reutiliza una tarea existente con idempotencyKey interno', async () => {
    const task = {
      id: '00000000-0000-4000-8000-000000000099',
      prospectId: 'prospect',
      assigneeId: consultant.id,
    };
    const db: any = {
      prospect: { findFirst: jest.fn().mockResolvedValue({ id: 'prospect' }) },
      task: { findUnique: jest.fn().mockResolvedValue(task) },
      $transaction: jest.fn(),
    };
    const service = new CrmService(db, { record: jest.fn() } as any);
    await expect(
      service.createTask(
        {
          idempotencyKey: task.id,
          prospectId: 'prospect',
          assigneeId: consultant.id,
          title: 'Seguimiento',
          dueAt: new Date(),
        },
        consultant,
        {},
      ),
    ).resolves.toBe(task);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('exige permiso específico para cerrar una oportunidad', async () => {
    const db = {
      opportunity: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'opp',
          prospectId: 'prospect',
          stageId: 'old',
          status: 'OPEN',
          stage: { key: 'new' },
        }),
      },
      pipelineStage: {
        findFirst: jest.fn().mockResolvedValue({ id: 'closed', key: 'closed', name: 'Cerrado' }),
      },
      $transaction: jest.fn(),
    } as any;
    const service = new CrmService(db, { record: jest.fn() } as any);
    await expect(
      service.moveOpportunity('opp', { stageId: 'closed', outcome: 'WON' }, consultant, {
        auth: { user: consultant },
        headers: {},
      }),
    ).rejects.toThrow('No puede cerrar oportunidades');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza relaciones cruzadas entre prospecto y oportunidad', async () => {
    const tx = { opportunity: { findFirst: jest.fn().mockResolvedValue(null) } };
    const db = {
      prospect: { findFirst: jest.fn().mockResolvedValue({ id: 'prospect-a' }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any;
    const service = new CrmService(db, { record: jest.fn() } as any);
    await expect(
      service.createNote(
        { prospectId: 'prospect-a', opportunityId: 'opportunity-b', body: 'Seguimiento' },
        consultant,
        { auth: { user: consultant }, headers: {} },
      ),
    ).rejects.toThrow('La oportunidad no pertenece');
  });

  it('preserva precisión, provenance e historial al cambiar monto', async () => {
    const current = {
      id: 'opp',
      prospectId: 'prospect',
      stageId: 'stage',
      status: 'OPEN',
      stage: { key: 'new' },
      amount: new Prisma.Decimal('100000000.00'),
      currency: 'COP',
      expectedCloseDate: null,
      probability: null,
      forecastCategory: null,
    };
    const tx: any = {
      opportunity: {
        update: jest.fn().mockImplementation(({ data }) => ({
          ...current,
          ...data,
          updatedAt: new Date('2026-08-06T12:00:00Z'),
        })),
      },
      opportunityFinancialHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const db: any = {
      opportunity: { findFirst: jest.fn().mockResolvedValue(current) },
      $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
    };
    const audit = { record: jest.fn() };
    const events = { publish: jest.fn() };
    const service = new CrmService(db, audit as any, events as any);
    const result = await service.updateOpportunityFinancials(
      'opp',
      { amount: '120000000.25', reason: 'Alcance confirmado' },
      consultant,
      { auth: { user: consultant }, headers: {} },
    );
    expect(result.amount!.toString()).toBe('120000000.25');
    expect(tx.opportunityFinancialHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        field: 'amount',
        oldValue: '100000000',
        newValue: '120000000.25',
        source: 'MANUAL',
        reason: 'Alcance confirmado',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      'CRM_OPPORTUNITY_FINANCIALS_UPDATED',
      'Opportunity',
      'opp',
      expect.anything(),
      expect.objectContaining({ changes: expect.any(Array) }),
      tx,
    );
  });

  it('mantiene moneda obligatoria y valida fecha de negocio', async () => {
    const current = {
      id: 'opp',
      prospectId: 'prospect',
      stageId: 'stage',
      status: 'OPEN',
      stage: { key: 'new' },
      amount: null,
      currency: null,
      expectedCloseDate: null,
      probability: null,
      forecastCategory: null,
    };
    const db: any = { opportunity: { findFirst: jest.fn().mockResolvedValue(current) } };
    const service = new CrmService(db, { record: jest.fn() } as any);
    await expect(
      service.updateOpportunityFinancials('opp', { amount: '500.00' }, consultant, {
        auth: { user: consultant },
        headers: {},
      }),
    ).rejects.toThrow('moneda es obligatoria');
    await expect(
      service.updateOpportunityFinancials('opp', { expectedCloseDate: '2026-02-31' }, consultant, {
        auth: { user: consultant },
        headers: {},
      }),
    ).rejects.toThrow('Fecha de cierre esperada inválida');
  });

  it('permite discovery con necesidad activa y producto aún desconocido', async () => {
    const current = {
      id: 'opp',
      prospectId: 'prospect',
      stage: { key: 'new' },
      customerNeedId: null,
      authorizedSolutionId: null,
      authorizedProductId: null,
    };
    const db: any = {
      opportunity: {
        findFirst: jest.fn().mockResolvedValue(current),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...current, customerNeed: null }),
        update: jest.fn(({ data }) => ({ ...current, ...data, updatedAt: new Date() })),
      },
      customerNeed: { findFirst: jest.fn().mockResolvedValue({ id: 'need', key: 'EDUCATION' }) },
    };
    db.$transaction = jest.fn(async (callback: (client: any) => unknown) => callback(db));
    const service = new CrmService(db, { record: jest.fn() } as any);
    const result = await service.updateOpportunityCommercialContext(
      'opp',
      { customerNeedKey: 'EDUCATION' },
      consultant,
      { auth: { user: consultant }, headers: {} },
    );
    expect(result).toEqual(
      expect.objectContaining({
        customerNeedId: 'need',
        authorizedProductId: null,
        authorizedSolutionId: null,
      }),
    );
  });

  it('acepta exclusivamente solución y producto PALIG activos con mapping autorizado', async () => {
    const current = {
      id: 'opp',
      prospectId: 'prospect',
      stage: { key: 'new' },
      customerNeedId: null,
      authorizedSolutionId: null,
      authorizedProductId: null,
    };
    const db: any = {
      opportunity: {
        findFirst: jest.fn().mockResolvedValue(current),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...current, customerNeed: null }),
        update: jest.fn(({ data }) => ({ ...current, ...data, updatedAt: new Date() })),
      },
      customerNeed: {
        findFirst: jest.fn().mockResolvedValue({ id: 'need', key: 'FAMILY_PROTECTION' }),
      },
      authorizedSolution: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'solution',
          productId: 'product',
          product: { id: 'product', carrier: 'PAN_AMERICAN_LIFE_COLOMBIA', status: 'ACTIVE' },
          needMappings: [{ customerNeedId: 'need' }],
        }),
      },
    };
    db.$transaction = jest.fn(async (callback: (client: any) => unknown) => callback(db));
    const service = new CrmService(db, { record: jest.fn() } as any);
    const result = await service.updateOpportunityCommercialContext(
      'opp',
      { customerNeedKey: 'FAMILY_PROTECTION', authorizedSolutionId: 'solution' },
      consultant,
      { auth: { user: consultant }, headers: {} },
    );
    expect(result).toEqual(
      expect.objectContaining({
        customerNeedId: 'need',
        authorizedSolutionId: 'solution',
        authorizedProductId: 'product',
      }),
    );
  });

  it('rechaza producto arbitrario o no activo sin debilitar scope CRM', async () => {
    const current = {
      id: 'opp',
      prospectId: 'prospect',
      stage: { key: 'new' },
      customerNeedId: null,
      authorizedSolutionId: null,
      authorizedProductId: null,
    };
    const db: any = {
      opportunity: {
        findFirst: jest.fn().mockResolvedValue(current),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...current, customerNeed: null }),
      },
      authorizedProduct: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    db.$transaction = jest.fn(async (callback: (client: any) => unknown) => callback(db));
    const service = new CrmService(db, { record: jest.fn() } as any);
    await expect(
      service.updateOpportunityCommercialContext(
        'opp',
        { authorizedProductId: 'unauthorized' },
        consultant,
        { auth: { user: consultant }, headers: {} },
      ),
    ).rejects.toThrow('Producto no autorizado');
    expect(db.opportunity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ prospect: expect.any(Object) }) }),
    );
  });
});
