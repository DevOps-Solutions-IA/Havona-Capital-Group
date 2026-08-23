import { Injectable } from '@nestjs/common';
import { HENRY_OBJECTION_CATALOG } from './objection-catalog';
import { HenryConversationStage, HenryPolicyDecision } from './henry-policy.types';

@Injectable()
export class HenryPolicyEngine {
  evaluateInput(content: string): HenryPolicyDecision {
    const immediate: Array<{
      pattern: RegExp;
      ruleId: string;
      reason: HenryPolicyDecision['reason'];
      response: string;
    }> = [
      {
        pattern:
          /(quiero|necesito|prefiero|p[aá]same|comun[ií]came).{0,25}(humano|persona|asesor(?![ií]a)|asesora|consultor)/i,
        ruleId: 'ESC-HUMAN-001',
        reason: 'USER_REQUEST',
        response:
          'Claro. Detendré la conversación automatizada y solicitaré que una persona del equipo continúe con usted.',
      },
      {
        pattern: /(demanda|abogado|acci[oó]n legal|denuncia|queja formal)/i,
        ruleId: 'ESC-LEGAL-001',
        reason: 'SENSITIVE_CONTEXT',
        response:
          'Entiendo la seriedad de lo que indica. Este asunto requiere atención humana; registraré el escalamiento sin intentar interpretarlo.',
      },
      {
        pattern:
          /(diagn[oó]stico m[eé]dico|valoraci[oó]n m[eé]dica|siniestro complejo|interpretaci[oó]n contractual|asesor[ií]a tributaria definitiva)/i,
        ruleId: 'ESC-REGULATED-001',
        reason: 'SENSITIVE_CONTEXT',
        response:
          'Ese asunto requiere valoración especializada. Solicitaré atención humana y evitaré emitir una conclusión fuera de mi alcance.',
      },
      {
        pattern:
          /(estoy furios[oa]|estoy desesperad[oa]|me siento amenazad[oa]|esto es una estafa)/i,
        ruleId: 'ESC-EMOTIONAL-001',
        reason: 'SENSITIVE_CONTEXT',
        response:
          'Reconozco que esta situación es importante. Detendré cualquier conversación comercial y solicitaré atención humana.',
      },
    ];
    const escalation = immediate.find((rule) => rule.pattern.test(content));
    if (escalation)
      return {
        action: 'ESCALATE',
        policyId: 'escalation',
        ruleId: escalation.ruleId,
        reason: escalation.reason,
        response: escalation.response,
        stage: 'ESCALATION',
      };

    const objection = HENRY_OBJECTION_CATALOG.find((item) =>
      item.signals.some((signal) => signal.test(content)),
    );
    if (objection)
      return {
        action: 'ALLOW',
        policyId: 'closing',
        ruleId: `OBJ-${objection.id.toUpperCase()}`,
        stage: 'OBJECTION',
      };
    if (/(queja|reclamo|error|problema con|seguimiento de)/i.test(content))
      return {
        action: 'ALLOW',
        policyId: 'customer-service',
        ruleId: 'SERVICE-INTENT-001',
        stage: 'SUPPORT',
      };
    if (/(agendar|agenda|cita|reuni[oó]n)/i.test(content))
      return {
        action: 'ALLOW',
        policyId: 'closing',
        ruleId: 'CLOSE-APPOINTMENT-001',
        stage: 'APPOINTMENT',
      };
    return {
      action: 'ALLOW',
      policyId: 'sales',
      ruleId: 'DISCOVERY-CONTINUE-001',
      stage: 'DISCOVERY',
    };
  }

  evaluateOutput(content: string): HenryPolicyDecision {
    const prohibited =
      /(rentabilidad garantizada|garantizamos? (el|un|una) resultado|p[oó]liza (est[aá] |fue )?aprobada|aprobaci[oó]n garantizada|asesor[ií]a (legal|tributaria) definitiva|diagn[oó]stico m[eé]dico definitivo)/i;
    if (prohibited.test(content))
      return {
        action: 'REJECT',
        policyId: 'guardrails',
        ruleId: 'GRD-PROMISE-001',
        reason: 'POLICY',
        stage: 'ESCALATION',
        response:
          'No puedo confirmar esa información ni prometer resultados. Solicitaré apoyo de un consultor para brindarle orientación responsable.',
      };
    return { action: 'ALLOW', policyId: 'guardrails', ruleId: 'GRD-OUTPUT-ALLOW-001' };
  }

  stageAfterTool(name: string, current: HenryConversationStage): HenryConversationStage {
    if (name === 'request_human_escalation') return 'ESCALATION';
    if (
      [
        'request_appointment_intent',
        'create_calendar_event',
        'reschedule_calendar_event',
        'cancel_calendar_event',
      ].includes(name)
    )
      return 'APPOINTMENT';
    if (name === 'qualify_prospect') return 'QUALIFICATION';
    if (name === 'create_or_update_prospect') return 'DIAGNOSIS';
    return current;
  }
}
