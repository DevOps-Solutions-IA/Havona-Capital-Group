import { HenryExpertCopilotService } from './henry-expert-copilot.service';
import type { ResolvedHenryContext } from './henry-context.service';

describe('HenryExpertCopilotService', () => {
  const service = new HenryExpertCopilotService();
  const consultantContext: ResolvedHenryContext = {
    role: 'CONSULTANT', page: { pageType: 'prospect-detail', entityType: 'prospect', entityId: '607a72d8-3028-448f-b6cb-523573f117a0' },
    entity: { type: 'prospect', id: '607a72d8-3028-448f-b6cb-523573f117a0', known: { status: 'NEW' }, missing: ['city'] },
    toolPermissions: ['get_prospect_context', 'create_task'],
    evidence: [{ source: 'CRM:TASKS', fact: '1 tarea abierta vencida' }],
    recommendations: ['Revisar la tarea vencida'],
  };

  it('detecta Sales Coach desde objetivo y rol resuelto por servidor', () => {
    const profile = service.analyze('Prepárame para la reunión y practiquemos una objeción', consultantContext);
    expect(profile.mode).toBe('SALES_COACH');
    expect(profile.reasoningType).toBe('COACHING');
    expect(profile.knowledgeSources).toContain('CRM:prospect:607a72d8-3028-448f-b6cb-523573f117a0');
  });

  it('construye inteligencia CRM solo con evidencia real y confianza conservadora', () => {
    const profile = service.analyze('¿Qué hago ahora con este prospecto?', consultantContext);
    expect(profile.mode).toBe('CRM_INTELLIGENCE');
    expect(profile.confidence).toBe('MEDIUM');
    expect(profile.evidence).toEqual(consultantContext.evidence);
    expect(profile.recommendations).toEqual(['Revisar la tarea vencida']);
  });

  it('activa Teach Mode y Knowledge Assistant sin inventar fuentes', () => {
    expect(service.analyze('Enséñame paso a paso cómo preparar una llamada', consultantContext).mode).toBe('TEACH_MODE');
    expect(service.analyze('¿Qué dice la arquitectura y el roadmap?', { ...consultantContext, entity: undefined, evidence: [] }).mode).toBe('KNOWLEDGE_ASSISTANT');
  });

  it('mantiene memoria corporativa por referencias y no duplica contexto al navegar', () => {
    const profile = service.analyze('Analiza el siguiente paso', consultantContext);
    const first = service.memory({}, consultantContext, profile);
    const next = service.memory(first as any, { ...consultantContext, page: { pageType: 'pipeline', selectedStage: 'nuevo' }, entity: undefined }, profile);
    expect(first.contextId).toContain('prospect-detail:prospect:');
    expect(next.contextId).toBe('pipeline:root');
    expect(next.longTermMemoryReference).toEqual(['prospect:607a72d8-3028-448f-b6cb-523573f117a0']);
    expect(next.lastObjective).toBe('Analiza el siguiente paso');
  });

  it('exige confirmación para mutaciones internas y conserva auditoría sin prompts', () => {
    const profile = service.analyze('Crea una tarea para mañana', consultantContext);
    const memory = service.memory({}, consultantContext, profile);
    const audit = service.audit(profile, memory);
    expect(profile.requiresConfirmation).toBe(true);
    expect(audit.toolDecision).toBe('CONFIRMATION_REQUIRED');
    expect(audit).toEqual(expect.objectContaining({ policyId: 'expert-copilot', roleContext: 'CONSULTANT', confidence: 'MEDIUM' }));
    expect(JSON.stringify(audit)).not.toContain('prompt');
  });

  it('mantiene al público en modo consultivo sin capacidades internas', () => {
    const profile = service.analyze('Quiero entender cómo proteger a mi familia', { role: 'PUBLIC', page: { pageType: 'public-home' }, toolPermissions: [] });
    expect(profile.mode).toBe('PUBLIC_ADVISOR');
    expect(profile.confidence).toBe('LOW');
  });
});
