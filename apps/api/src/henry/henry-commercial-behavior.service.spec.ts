import { HENRY_COMMERCIAL_GOLDEN_SET } from './henry-commercial-behavior.golden';
import {
  HenryCommercialBehaviorService,
  type HenryCommercialMemory,
} from './henry-commercial-behavior.service';

describe('HenryCommercialBehaviorService', () => {
  const service = new HenryCommercialBehaviorService();

  it('mantiene un Golden Conversation Set de mínimo 40 escenarios y diez enfoques', () => {
    expect(HENRY_COMMERCIAL_GOLDEN_SET).toHaveLength(40);
    expect(new Set(HENRY_COMMERCIAL_GOLDEN_SET.map((scenario) => scenario.topic)).size).toBe(10);
  });

  it.each(HENRY_COMMERCIAL_GOLDEN_SET)('$id · $scenario', ({ message, prior, topic, expected }) => {
    const result = service.analyze({
      content: message,
      currentStage: 'GREETING',
      role: 'PUBLIC',
      prior,
    });
    expect(result.detectedIntent).toBe(expected.intent);
    expect(result.stage).toBe(expected.stage);
    expect(result.nextBestAction).toBe(expected.action);
    expect(Boolean(result.escalation)).toBe(expected.escalation ?? false);
    expect(result.commercialNeed).toBe(topic);
    expect(result.nextQuestion ? result.nextQuestion.split('?').length - 1 : 0).toBeLessThanOrEqual(
      1,
    );
    expect(service.prompt(result)).toContain('UNKNOWN nunca es un hecho');
    expect(service.prompt(result)).not.toMatch(/\b(?:\d+[.,]\d+\s*%|COP\s*\d+|USD\s*\d+)\b/);
  });

  it('progresa sobre las etapas existentes sin crear una segunda máquina de estados', () => {
    const discovery = service.analyze({
      content: 'Quiero planear mi pensión.',
      currentStage: 'GREETING',
      role: 'PUBLIC',
    });
    const diagnosis = service.analyze({
      content: 'Hoy tengo un ahorro y me preocupa que no sea suficiente para mi pensión.',
      currentStage: discovery.stage,
      role: 'PUBLIC',
      prior: discovery.memory,
    });
    expect(discovery.stage).toBe('DISCOVERY');
    expect(diagnosis.stage).toBe('DIAGNOSIS');
    expect(diagnosis.memory.need).toBe('PENSION');
  });

  it('distingue CONFIRMED, INFERRED y UNKNOWN sin convertir hints en hechos', () => {
    const result = service.analyze({
      content: 'Quisiera conocer más.',
      currentStage: 'GREETING',
      role: 'PUBLIC',
      pageIntentHint: 'pension',
    });
    expect(result.commercialNeed).toBe('PENSION');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'primaryObjective',
          status: 'INFERRED',
          source: 'PAGE_HINT',
        }),
        expect.objectContaining({ field: 'horizon', status: 'UNKNOWN', source: 'NONE' }),
      ]),
    );
  });

  it('preserva sólo hechos confirmados y contexto comercial relevante', () => {
    const first = service.analyze({
      content: 'Quiero planear educación y me preocupa no llegar a tiempo.',
      currentStage: 'GREETING',
      role: 'PUBLIC',
    });
    const second = service.analyze({
      content: 'Dentro de 8 años.',
      currentStage: first.stage,
      role: 'PUBLIC',
      prior: first.memory,
    });
    expect(second.memory.need).toBe('EDUCATION');
    expect(second.memory.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'primaryObjective', status: 'CONFIRMED' }),
        expect.objectContaining({ field: 'mainConcern', status: 'CONFIRMED' }),
        expect.objectContaining({ field: 'horizon', status: 'CONFIRMED' }),
      ]),
    );
  });

  it('evita repetir preguntas y nunca pregunta un dato ya confirmado', () => {
    const prior: HenryCommercialMemory = {
      need: 'PENSION',
      facts: [
        {
          field: 'primaryObjective',
          status: 'CONFIRMED',
          value: 'Pensión',
          source: 'USER_EXPLICIT',
        },
      ],
      objections: [],
      questionsAsked: ['¿Qué tienes hoy previsto para tu retiro?'],
      agreedNextStep: null,
    };
    const result = service.analyze({
      content: 'Quiero seguir revisándolo.',
      currentStage: 'DISCOVERY',
      role: 'PUBLIC',
      prior,
    });
    expect(result.nextQuestion).not.toBe('¿Qué tienes hoy previsto para tu retiro?');
    expect(result.nextQuestion).not.toMatch(/qu[eé] te gustar[ií]a lograr/i);
  });

  it.each([
    ['No tengo dinero', 'no-budget'],
    ['Está muy costoso', 'price'],
    ['Lo voy a pensar', 'thinking'],
    ['Debo hablar con mi esposo', 'partner'],
    ['Ya tengo seguro', 'already-covered'],
    ['Quiero comparar', 'comparing'],
    ['No confío en las aseguradoras', 'trust'],
    ['Soy muy joven', 'young'],
    ['Luego lo reviso', 'later'],
    ['Prefiero invertir por mi cuenta', 'investment'],
    ['No es prioridad', 'not-priority'],
    ['No entiendo el producto', 'not-understood'],
    ['Mándame información', 'send-info'],
    ['No quiero hablar con vendedor', 'no-salesperson'],
  ])('clasifica la objeción %s como %s', (message, objection) => {
    expect(
      service.analyze({
        content: message,
        currentStage: 'DISCOVERY',
        role: 'PUBLIC',
      }).objection?.id,
    ).toBe(objection);
  });

  it('detiene presión después de rechazo explícito', () => {
    const result = service.analyze({
      content: 'No quiero continuar y no me contacten.',
      currentStage: 'OBJECTION',
      role: 'PUBLIC',
    });
    expect(result.nextBestAction).toBe('STOP_COMMERCIAL_CONVERSATION');
    expect(result.nextQuestion).toBeNull();
    expect(result.escalation).toBeNull();
  });

  it.each(['PUBLIC', 'CLIENT', 'CONSULTANT', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const)(
    'mantiene el análisis comercial aislado del rol y sin conceder herramientas para %s',
    (role) => {
      const result = service.analyze({
        content: 'Ayúdame a preparar una conversación de pensión.',
        currentStage: 'DISCOVERY',
        role,
      });
      expect(result).not.toHaveProperty('toolPermissions');
      expect(service.audit(result)).not.toHaveProperty('content');
    },
  );

  it('genera un handoff útil sin guardar inferencias como confirmadas', () => {
    const result = service.analyze({
      content: 'Quiero hablar con un asesor sobre mi pensión; me preocupa llegar sin ahorro.',
      currentStage: 'DIAGNOSIS',
      role: 'PUBLIC',
    });
    expect(result.escalation).toMatchObject({ reason: 'USER_REQUEST' });
    expect(result.escalation?.summary).toContain('Intención: HUMAN_REQUEST');
    expect(result.escalation?.summary).toContain('Contexto confirmado');
    expect(result.escalation?.summary).not.toContain('INFERRED');
  });

  it('rechaza promesas y cifras sin evidencia, pero permite abstención segura', () => {
    expect(
      service.evaluateOutput('Este plan paga 100 millones y garantiza 8%.', false),
    ).toMatchObject({
      action: 'REJECT',
      ruleId: 'COMMERCIAL-UNSUPPORTED-CLAIM-001',
    });
    expect(service.evaluateOutput('Te van a aceptar sin ningún riesgo.', true).action).toBe(
      'REJECT',
    );
    expect(
      service.evaluateOutput('No tengo información suficiente para afirmarlo.', false).action,
    ).toBe('ALLOW');
  });

  it('registra observabilidad segura y explicable sin PII ni razonamiento privado', () => {
    const result = service.analyze({
      content: 'Quiero planear mi pensión.',
      currentStage: 'GREETING',
      role: 'PUBLIC',
    });
    expect(service.audit(result)).toEqual({
      conversationStage: 'DISCOVERY',
      detectedIntent: 'NEED_DISCOVERY',
      confidence: 'MEDIUM',
      commercialNeed: 'PENSION',
      nextBestAction: 'ASK_ONE_QUESTION',
      escalationReason: null,
      policyId: 'commercial-behavior',
      ruleId: expect.stringContaining('COMMERCIAL-'),
    });
  });
});
