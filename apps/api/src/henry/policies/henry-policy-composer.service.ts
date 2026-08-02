import { Injectable } from '@nestjs/common';
import {
  HenryClosingPolicy, HenryCustomerServicePolicy, HenryEscalationPolicy, HenryGuardrailPolicy,
  HenryIdentityPolicy, HenryKnowledgePolicy, HenrySalesPolicy, HenryTonePolicy, HenryToolPolicy,
  HenryDecisionSupportPolicy, HenryExpertCopilotPolicy, HenryQualityPolicy, HenryTeachingPolicy,
} from './henry-policies';
import { HENRY_MANUAL_VERSION, HenryPolicy, HenryPolicyContext } from './henry-policy.types';

@Injectable()
export class HenryPolicyComposer {
  private readonly policies: HenryPolicy[];

  constructor(identity: HenryIdentityPolicy, tone: HenryTonePolicy, sales: HenrySalesPolicy,
    closing: HenryClosingPolicy, customerService: HenryCustomerServicePolicy,
    escalation: HenryEscalationPolicy, knowledge: HenryKnowledgePolicy,
    expert: HenryExpertCopilotPolicy, decisionSupport: HenryDecisionSupportPolicy,
    teaching: HenryTeachingPolicy, quality: HenryQualityPolicy,
    guardrails: HenryGuardrailPolicy, tools: HenryToolPolicy) {
    this.policies = [identity, tone, sales, closing, customerService, escalation, knowledge, expert, decisionSupport, teaching, quality, guardrails, tools];
  }

  compose(context: HenryPolicyContext) {
    const sections = this.policies.map((policy) => policy.section(context)).sort((a, b) => a.priority - b.priority);
    const roleInstructions = context.roleContext === 'CONSULTANT'
      ? ['Actúa como copiloto comercial del consultor, no como vendedor frente a un prospecto.', 'Distingue CONOCIDO, FALTANTE, INFERIDO y NO AUTORIZADO.', 'Antes de crear tareas u otras acciones persistentes, pide confirmación explícita.']
      : context.roleContext && context.roleContext !== 'PUBLIC'
        ? ['Actúa como copiloto operativo según el ámbito autorizado del usuario.', 'No afirmes acceso a datos que el contexto del servidor no haya suministrado.']
        : ['Actúa como asistente público consultivo; confirma la necesidad antes de asumir la intención sugerida por la página.'];
    return {
      manualVersion: HENRY_MANUAL_VERSION,
      appliedPolicies: sections.map(({ id, version }) => ({ id, version })),
      prompt: [
        `<henry-policy-manual version="${HENRY_MANUAL_VERSION}">`,
        ...sections.map((section) => `<policy id="${section.id}" version="${section.version}">\n${section.instructions.map((item) => `- ${item}`).join('\n')}\n</policy>`),
        `<role-context role="${context.roleContext ?? 'PUBLIC'}">\n${roleInstructions.map((item) => `- ${item}`).join('\n')}\n- Si la base autorizada no contiene una respuesta, indica exactamente: "Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP."\n- Usa 2 a 4 párrafos breves en conversación simple; estructura procesos, comparaciones o checklists cuando mejore la lectura.\n</role-context>`,
        '</henry-policy-manual>',
      ].join('\n\n'),
    };
  }
}
