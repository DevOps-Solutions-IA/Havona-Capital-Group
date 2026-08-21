import { Injectable } from '@nestjs/common';
import type { CustomerNeedKey } from '@havona/database';

export type PaligConsultativePlan = {
  detectedNeed: CustomerNeedKey | null;
  mode: 'DISCOVERY' | 'DIRECT_FACT' | 'RECOMMENDATION' | 'SAFETY_BLOCK';
  requiredTools: Array<'list_authorized_products' | 'search_knowledge' | 'request_human_escalation'>;
  nextQuestions: string[];
  restrictions: string[];
};

const UNSUPPORTED_FACT =
  /(inventa|prometele|seguro (que )?le pagan|garantiza(d[oa])?|como si (fuera|fueran) actual|no le menciones (exclusiones|carencias)|sin (exclusiones|carencias|limites)|no tiene limites|ilimitad[oa]|cifra mas alta|conocimiento general|cualquier muerte)/i;
const PALIG_KNOWLEDGE_TOPIC =
  /(vida flex|enfermedad|cancer|accident|itp|desmembr|plan|exequial|emermedica|medico|telemedicina|especialista|copago|bodytech|basico|individual|rdh|uci|repatriacion|familia|familiar|tarifa|tasa|ahorr|pension|educacion)/;

@Injectable()
export class HenryPaligConsultativeService {
  analyze(content: string): PaligConsultativePlan {
    const normalized = content.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const detectedNeed = this.need(normalized);
    const directFact = /\b(que|cu[aá]nto|cu[aá]l|cubre|incluye|significa|periodo|carencia|tarifa|vale|paga|copago|activa)\b/i.test(content);
    const recommendation = /\b(conviene|recomienda|qu[eé] plan|qu[eé] producto|opci[oó]n)\b/i.test(content);
    const blocked = UNSUPPORTED_FACT.test(normalized);
    const mode = blocked
      ? 'SAFETY_BLOCK'
      : recommendation
        ? 'RECOMMENDATION'
        : directFact
          ? 'DIRECT_FACT'
          : 'DISCOVERY';
    return {
      detectedNeed,
      mode,
      requiredTools: blocked
        ? ['search_knowledge', 'request_human_escalation']
        : recommendation
          ? ['list_authorized_products', 'search_knowledge']
          : directFact
            ? ['search_knowledge']
            : detectedNeed || PALIG_KNOWLEDGE_TOPIC.test(normalized)
              ? ['list_authorized_products', 'search_knowledge']
              : [],
      nextQuestions: mode === 'DISCOVERY' && detectedNeed === 'ACCIDENT_PROTECTION'
        ? this.accidentQuestions(normalized)
        : [],
      restrictions: [
        'PALIG_ONLY',
        'NEED_FIRST',
        'NO_UNDERWRITING_GUARANTEE',
        'NO_CLAIM_GUARANTEE',
        'NO_CURRENT_FACT_WITHOUT_CURRENT_EVIDENCE',
        'TRAINING_IS_NOT_CONTRACT',
      ],
    };
  }

  prompt(plan: PaligConsultativePlan) {
    return [
      '<palig-consultative-governance>',
      `need=${plan.detectedNeed ?? 'UNRESOLVED'}`,
      `mode=${plan.mode}`,
      `requiredTools=${plan.requiredTools.join(',')}`,
      `nextQuestions=${JSON.stringify(plan.nextQuestions)}`,
      `restrictions=${plan.restrictions.join(',')}`,
      'Sigue: necesidad → contexto → riesgo → impacto económico → protección actual → brecha → capacidad/preferencias → solución PALIG autorizada → evidencia → limitaciones → siguiente paso.',
      'No enumeres catálogo por defecto. Una capacitación, pieza comercial, histórico o fuente UNKNOWN nunca prueba una condición contractual vigente.',
      '</palig-consultative-governance>',
    ].join('\n');
  }

  private need(value: string): CustomerNeedKey | null {
    if (/accident|moto|hospital|uci|rdh|desmembr|viaj/.test(value)) return 'ACCIDENT_PROTECTION';
    if (/cancer/.test(value)) return 'CANCER_PROTECTION';
    if (/enfermedad grave|critica/.test(value)) return 'CRITICAL_ILLNESS';
    if (/educacion|universidad|estudio/.test(value)) return 'EDUCATION';
    if (/pension|retiro/.test(value)) return 'RETIREMENT_PENSION_GAP';
    if (/socio/.test(value)) return 'BUSINESS_PARTNER_PROTECTION';
    if (/persona clave/.test(value)) return 'KEY_PERSON';
    if (/continuidad empresarial/.test(value)) return 'BUSINESS_CONTINUITY';
    if (/familia|hijos|esposa|dependiente/.test(value)) return 'FAMILY_PROTECTION';
    if (/ingreso/.test(value)) return 'INCOME_PROTECTION';
    if (/capital|ahorro/.test(value)) return 'CAPITAL_ACCUMULATION';
    return null;
  }

  private accidentQuestions(value: string) {
    if (/cuanto (vale|cuesta)|precio|tarifa/.test(value)) {
      return ['¿Para quién sería la protección y qué variables solicita el tarifario autorizado?'];
    }
    if (/esposa|hijos|familia|dependiente/.test(value)) {
      return ['¿Qué impacto económico tendría en sus dependientes una incapacidad o fallecimiento accidental?'];
    }
    if (/viaj/.test(value)) {
      return ['¿Con qué frecuencia viaja y qué protección vigente tiene durante esos desplazamientos?'];
    }
    return ['¿Qué impacto económico tendría para usted una hospitalización o incapacidad por accidente?'];
  }
}
