import { HenryPolicyComposer } from './henry-policy-composer.service';
import {
  HenryClosingPolicy, HenryCustomerServicePolicy, HenryEscalationPolicy, HenryGuardrailPolicy,
  HenryIdentityPolicy, HenryKnowledgePolicy, HenrySalesPolicy, HenryTonePolicy, HenryToolPolicy,
  HenryDecisionSupportPolicy, HenryExpertCopilotPolicy, HenryQualityPolicy, HenryTeachingPolicy,
} from './henry-policies';

describe('HenryPolicyComposer', () => {
  const composer = new HenryPolicyComposer(
    new HenryIdentityPolicy(), new HenryTonePolicy(), new HenrySalesPolicy(),
    new HenryClosingPolicy(), new HenryCustomerServicePolicy(), new HenryEscalationPolicy(),
    new HenryKnowledgePolicy(), new HenryExpertCopilotPolicy(), new HenryDecisionSupportPolicy(),
    new HenryTeachingPolicy(), new HenryQualityPolicy(), new HenryGuardrailPolicy(), new HenryToolPolicy(),
  );

  it('compone el cerebro modular en orden, con versión y personalidad consistente', () => {
    const result = composer.compose({ stage: 'DISCOVERY', prospectAssociated: false });
    expect(result.manualVersion).toBe('1.1.0');
    expect(result.appliedPolicies.map((item) => item.id)).toEqual([
      'identity', 'tone', 'sales', 'closing', 'customer-service', 'escalation', 'knowledge',
      'expert-copilot', 'decision-support', 'teaching', 'quality', 'guardrails', 'tools',
    ]);
    expect(result.prompt).toContain('asistente virtual oficial de HAVONA CAPITAL GROUP');
    expect(result.prompt).toContain('consultor patrimonial senior');
    expect(result.prompt).toContain('No recomiendes una solución antes de comprender');
    expect(result.prompt).toContain('nunca afirmes ni insinúes que eres humano');
  });

  it('adapta el prompt al estado y contexto sin modificar las reglas superiores', () => {
    const result = composer.compose({ stage: 'OBJECTION', prospectAssociated: true, intention: 'pension' });
    expect(result.prompt).toContain('La etapa actual es OBJECTION');
    expect(result.prompt).toContain('Prospecto asociado: sí');
    expect(result.prompt).toContain('Nunca uses presión manipulativa');
    expect(result.prompt).toContain('Si no tienes certeza');
  });

  it('activa Expert Copilot, Sales Coach, decisión y enseñanza sin crear otro prompt', () => {
    const result = composer.compose({ stage: 'DISCOVERY', prospectAssociated: true, roleContext: 'CONSULTANT', expert: {
      mode: 'SALES_COACH', confidence: 'HIGH', reasoningType: 'COACHING', objective: 'Preparar una reunión',
      knowledgeSources: ['CRM:prospect:1'], evidence: [{ source: 'CRM:TASKS', fact: 'Una tarea vencida' }],
      recommendations: ['Revisar seguimiento'], requiresConfirmation: true,
    } });
    expect(result.prompt).toContain('Modo operativo resuelto por servidor: SALES_COACH');
    expect(result.prompt).toContain('Nivel de confianza disponible: HIGH');
    expect(result.prompt).toContain('Tipo de razonamiento esperado: COACHING');
    expect(result.prompt).toContain('Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP.');
  });
});
