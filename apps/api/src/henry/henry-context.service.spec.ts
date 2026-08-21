import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HenryContextService } from './henry-context.service';

describe('HenryContextService', () => {
  const db = {
    prospect: { findFirst: jest.fn() },
    company: { findFirst: jest.fn() },
    opportunity: { findFirst: jest.fn(), count: jest.fn() },
    task: { count: jest.fn() },
  } as any;
  const service = new HenryContextService(db);
  beforeEach(() => jest.clearAllMocks());

  it('rechaza contexto CRM manipulado por un visitante público', async () => {
    await expect(
      service.resolve({
        pageType: 'prospect-detail',
        entityType: 'prospect',
        entityId: '607a72d8-3028-448f-b6cb-523573f117a0',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resuelve el rol desde la sesión y aplica aislamiento de CONSULTOR', async () => {
    db.prospect.findFirst.mockResolvedValue(null);
    const actor = { id: 'consultant', roles: ['CONSULTOR'], permissions: ['crm.read_assigned'] };
    await expect(
      service.resolve(
        {
          pageType: 'prospect-detail',
          entityType: 'prospect',
          entityId: '607a72d8-3028-448f-b6cb-523573f117a0',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.prospect.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignments: { some: { assigneeId: 'consultant', endedAt: null } },
        }),
      }),
    );
  });

  it('no concede herramientas públicas de consulta CRM', async () => {
    const resolved = await service.resolve({
      pageType: 'public-solution',
      section: 'pension',
      intentHint: 'pension',
    });
    expect(resolved.role).toBe('PUBLIC');
    expect(resolved.toolPermissions).not.toContain('get_prospect_context');
    expect(resolved.toolPermissions).toContain('create_or_update_prospect');
  });

  it('clasifica roles internos sin aceptar un rol procedente del payload', async () => {
    expect(service.roleFor({ id: 'u1', roles: ['GERENTE'], permissions: [] })).toBe('MANAGER');
    expect(service.roleFor({ id: 'u2', roles: ['SUPER_ADMIN'], permissions: [] })).toBe(
      'SUPER_ADMIN',
    );
  });

  it('aplica least privilege a CLIENT y amplía tools solo por rol server-side', async () => {
    const client = await service.resolve(
      { pageType: 'other' },
      { id: 'client', roles: [], permissions: [] },
    );
    const manager = await service.resolve(
      { pageType: 'other' },
      { id: 'manager', roles: ['GERENTE'], permissions: [] },
    );
    expect(client.toolPermissions).toEqual(['request_human_escalation']);
    expect(manager.toolPermissions).toContain('get_available_consultants');
    expect(manager.toolPermissions).toContain('qualify_prospect');
    expect(client.toolPermissions).not.toContain('start_roleplay');
    expect(manager.toolPermissions).toContain('get_team_training_summary');
  });

  it('habilita tools propias de Academia al consultor sin exponer coaching de equipo', async () => {
    const resolved = await service.resolve(
      { pageType: 'other' },
      { id: 'consultant', roles: ['CONSULTOR'], permissions: ['training.read'] },
    );
    expect(resolved.toolPermissions).toEqual(
      expect.arrayContaining([
        'get_training_progress',
        'get_training_plan',
        'get_training_performance',
        'start_roleplay',
        'continue_roleplay',
        'evaluate_roleplay',
      ]),
    );
    expect(resolved.toolPermissions).not.toContain('get_team_training_summary');
  });

  it('habilita herramientas Meet al consultor y las niega a PUBLIC y CLIENT', async () => {
    const consultant = await service.resolve(
      { pageType: 'agenda' },
      {
        id: 'consultant',
        roles: ['CONSULTOR'],
        permissions: ['meeting.read', 'meeting.join', 'meeting.create', 'meeting.manage_own'],
      },
    );
    const visitor = await service.resolve({ pageType: 'public-home' });
    const client = await service.resolve(
      { pageType: 'other' },
      { id: 'client', roles: [], permissions: ['meeting.read'] },
    );

    expect(consultant.toolPermissions).toEqual(
      expect.arrayContaining([
        'get_meeting',
        'get_meeting_join_info',
        'create_meeting_for_calendar_event',
        'cancel_meeting',
      ]),
    );
    for (const tool of [
      'get_meeting',
      'get_meeting_join_info',
      'create_meeting_for_calendar_event',
      'cancel_meeting',
    ]) {
      expect(visitor.toolPermissions).not.toContain(tool);
      expect(client.toolPermissions).not.toContain(tool);
    }
  });

  it('limita la inteligencia operativa al ámbito del consultor', async () => {
    db.task.count.mockResolvedValue(2);
    db.opportunity.count.mockResolvedValue(3);
    const actor = { id: 'consultant', roles: ['CONSULTOR'], permissions: ['crm.read_assigned'] };
    const resolved = await service.resolve({ pageType: 'pipeline' }, actor);
    expect(db.task.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ assigneeId: 'consultant' }),
    });
    expect(db.opportunity.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        prospect: { assignments: { some: { assigneeId: 'consultant', endedAt: null } } },
      }),
    });
    expect(resolved.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'CRM:TASKS' })]),
    );
  });
});
