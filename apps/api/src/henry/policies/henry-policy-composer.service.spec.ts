import { HenryPolicyComposer } from './henry-policy-composer.service';
import {
  HenryClosingPolicy, HenryCustomerServicePolicy, HenryEscalationPolicy, HenryGuardrailPolicy,
  HenryIdentityPolicy, HenryKnowledgePolicy, HenrySalesPolicy, HenryTonePolicy, HenryToolPolicy,
} from './henry-policies';

describe('HenryPolicyComposer', () => {
  const composer = new HenryPolicyComposer(
    new HenryIdentityPolicy(), new HenryTonePolicy(), new HenrySalesPolicy(),
    new HenryClosingPolicy(), new HenryCustomerServicePolicy(), new HenryEscalationPolicy(),
    new HenryKnowledgePolicy(), new HenryGuardrailPolicy(), new HenryToolPolicy(),
  );

  it('compone las nueve políticas en orden, con versión y personalidad consistente', () => {
    const result = composer.compose({ stage: 'DISCOVERY', prospectAssociated: false });
    expect(result.manualVersion).toBe('1.0.0');
    expect(result.appliedPolicies.map((item) => item.id)).toEqual([
      'identity', 'tone', 'sales', 'closing', 'customer-service', 'escalation', 'knowledge', 'guardrails', 'tools',
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
});
