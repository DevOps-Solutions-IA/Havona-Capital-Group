import { Injectable } from '@nestjs/common';
import { HENRY_OBJECTION_CATALOG } from './policies/objection-catalog';
import type { HenryConfidence, HenryConversationStage } from './policies/henry-policy.types';
import type { HenryRoleContext } from './henry-context.service';

export const HENRY_COMMERCIAL_INTENTS = [
  'INFORMATION',
  'EXPLORATION',
  'NEED_DISCOVERY',
  'PRODUCT_INTEREST',
  'COMPARISON',
  'OBJECTION',
  'PURCHASE_INTENT',
  'APPOINTMENT_INTENT',
  'HUMAN_REQUEST',
  'FOLLOW_UP',
  'COMPLAINT',
  'UNKNOWN',
] as const;

export type HenryCommercialIntent = (typeof HENRY_COMMERCIAL_INTENTS)[number];

export const HENRY_COMMERCIAL_NEEDS = [
  'PENSION',
  'EDUCATION',
  'WEALTH',
  'FAMILY_PROTECTION',
  'ACCIDENT_PROTECTION',
  'CRITICAL_ILLNESS',
  'BUSINESS_PROTECTION',
  'PARTNER_PROTECTION',
  'SOLE_OWNER_CONTINUITY',
  'CONSULTANT_RECRUITMENT',
] as const;

export type HenryCommercialNeed = (typeof HENRY_COMMERCIAL_NEEDS)[number];
export type HenryFactStatus = 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';
export type HenryCommercialField =
  | 'primaryObjective'
  | 'familyOrBusinessContext'
  | 'horizon'
  | 'priority'
  | 'currentSituation'
  | 'mainConcern'
  | 'willingness';

export type HenryCommercialFact = {
  field: HenryCommercialField;
  status: HenryFactStatus;
  value?: string;
  source: 'USER_EXPLICIT' | 'PAGE_HINT' | 'NONE';
};

export type HenryNextBestAction =
  | 'ASK_ONE_QUESTION'
  | 'PRESENT_AUTHORIZED_INFORMATION'
  | 'REQUEST_MISSING_DATA'
  | 'PREPARE_APPOINTMENT'
  | 'REQUEST_APPOINTMENT'
  | 'ESCALATE_TO_HUMAN'
  | 'FOLLOW_UP_WITH_CONSENT'
  | 'STOP_COMMERCIAL_CONVERSATION';

export type HenryCommercialMemory = {
  need: HenryCommercialNeed | null;
  facts: HenryCommercialFact[];
  objections: string[];
  questionsAsked: string[];
  agreedNextStep: HenryNextBestAction | null;
};

export type HenryCommercialBehavior = {
  stage: HenryConversationStage;
  detectedIntent: HenryCommercialIntent;
  confidence: HenryConfidence;
  commercialNeed: HenryCommercialNeed | null;
  facts: HenryCommercialFact[];
  objection: null | { id: string; label: string; nextQuestion: string };
  nextBestAction: HenryNextBestAction;
  explanation: string;
  nextQuestion: string | null;
  escalation: null | {
    reason:
      | 'USER_REQUEST'
      | 'SENSITIVE_CONTEXT'
      | 'LOW_CONFIDENCE'
      | 'UNSUPPORTED_INTENT'
      | 'HIGH_VALUE_CASE';
    summary: string;
  };
  ruleId: string;
  memory: HenryCommercialMemory;
};

type AnalyzeInput = {
  content: string;
  currentStage: HenryConversationStage;
  role: HenryRoleContext;
  pageIntentHint?: string;
  prior?: Partial<HenryCommercialMemory>;
};

type NeedPlaybook = {
  signals: readonly RegExp[];
  questions: Partial<Record<HenryCommercialField, string>>;
};

const FIELD_ORDER: readonly HenryCommercialField[] = [
  'primaryObjective',
  'currentSituation',
  'mainConcern',
  'horizon',
  'priority',
  'familyOrBusinessContext',
  'willingness',
];

const GENERIC_QUESTIONS: Record<HenryCommercialField, string> = {
  primaryObjective: '¿Qué te gustaría lograr o proteger principalmente?',
  familyOrBusinessContext: '¿Hay alguna persona o parte de tu empresa que debamos considerar?',
  horizon: '¿En qué horizonte te gustaría avanzar con este objetivo?',
  priority: '¿Qué tan prioritario es resolverlo en este momento?',
  currentSituation: '¿Qué tienes previsto hoy para ese objetivo?',
  mainConcern: '¿Qué es lo que más te preocupa de dejarlo como está?',
  willingness: '¿Te gustaría revisar el siguiente paso con un consultor?',
};

const PLAYBOOKS: Record<HenryCommercialNeed, NeedPlaybook> = {
  PENSION: {
    signals: [/pensi[oó]n/i, /retiro/i, /jubila/i],
    questions: {
      currentSituation: '¿Qué tienes hoy previsto para tu retiro?',
      mainConcern: '¿Qué te preocupa más de tu situación pensional actual?',
      horizon: '¿En qué horizonte esperas retirarte?',
    },
  },
  EDUCATION: {
    signals: [/educaci[oó]n/i, /universidad/i, /estudios? de (mis|los) hijos/i],
    questions: {
      currentSituation: '¿Qué tienes previsto hoy para financiar ese objetivo educativo?',
      horizon: '¿Cuándo esperas necesitar esos recursos?',
    },
  },
  WEALTH: {
    signals: [/patrimonio/i, /capital/i, /ahorr/i, /acumulaci[oó]n/i],
    questions: {
      primaryObjective: '¿Qué objetivo concreto quieres alcanzar al construir patrimonio?',
      horizon: '¿En qué plazo te gustaría verlo materializado?',
    },
  },
  FAMILY_PROTECTION: {
    signals: [
      /proteger.{0,20}(familia|hijos|pareja)/i,
      /protecci[oó]n familiar/i,
      /dependientes?/i,
    ],
    questions: {
      familyOrBusinessContext: '¿Quiénes dependen hoy de tus ingresos o de tu cuidado?',
      mainConcern: '¿Qué impacto te preocupa más si tus ingresos llegaran a faltar?',
    },
  },
  ACCIDENT_PROTECTION: {
    signals: [/accidente/i, /incapacidad accidental/i, /moto/i],
    questions: {
      currentSituation: '¿Qué protección tienes hoy ante una incapacidad o accidente?',
      mainConcern: '¿Qué impacto económico tendría para ti una incapacidad por accidente?',
    },
  },
  CRITICAL_ILLNESS: {
    signals: [/c[aá]ncer/i, /enfermedad(es)? grave/i, /enfermedad cr[ií]tica/i],
    questions: {
      currentSituation: '¿Qué respaldo tienes hoy ante una enfermedad grave?',
      mainConcern: '¿Qué impacto económico te preocuparía más en ese escenario?',
    },
  },
  BUSINESS_PROTECTION: {
    signals: [/empresari/i, /empresa/i, /persona clave/i, /continuidad empresarial/i],
    questions: {
      familyOrBusinessContext:
        '¿Qué personas o funciones son críticas para la continuidad de la empresa?',
      mainConcern: '¿Qué situación podría afectar más la continuidad del negocio?',
    },
  },
  PARTNER_PROTECTION: {
    signals: [/\bsocios\b/i, /socio(?!\s+[uú]nico)/i, /acuerdo societario/i],
    questions: {
      familyOrBusinessContext:
        '¿Cuántos socios participan y cómo se distribuyen hoy las responsabilidades?',
      mainConcern: '¿Qué ocurriría con la empresa si uno de los socios no pudiera continuar?',
    },
  },
  SOLE_OWNER_CONTINUITY: {
    signals: [/socio [uú]nico/i, /[uú]nico (socio|dueño|propietario)/i],
    questions: {
      familyOrBusinessContext:
        '¿Quién podría dar continuidad a la empresa si tú no pudieras operar?',
      mainConcern: '¿Qué parte del negocio depende exclusivamente de ti?',
    },
  },
  CONSULTANT_RECRUITMENT: {
    signals: [
      /ser consultor/i,
      /carrera.{0,20}consultor/i,
      /trabajar.{0,20}(havona|consultor)/i,
      /reclutamiento/i,
    ],
    questions: {
      primaryObjective: '¿Qué buscas principalmente en una carrera como consultor?',
      currentSituation: '¿Qué experiencia tienes hoy en servicio, ventas o consultoría?',
    },
  },
};

const STOP_PATTERN =
  /(no (quiero|deseo|me interesa) (continuar|seguir|hablar(?! con (?:un )?(?:vendedor|comercial)))|no me contact(en|es)|d[eé]jame en paz|para (la conversaci[oó]n|de insistir))/i;
const HUMAN_PATTERN =
  /(?:(quiero|necesito|prefiero|comun[ií]came|p[aá]same).{0,30}(humano|persona|asesor)|(hablar|contactar|comunicarme).{0,20}(con )?(un )?consultor)/i;
const COMPLAINT_PATTERN = /(queja|reclamo|demanda|estafa|incumplimiento|mal servicio)/i;
const SPECIFIC_QUOTE_PATTERN =
  /(cotizaci[oó]n|cot[ií]zame|precio exacto|cu[aá]nto (me )?(cuesta|vale)|tarifa exacta)/i;
const CONFLICT_PATTERN =
  /(dos (documentos|fuentes).{0,35}(diferente|contradic)|informaci[oó]n contradictoria|fuentes? en conflicto)/i;
const INTERNAL_DATA_PATTERN =
  /(mu[eé]strame|dame|revela|comparte).{0,40}(prompt|pol[ií]tica interna|datos? de otros|clientes?|base de datos|credenciales|token|secreto)/i;

@Injectable()
export class HenryCommercialBehaviorService {
  analyze(input: AnalyzeInput): HenryCommercialBehavior {
    const content = input.content.replace(/\s+/g, ' ').trim();
    const prior = this.normalizeMemory(input.prior);
    const explicitNeed = this.detectNeed(content);
    const hintedNeed = explicitNeed ? null : this.needFromHint(input.pageIntentHint);
    const commercialNeed = explicitNeed ?? prior.need ?? hintedNeed;
    const intent = this.detectIntent(content);
    const objection = this.detectObjection(content);
    const facts = this.profile(
      content,
      commercialNeed,
      prior.facts,
      Boolean(explicitNeed),
      hintedNeed,
    );
    const questionsAsked = [...new Set(prior.questionsAsked)];
    const explicitStop = STOP_PATTERN.test(content);
    const escalation = this.escalation(content, intent, commercialNeed, facts);
    const stage = this.stage(intent, input.currentStage, facts, objection !== null, explicitStop);
    const nextQuestion = this.nextQuestion(commercialNeed, facts, questionsAsked, objection);
    const nextBestAction = this.nextBestAction({
      intent,
      stage,
      facts,
      objection: objection !== null,
      escalation: escalation !== null,
      explicitStop,
      role: input.role,
    });
    const ruleId = this.ruleId(intent, nextBestAction, objection?.id);
    const memory: HenryCommercialMemory = {
      need: commercialNeed,
      facts,
      objections: [...new Set([...prior.objections, ...(objection ? [objection.id] : [])])].slice(
        -8,
      ),
      questionsAsked,
      agreedNextStep: nextBestAction,
    };
    return {
      stage,
      detectedIntent: intent,
      confidence: this.confidence(intent, commercialNeed, facts),
      commercialNeed,
      facts,
      objection,
      nextBestAction,
      explanation: this.explanation(nextBestAction, intent, commercialNeed, facts),
      nextQuestion:
        nextBestAction === 'ASK_ONE_QUESTION' || nextBestAction === 'REQUEST_MISSING_DATA'
          ? nextQuestion
          : null,
      escalation,
      ruleId,
      memory,
    };
  }

  prompt(behavior: HenryCommercialBehavior) {
    const confirmed = behavior.facts
      .filter((fact) => fact.status === 'CONFIRMED')
      .map(({ field, value }) => ({ field, value }));
    const inferred = behavior.facts
      .filter((fact) => fact.status === 'INFERRED')
      .map(({ field, value }) => ({ field, value }));
    const unknown = behavior.facts
      .filter((fact) => fact.status === 'UNKNOWN')
      .map((fact) => fact.field);
    return [
      '<henry-commercial-behavior>',
      `stage=${behavior.stage}`,
      `intent=${behavior.detectedIntent}`,
      `confidence=${behavior.confidence}`,
      `need=${behavior.commercialNeed ?? 'UNKNOWN'}`,
      `confirmed=${JSON.stringify(confirmed)}`,
      `inferred=${JSON.stringify(inferred)}`,
      `unknown=${JSON.stringify(unknown)}`,
      `objection=${behavior.objection?.id ?? 'NONE'}`,
      `nextBestAction=${behavior.nextBestAction}`,
      `explanation=${JSON.stringify(behavior.explanation)}`,
      `nextQuestion=${JSON.stringify(behavior.nextQuestion)}`,
      'Sigue ENTENDER → PERFILAR → PROFUNDIZAR → IDENTIFICAR NECESIDAD → VALIDAR → ORIENTAR → PROPONER SIGUIENTE PASO.',
      'Haz como máximo una pregunta breve por turno. No repitas preguntas ni preguntes datos ya CONFIRMED.',
      'INFERRED es hipótesis para confirmar; UNKNOWN nunca es un hecho. No mezcles necesidades no confirmadas.',
      'Responde sobre productos únicamente con evidencia autorizada. Ante evidencia insuficiente indica: "No tengo información suficiente para afirmarlo."',
      'No presiones. Si la persona rechaza continuar, detén toda conversación comercial.',
      '</henry-commercial-behavior>',
    ].join('\n');
  }

  audit(behavior: HenryCommercialBehavior) {
    return {
      conversationStage: behavior.stage,
      detectedIntent: behavior.detectedIntent,
      confidence: behavior.confidence,
      commercialNeed: behavior.commercialNeed,
      nextBestAction: behavior.nextBestAction,
      escalationReason: behavior.escalation?.reason ?? null,
      policyId: 'commercial-behavior',
      ruleId: behavior.ruleId,
    };
  }

  evaluateOutput(content: string, authorizedProductEvidence: boolean) {
    const unsupportedCommercialClaim =
      /(cubre|incluye|garantiza|paga|beneficio|rentabilidad|tasa|tarifa|prima|precio|elegible|aceptad[oa]|aprobad[oa]).{0,80}(\d+(?:[.,]\d+)?\s*%|\$\s*\d|usd|cop|millones?|sin (l[ií]mite|exclusiones|carencia))/i;
    const absolutePromise =
      /(te van a aceptar|ser[aá]s aceptad[oa]|te pagar[aá]n|siempre (cubre|paga)|est[aá] garantizad[oa]|sin ning[uú]n riesgo)/i;
    if (
      absolutePromise.test(content) ||
      (!authorizedProductEvidence && unsupportedCommercialClaim.test(content))
    )
      return {
        action: 'REJECT' as const,
        policyId: 'commercial-behavior',
        ruleId: 'COMMERCIAL-UNSUPPORTED-CLAIM-001',
        response:
          'No tengo información suficiente para afirmarlo. Esa condición debe verificarse con evidencia autorizada y, cuando corresponda, con un consultor.',
      };
    return {
      action: 'ALLOW' as const,
      policyId: 'commercial-behavior',
      ruleId: 'COMMERCIAL-EVIDENCE-ALLOW-001',
    };
  }

  recordQuestion(memory: HenryCommercialMemory, question: string): HenryCommercialMemory {
    return {
      ...memory,
      questionsAsked: [...new Set([...memory.questionsAsked, question])].slice(-16),
    };
  }

  private detectIntent(content: string): HenryCommercialIntent {
    if (STOP_PATTERN.test(content)) return 'FOLLOW_UP';
    if (HUMAN_PATTERN.test(content)) return 'HUMAN_REQUEST';
    if (COMPLAINT_PATTERN.test(content)) return 'COMPLAINT';
    if (/(agendar|agenda|cita|reuni[oó]n|reservar horario)/i.test(content))
      return 'APPOINTMENT_INTENT';
    if (HENRY_OBJECTION_CATALOG.some((item) => item.signals.some((signal) => signal.test(content))))
      return 'OBJECTION';
    if (
      /(quiero comprar|quiero contratar|estoy listo|c[oó]mo lo contrato|tomar el producto)/i.test(
        content,
      )
    )
      return 'PURCHASE_INTENT';
    if (SPECIFIC_QUOTE_PATTERN.test(content) || /(qu[eé] producto|qu[eé] plan)/i.test(content))
      return 'PRODUCT_INTEREST';
    if (/(compar|diferencia|versus|vs\.?)/i.test(content)) return 'COMPARISON';
    if (/(seguimiento|retomar|hablamos antes|quedamos en)/i.test(content)) return 'FOLLOW_UP';
    if (
      /(ay[uú]dame a entender|quiero explorar|estoy evaluando|quisiera conocer|quiero (?:conocer|informaci[oó]n)|conocer (?:la )?carrera)/i.test(
        content,
      )
    )
      return 'EXPLORATION';
    if (
      /(me preocupa|necesito proteger|quiero planear|quiero prepararme|no tengo claro)/i.test(
        content,
      )
    )
      return 'NEED_DISCOVERY';
    if (/\?|qu[eé] es|c[oó]mo funciona|informaci[oó]n|expl[ií]came/i.test(content))
      return 'INFORMATION';
    return content ? 'UNKNOWN' : 'UNKNOWN';
  }

  private detectObjection(content: string) {
    const item = HENRY_OBJECTION_CATALOG.find((candidate) =>
      candidate.signals.some((signal) => signal.test(content)),
    );
    return item
      ? { id: item.id, label: item.label, nextQuestion: item.diagnosticQuestions[0]! }
      : null;
  }

  private detectNeed(content: string) {
    if (/socio [uú]nico/i.test(content)) return 'SOLE_OWNER_CONTINUITY' as const;
    return (
      (Object.entries(PLAYBOOKS) as Array<[HenryCommercialNeed, NeedPlaybook]>).find(
        ([, playbook]) => playbook.signals.some((signal) => signal.test(content)),
      )?.[0] ?? null
    );
  }

  private needFromHint(hint?: string): HenryCommercialNeed | null {
    if (!hint) return null;
    return this.detectNeed(hint.replace(/-/g, ' '));
  }

  private profile(
    content: string,
    need: HenryCommercialNeed | null,
    prior: HenryCommercialFact[],
    explicitNeed: boolean,
    hintedNeed: HenryCommercialNeed | null,
  ) {
    const byField = new Map(prior.map((fact) => [fact.field, fact]));
    const candidates: Partial<Record<HenryCommercialField, string>> = {
      primaryObjective: explicitNeed ? this.safeValue(content) : undefined,
      familyOrBusinessContext: this.capture(content, [
        /(tengo|somos|vivo con|dependen de m[ií])\s+([^.,;]{2,80})/i,
        /(mi empresa|mis socios|mi familia|mis hijos|mi pareja)[^.,;]{0,80}/i,
      ]),
      horizon: this.capture(content, [
        /(en|dentro de|para)\s+(\d{1,2}\s+(?:año|años|mes|meses)|el pr[oó]ximo año|este año)/i,
      ]),
      priority: this.capture(content, [
        /(es|lo considero)\s+(urgente|prioritario|importante|poco prioritario)/i,
      ]),
      currentSituation: this.capture(content, [
        /(hoy (?:tengo|cuento con|ahorro|invierto)[^.,;]{2,100})/i,
        /(ya tengo [^.,;]{2,100})/i,
      ]),
      mainConcern: this.capture(content, [
        /(me preocupa[^.,;]{2,120})/i,
        /(mi mayor preocupaci[oó]n es[^.,;]{2,120})/i,
      ]),
      willingness: this.capture(content, [
        /(quiero (?:continuar|avanzar|revisarlo|agendar)[^.,;]{0,60})/i,
        /(no quiero (?:continuar|seguir|que me contacten)[^.,;]{0,60})/i,
      ]),
    };
    return FIELD_ORDER.map((field): HenryCommercialFact => {
      const candidate = candidates[field];
      if (candidate)
        return { field, status: 'CONFIRMED', value: candidate, source: 'USER_EXPLICIT' };
      const previous = byField.get(field);
      if (previous?.status === 'CONFIRMED') return previous;
      if (field === 'primaryObjective' && hintedNeed)
        return { field, status: 'INFERRED', value: hintedNeed, source: 'PAGE_HINT' };
      if (field === 'primaryObjective' && need && previous?.status === 'INFERRED') return previous;
      return { field, status: 'UNKNOWN', source: 'NONE' };
    });
  }

  private escalation(
    content: string,
    intent: HenryCommercialIntent,
    need: HenryCommercialNeed | null,
    facts: HenryCommercialFact[],
  ): HenryCommercialBehavior['escalation'] {
    if (intent === 'HUMAN_REQUEST')
      return {
        reason: 'USER_REQUEST',
        summary: this.handoff(intent, need, facts, 'La persona solicitó atención humana.'),
      };
    if (intent === 'COMPLAINT')
      return {
        reason: 'SENSITIVE_CONTEXT',
        summary: this.handoff(
          intent,
          need,
          facts,
          'La prioridad es atender una queja o inconformidad.',
        ),
      };
    if (CONFLICT_PATTERN.test(content))
      return {
        reason: 'LOW_CONFIDENCE',
        summary: this.handoff(
          intent,
          need,
          facts,
          'La persona reporta fuentes en conflicto; no resolver sin evidencia autorizada.',
        ),
      };
    if (INTERNAL_DATA_PATTERN.test(content))
      return {
        reason: 'UNSUPPORTED_INTENT',
        summary: this.handoff(
          intent,
          need,
          facts,
          'Solicitud de información interna no autorizada.',
        ),
      };
    if (SPECIFIC_QUOTE_PATTERN.test(content))
      return {
        reason: 'HIGH_VALUE_CASE',
        summary: this.handoff(
          intent,
          need,
          facts,
          'Solicitud de cotización específica que requiere atención humana y evidencia vigente.',
        ),
      };
    if (intent === 'PURCHASE_INTENT')
      return {
        reason: 'HIGH_VALUE_CASE',
        summary: this.handoff(intent, need, facts, 'La persona expresó intención comercial alta.'),
      };
    return null;
  }

  private stage(
    intent: HenryCommercialIntent,
    current: HenryConversationStage,
    facts: HenryCommercialFact[],
    objection: boolean,
    stopped: boolean,
  ): HenryConversationStage {
    if (stopped) return 'FOLLOW_UP';
    if (intent === 'HUMAN_REQUEST' || intent === 'COMPLAINT') return 'ESCALATION';
    if (objection) return 'OBJECTION';
    if (intent === 'APPOINTMENT_INTENT') return 'APPOINTMENT';
    if (intent === 'FOLLOW_UP') return 'FOLLOW_UP';
    if (intent === 'PURCHASE_INTENT') return 'QUALIFICATION';
    const confirmed = facts.filter((fact) => fact.status === 'CONFIRMED').length;
    if (intent === 'INFORMATION') return 'EDUCATION';
    if (confirmed >= 5) return 'QUALIFICATION';
    if (confirmed >= 2) return 'DIAGNOSIS';
    if (current === 'GREETING') return 'DISCOVERY';
    return ['ESCALATION', 'APPOINTMENT'].includes(current) ? current : 'DISCOVERY';
  }

  private nextBestAction(input: {
    intent: HenryCommercialIntent;
    stage: HenryConversationStage;
    facts: HenryCommercialFact[];
    objection: boolean;
    escalation: boolean;
    explicitStop: boolean;
    role: HenryRoleContext;
  }): HenryNextBestAction {
    if (input.explicitStop) return 'STOP_COMMERCIAL_CONVERSATION';
    if (input.escalation) return 'ESCALATE_TO_HUMAN';
    if (input.intent === 'APPOINTMENT_INTENT') return 'REQUEST_APPOINTMENT';
    if (input.objection) return 'ASK_ONE_QUESTION';
    if (input.intent === 'FOLLOW_UP') return 'FOLLOW_UP_WITH_CONSENT';
    if (input.intent === 'INFORMATION' || input.intent === 'COMPARISON')
      return 'PRESENT_AUTHORIZED_INFORMATION';
    if (input.role === 'CONSULTANT' && input.stage === 'QUALIFICATION')
      return 'PREPARE_APPOINTMENT';
    return input.facts.some((fact) => fact.status === 'UNKNOWN')
      ? 'ASK_ONE_QUESTION'
      : 'PREPARE_APPOINTMENT';
  }

  private nextQuestion(
    need: HenryCommercialNeed | null,
    facts: HenryCommercialFact[],
    asked: string[],
    objection: HenryCommercialBehavior['objection'],
  ) {
    if (objection && !asked.includes(objection.nextQuestion)) return objection.nextQuestion;
    const playbook = need ? PLAYBOOKS[need] : undefined;
    for (const field of FIELD_ORDER) {
      if (facts.find((fact) => fact.field === field)?.status === 'CONFIRMED') continue;
      const question = playbook?.questions[field] ?? GENERIC_QUESTIONS[field];
      if (!asked.includes(question)) return question;
    }
    return null;
  }

  private confidence(
    intent: HenryCommercialIntent,
    need: HenryCommercialNeed | null,
    facts: HenryCommercialFact[],
  ): HenryConfidence {
    const confirmed = facts.filter((fact) => fact.status === 'CONFIRMED').length;
    if (intent === 'UNKNOWN' && !need) return 'LOW';
    if (need && confirmed >= 3) return 'HIGH';
    if (need || intent !== 'UNKNOWN') return 'MEDIUM';
    return 'LOW';
  }

  private explanation(
    action: HenryNextBestAction,
    intent: HenryCommercialIntent,
    need: HenryCommercialNeed | null,
    facts: HenryCommercialFact[],
  ) {
    const missing = facts.filter((fact) => fact.status === 'UNKNOWN').map((fact) => fact.field);
    return `${action}: intención ${intent}, necesidad ${need ?? 'no confirmada'} y ${missing.length} dato(s) relevante(s) aún UNKNOWN.`;
  }

  private ruleId(intent: HenryCommercialIntent, action: HenryNextBestAction, objection?: string) {
    if (objection) return `COMMERCIAL-OBJECTION-${objection.toUpperCase()}-001`;
    return `COMMERCIAL-${intent}-${action}-001`;
  }

  private handoff(
    intent: HenryCommercialIntent,
    need: HenryCommercialNeed | null,
    facts: HenryCommercialFact[],
    reason: string,
  ) {
    const confirmed = facts
      .filter((fact) => fact.status === 'CONFIRMED')
      .map((fact) => `${fact.field}: ${fact.value}`)
      .slice(0, 5);
    return [
      reason,
      `Intención: ${intent}.`,
      `Necesidad: ${need ?? 'no confirmada'}.`,
      confirmed.length
        ? `Contexto confirmado: ${confirmed.join('; ')}.`
        : 'Sin contexto adicional confirmado.',
    ].join(' ');
  }

  private normalizeMemory(prior?: Partial<HenryCommercialMemory>): HenryCommercialMemory {
    return {
      need: prior?.need && HENRY_COMMERCIAL_NEEDS.includes(prior.need) ? prior.need : null,
      facts: Array.isArray(prior?.facts)
        ? prior.facts.filter((fact) => FIELD_ORDER.includes(fact.field))
        : [],
      objections: Array.isArray(prior?.objections)
        ? prior.objections.filter((item) => typeof item === 'string')
        : [],
      questionsAsked: Array.isArray(prior?.questionsAsked)
        ? prior.questionsAsked.filter((item) => typeof item === 'string')
        : [],
      agreedNextStep: prior?.agreedNextStep ?? null,
    };
  }

  private capture(content: string, patterns: readonly RegExp[]) {
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return this.safeValue(match[0]);
    }
    return undefined;
  }

  private safeValue(value: string) {
    return value.replace(/[<>]/g, '').trim().slice(0, 160);
  }
}
