import { HenryPolicyEngine } from './henry-policy-engine.service';

describe('HenryPolicyEngine', () => {
  const engine = new HenryPolicyEngine();

  it('mantiene descubrimiento sin saltar prematuramente a venta', () => {
    expect(engine.evaluateInput('Quiero entender mejor cómo proteger a mi familia')).toEqual(
      expect.objectContaining({
        action: 'ALLOW',
        policyId: 'sales',
        ruleId: 'DISCOVERY-CONTINUE-001',
      }),
    );
  });

  it.each([
    ['Está caro para mí', 'OBJ-PRICE'],
    ['Lo voy a pensar', 'OBJ-THINKING'],
    ['Tengo que hablar con mi pareja', 'OBJ-PARTNER'],
    ['Ya tengo seguro', 'OBJ-ALREADY-COVERED'],
    ['No confío en aseguradoras', 'OBJ-TRUST'],
    ['Prefiero invertir', 'OBJ-INVESTMENT'],
    ['No tengo dinero ahora', 'OBJ-NO-BUDGET'],
    ['Luego lo vemos', 'OBJ-LATER'],
    ['Soy muy joven', 'OBJ-YOUNG'],
    ['No necesito eso', 'OBJ-NOT-NEEDED'],
    ['Mándame información', 'OBJ-SEND-INFO'],
    ['Estoy comparando', 'OBJ-COMPARING'],
  ])('clasifica la objeción %s con una regla auditable', (content, ruleId) => {
    expect(engine.evaluateInput(content)).toEqual(
      expect.objectContaining({ stage: 'OBJECTION', policyId: 'closing', ruleId }),
    );
  });

  it('detecta intención de cierre hacia agenda sin afirmar que existe una cita', () => {
    expect(engine.evaluateInput('Quiero agendar una cita')).toEqual(
      expect.objectContaining({ stage: 'APPOINTMENT', ruleId: 'CLOSE-APPOINTMENT-001' }),
    );
  });

  it('detiene el modelo ante una solicitud explícita de humano', () => {
    expect(engine.evaluateInput('Quiero hablar con un asesor humano')).toEqual(
      expect.objectContaining({
        action: 'ESCALATE',
        reason: 'USER_REQUEST',
        stage: 'ESCALATION',
        ruleId: 'ESC-HUMAN-001',
      }),
    );
  });

  it.each([
    'Presentaré una demanda',
    'Necesito asesoría tributaria definitiva',
    'Estoy furioso, esto es una estafa',
  ])('escala de forma segura el contexto sensible: %s', (content) => {
    expect(engine.evaluateInput(content)).toEqual(
      expect.objectContaining({ action: 'ESCALATE', reason: 'SENSITIVE_CONTEXT' }),
    );
  });

  it.each([
    'Le garantizamos el resultado',
    'La rentabilidad garantizada es excelente',
    'Su póliza fue aprobada',
    'Este es un diagnóstico médico definitivo',
  ])('rechaza promesas o afirmaciones prohibidas: %s', (content) => {
    expect(engine.evaluateOutput(content)).toEqual(
      expect.objectContaining({
        action: 'REJECT',
        policyId: 'guardrails',
        ruleId: 'GRD-PROMISE-001',
      }),
    );
  });

  it('permite una respuesta honesta que reconoce falta de conocimiento', () => {
    expect(
      engine.evaluateOutput(
        'No tengo información confirmada para responder eso; puedo solicitar apoyo humano.',
      ).action,
    ).toBe('ALLOW');
  });
});
