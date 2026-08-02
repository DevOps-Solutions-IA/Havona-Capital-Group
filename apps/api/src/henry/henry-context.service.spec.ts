import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HenryContextService } from './henry-context.service';

describe('HenryContextService', () => {
  const db = { prospect: { findFirst: jest.fn() }, company: { findFirst: jest.fn() }, opportunity: { findFirst: jest.fn(), count: jest.fn() }, task: { count: jest.fn() } } as any;
  const service = new HenryContextService(db);
  beforeEach(() => jest.clearAllMocks());

  it('rechaza contexto CRM manipulado por un visitante público', async () => {
    await expect(service.resolve({ pageType: 'prospect-detail', entityType: 'prospect', entityId: '607a72d8-3028-448f-b6cb-523573f117a0' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resuelve el rol desde la sesión y aplica aislamiento de CONSULTOR', async () => {
    db.prospect.findFirst.mockResolvedValue(null);
    const actor = { id: 'consultant', roles: ['CONSULTOR'], permissions: ['crm.read_assigned'] };
    await expect(service.resolve({ pageType: 'prospect-detail', entityType: 'prospect', entityId: '607a72d8-3028-448f-b6cb-523573f117a0' }, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.prospect.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assignments: { some: { assigneeId: 'consultant', endedAt: null } } }) }));
  });

  it('no concede herramientas públicas de consulta CRM', async () => {
    const resolved = await service.resolve({ pageType: 'public-solution', section: 'pension', intentHint: 'pension' });
    expect(resolved.role).toBe('PUBLIC');
    expect(resolved.toolPermissions).not.toContain('get_prospect_context');
    expect(resolved.toolPermissions).toContain('create_or_update_prospect');
  });

  it('clasifica roles internos sin aceptar un rol procedente del payload', async () => {
    expect(service.roleFor({ id: 'u1', roles: ['GERENTE'], permissions: [] })).toBe('MANAGER');
    expect(service.roleFor({ id: 'u2', roles: ['SUPER_ADMIN'], permissions: [] })).toBe('SUPER_ADMIN');
  });

  it('aplica least privilege a CLIENT y amplía tools solo por rol server-side', async () => {
    const client = await service.resolve({ pageType: 'other' }, { id: 'client', roles: [], permissions: [] });
    const manager = await service.resolve({ pageType: 'other' }, { id: 'manager', roles: ['GERENTE'], permissions: [] });
    expect(client.toolPermissions).toEqual(['request_human_escalation']);
    expect(manager.toolPermissions).toContain('get_available_consultants');
    expect(manager.toolPermissions).toContain('qualify_prospect');
  });

  it('limita la inteligencia operativa al ámbito del consultor', async () => {
    db.task.count.mockResolvedValue(2);
    db.opportunity.count.mockResolvedValue(3);
    const actor = { id: 'consultant', roles: ['CONSULTOR'], permissions: ['crm.read_assigned'] };
    const resolved = await service.resolve({ pageType: 'pipeline' }, actor);
    expect(db.task.count).toHaveBeenCalledWith({ where: expect.objectContaining({ assigneeId: 'consultant' }) });
    expect(db.opportunity.count).toHaveBeenCalledWith({ where: expect.objectContaining({ prospect: { assignments: { some: { assigneeId: 'consultant', endedAt: null } } } }) });
    expect(resolved.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'CRM:TASKS' })]));
  });
});
