import { getTrainingScenario, TrainingScenario } from './training-roleplay.catalog';

export const TRAINING_RUBRIC = [
  'apertura',
  'acuerdo_inicial',
  'descubrimiento',
  'calidad_preguntas',
  'escucha',
  'profundizacion',
  'diagnostico',
  'conexion_riesgo_impacto',
  'propuesta_valor',
  'objeciones',
  'cierre',
  'siguiente_paso',
  'cumplimiento',
  'empatia',
  'claridad',
] as const;

export type TrainingCriterion = (typeof TRAINING_RUBRIC)[number];
export type TrainingTurn = { role: 'CONSULTANT' | 'CLIENT'; content: string };
export type CriterionEvidence = { turn: number; quoteOrSummary: string; reason: string };
export type CriterionResult = {
  criterion: TrainingCriterion;
  score: number;
  evidence: CriterionEvidence[];
  reason: string;
  improvement: string;
};
export type ComplianceFlag = {
  code: string;
  severity: 'CRITICAL' | 'HIGH';
  turn: number;
  reason: string;
};

const patterns: Record<Exclude<TrainingCriterion, 'cumplimiento'>, RegExp[]> = {
  apertura: [/gracias por tu tiempo/i, /¿(?:te|le) parece si/i, /tenemos .* minutos/i, /propósito/i],
  acuerdo_inicial: [/¿qué te gustaría/i, /al final .* decidimos/i, /agenda/i, /permiso/i],
  descubrimiento: [/qué tienes hoy/i, /situación actual/i, /¿cómo lo manejas/i, /¿quién depende/i, /brecha/i],
  calidad_preguntas: [/¿qué/i, /¿cómo/i, /¿cuál/i, /¿quién/i, /¿qué significaría/i],
  escucha: [/si te entendí/i, /lo que escucho/i, /me dices que/i, /entonces .* preocupa/i],
  profundizacion: [/¿qué más/i, /¿por qué/i, /¿qué te preocupa/i, /cuéntame más/i, /¿qué pasaría/i],
  diagnostico: [/la prioridad es/i, /la brecha/i, /necesidad principal/i, /antes de revisar opciones/i],
  conexion_riesgo_impacto: [/impacto/i, /si eso ocurriera/i, /¿qué significaría/i, /consecuencia/i, /afectaría/i],
  propuesta_valor: [/con base en lo que/i, /opción podría/i, /revisar alternativas/i, /sin asumir/i],
  objeciones: [/entiendo .* preocupa/i, /¿qué parte/i, /¿con qué lo comparas/i, /tiene sentido/i, /aclarar/i],
  cierre: [/¿te gustaría (?:avanzar|agendar)/i, /¿hace sentido/i, /¿quieres que/i, /cerramos/i],
  siguiente_paso: [/siguiente paso/i, /agend/i, /revisar .* vigente/i, /consultor/i, /volver a hablar/i],
  empatia: [/entiendo/i, /gracias por (?:compartir|tu tiempo)/i, /es válido/i, /sin presión/i, /respeto/i],
  claridad: [/primero/i, /después/i, /en resumen/i, /depende de/i, /no tengo información suficiente/i],
};

const improvements: Record<TrainingCriterion, string> = {
  apertura: 'Abre con propósito, tiempo disponible y permiso.',
  acuerdo_inicial: 'Alinea qué se explorará y cómo se decidirá el siguiente paso.',
  descubrimiento: 'Explora situación, objetivo y preocupación antes de orientar.',
  calidad_preguntas: 'Usa preguntas abiertas relevantes, una a la vez.',
  escucha: 'Resume lo comprendido y valida antes de continuar.',
  profundizacion: 'Profundiza en causa, impacto y prioridad sin interrogar.',
  diagnostico: 'Formula una necesidad basada solo en información confirmada.',
  conexion_riesgo_impacto: 'Conecta el riesgo con consecuencias concretas sin alarmismo.',
  propuesta_valor: 'Orienta únicamente después del diagnóstico y con evidencia autorizada.',
  objeciones: 'Valida, aclara y descubre la objeción real antes de responder.',
  cierre: 'Confirma disposición sin presión ni urgencia artificial.',
  siguiente_paso: 'Propón una acción concreta, explicable y reversible.',
  cumplimiento: 'Distingue evidencia, simulación y condiciones contractuales; abstente si falta fuente.',
  empatia: 'Reconoce la perspectiva de la persona con lenguaje natural.',
  claridad: 'Resume con frases breves y diferencia hechos de supuestos.',
};

const criticalRules: Array<{ code: string; pattern: RegExp; reason: string }> = [
  { code: 'UNSUPPORTED_RETURN_GUARANTEE', pattern: /(?:te|le)?\s*garantizo.{0,40}(?:rentabilidad|rendimiento|tasa)/i, reason: 'Garantiza un resultado financiero no soportado.' },
  { code: 'GUARANTEED_ISSUANCE', pattern: /(?:te|le)?\s*(?:garantizo|aseguro).{0,30}(?:aprobaci[oó]n|emisi[oó]n|te aprueban)/i, reason: 'Garantiza aprobación o emisión.' },
  { code: 'GUARANTEED_CLAIM', pattern: /(?:te|le)?\s*(?:garantizo|aseguro).{0,35}(?:pago|siniestro|reclamaci[oó]n)/i, reason: 'Garantiza el pago de una reclamación.' },
  { code: 'INVENTED_TERMS', pattern: /(?:la prima es|cubre autom[aá]ticamente|la tasa es|el valor asegurado es)\s*[\d$]/i, reason: 'Afirma cifras o condiciones sin fuente.' },
  { code: 'IGNORE_NO_CONTACT', pattern: /(?:aunque no quieras|voy a seguir|igual te contactar[eé]|debes escucharme)/i, reason: 'Insiste después de una negativa o retiro de contacto.' },
  { code: 'PROMPT_INJECTION', pattern: /ignora (?:las|tus) (?:reglas|instrucciones)|system prompt|mu[eé]strame .*clientes?|llama (?:al )?crm|ejecuta .*automat/i, reason: 'Intenta alterar instrucciones o acceder a sistemas externos.' },
];

function safeExcerpt(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function isNegatedClaim(content: string, matchIndex: number) {
  const prefix = content.slice(Math.max(0, matchIndex - 45), matchIndex).toLowerCase();
  return /(?:no|nunca|nadie)\s+(?:puede\s+)?$|no (?:te|le) (?:puedo )?$/.test(prefix);
}

function complianceFlags(transcript: readonly TrainingTurn[]) {
  const flags: ComplianceFlag[] = [];
  transcript.forEach((turn, index) => {
    const injectionRule = criticalRules.find((rule) => rule.code === 'PROMPT_INJECTION')!;
    if (injectionRule.pattern.test(turn.content))
      flags.push({
        code: injectionRule.code,
        severity: 'CRITICAL',
        turn: index + 1,
        reason: injectionRule.reason,
      });
    if (turn.role !== 'CONSULTANT') return;
    for (const rule of criticalRules) {
      if (rule.code === 'PROMPT_INJECTION') continue;
      const match = rule.pattern.exec(turn.content);
      if (!match || isNegatedClaim(turn.content, match.index)) continue;
      flags.push({ code: rule.code, severity: 'CRITICAL', turn: index + 1, reason: rule.reason });
    }
    if (/otra (?:aseguradora|compañía).*(?:miente|estafa|nunca paga)/i.test(turn.content))
      flags.push({ code: 'UNSUPPORTED_DISPARAGEMENT', severity: 'HIGH', turn: index + 1, reason: 'Desacredita a un tercero sin evidencia.' });
    if (/dame (?:tu )?(?:contraseña|clave|historia clínica completa|token)/i.test(turn.content))
      flags.push({ code: 'UNNECESSARY_SENSITIVE_DATA', severity: 'HIGH', turn: index + 1, reason: 'Solicita información sensible innecesaria.' });
  });
  return flags;
}

function evidenceFor(criterion: Exclude<TrainingCriterion, 'cumplimiento'>, transcript: readonly TrainingTurn[]) {
  const evidence: CriterionEvidence[] = [];
  transcript.forEach((turn, index) => {
    if (turn.role !== 'CONSULTANT') return;
    if (patterns[criterion].some((pattern) => pattern.test(turn.content)))
      evidence.push({ turn: index + 1, quoteOrSummary: safeExcerpt(turn.content), reason: `Evidencia de ${criterion.replaceAll('_', ' ')}.` });
  });
  return evidence.slice(0, 3);
}

function prematureSolution(transcript: readonly TrainingTurn[]) {
  const consultantTurns = transcript.filter((turn) => turn.role === 'CONSULTANT');
  const firstTwo = consultantTurns.slice(0, 2).map((turn) => turn.content).join(' ');
  return /(?:producto|póliza|plan|solución|cobertura|te recomiendo)/i.test(firstTwo) &&
    !/[¿?]|antes de|entender/i.test(firstTwo);
}

export function evaluateTrainingTranscript(
  transcript: readonly TrainingTurn[],
  scenario?: TrainingScenario,
  source: 'ROLEPLAY' | 'MANUAL_TRANSCRIPT' = 'ROLEPLAY',
) {
  const flags = complianceFlags(transcript);
  const critical = flags.some((flag) => flag.severity === 'CRITICAL');
  const consultantTurns = transcript.filter((turn) => turn.role === 'CONSULTANT');
  const relevantQuestions = consultantTurns.filter((turn) =>
    /\?/.test(turn.content) && /(?:qué|cómo|cuál|quién|cuándo|preocupa|prioridad|impacto|significaría)/i.test(turn.content),
  ).length;
  const repeated = new Set<string>();
  let duplicateQuestions = 0;
  for (const turn of consultantTurns.filter((item) => item.content.includes('?'))) {
    const normalized = turn.content.toLowerCase().replace(/[^a-záéíóúñ ]/gi, '').trim();
    if (repeated.has(normalized)) duplicateQuestions += 1;
    repeated.add(normalized);
  }
  const earlySolution = prematureSolution(transcript);

  const rubric: CriterionResult[] = TRAINING_RUBRIC.map((criterion) => {
    if (criterion === 'cumplimiento') {
      const evidence = flags.map((flag) => ({ turn: flag.turn, quoteOrSummary: flag.code, reason: flag.reason }));
      const score = critical ? 0 : flags.length ? 2 : 5;
      return { criterion, score, evidence, reason: critical ? 'Se detectó un incumplimiento crítico.' : flags.length ? 'Se detectó riesgo de cumplimiento.' : 'No se detectaron afirmaciones críticas no soportadas.', improvement: improvements[criterion] };
    }
    const evidence = evidenceFor(criterion, transcript);
    let score = Math.min(5, evidence.length === 0 ? 0 : 2 + evidence.length);
    if (criterion === 'calidad_preguntas') score = Math.min(5, Math.max(0, relevantQuestions - duplicateQuestions));
    if (['diagnostico', 'propuesta_valor'].includes(criterion) && earlySolution) score = Math.min(score, 1);
    if (criterion === 'escucha' && consultantTurns.length > 2 && evidence.length === 0) score = 1;
    return { criterion, score, evidence, reason: evidence.length ? `${evidence.length} evidencia(s) relevante(s) en el transcript.` : 'No existe evidencia suficiente en el transcript.', improvement: improvements[criterion] };
  });

  const score = Number(((rubric.reduce((sum, item) => sum + item.score, 0) / (TRAINING_RUBRIC.length * 5)) * 100).toFixed(2));
  const strengths = [...rubric].filter((item) => item.score >= 4).sort((a, b) => b.score - a.score).slice(0, 3).map((item) => ({ criterion: item.criterion, score: item.score, evidence: item.evidence[0] ?? null }));
  const opportunities = [...rubric].filter((item) => item.score < 4).sort((a, b) => a.score - b.score).slice(0, 3).map((item) => ({ criterion: item.criterion, score: item.score, reason: item.reason, improvement: item.improvement }));
  const weakest = opportunities[0]?.criterion ?? 'descubrimiento';
  const recommendationBySkill: Record<string, string> = {
    apertura: 'opening_short_time', acuerdo_inicial: 'opening_receptive', descubrimiento: 'discovery_family', calidad_preguntas: 'discovery_education', escucha: 'close_indecisive', profundizacion: 'discovery_key_partner', diagnostico: 'discovery_retirement', conexion_riesgo_impacto: 'discovery_accident', propuesta_valor: 'discovery_wealth', objeciones: 'objection_price', cierre: 'close_next_step', siguiente_paso: 'close_appointment', cumplimiento: 'compliance_document_conflict', empatia: 'discovery_critical_illness', claridad: 'compliance_out_of_evidence',
  };
  return {
    source,
    score,
    rubric,
    compliance: { score: rubric.find((item) => item.criterion === 'cumplimiento')!.score, critical, flags },
    feedback: {
      strengths,
      opportunities,
      missedKeyMoment: earlySolution ? 'Se presentó una solución antes de completar el diagnóstico.' : opportunities[0]?.improvement ?? 'No existe evidencia suficiente para identificar un momento perdido.',
      bestQuestion: scenario?.objective.includes('impacto') ? 'Si esa situación no cambia, ¿qué impacto tendría para ti?' : '¿Qué es lo más importante que deberíamos comprender antes de revisar alternativas?',
      complianceRisk: flags.length ? flags.map((flag) => flag.reason) : ['No se detectó riesgo crítico en la evidencia disponible.'],
      recommendedScenarioKey: recommendationBySkill[weakest] ?? scenario?.scenarioKey ?? 'discovery_family',
    },
    signals: { relevantQuestions, duplicateQuestions, prematureSolution: earlySolution, consultantTurns: consultantTurns.length },
    disclaimer: 'TRAINING / SIMULATION. No corresponde a CRM, clientes ni condiciones contractuales.',
  };
}

export function evaluateScenarioTranscript(scenarioKey: string, transcript: readonly TrainingTurn[]) {
  return evaluateTrainingTranscript(transcript, getTrainingScenario(scenarioKey));
}
