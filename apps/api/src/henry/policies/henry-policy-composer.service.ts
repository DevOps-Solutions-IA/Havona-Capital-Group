import { Injectable } from '@nestjs/common';
import {
  HenryClosingPolicy, HenryCustomerServicePolicy, HenryEscalationPolicy, HenryGuardrailPolicy,
  HenryIdentityPolicy, HenryKnowledgePolicy, HenrySalesPolicy, HenryTonePolicy, HenryToolPolicy,
} from './henry-policies';
import { HENRY_MANUAL_VERSION, HenryPolicy, HenryPolicyContext } from './henry-policy.types';

@Injectable()
export class HenryPolicyComposer {
  private readonly policies: HenryPolicy[];

  constructor(identity: HenryIdentityPolicy, tone: HenryTonePolicy, sales: HenrySalesPolicy,
    closing: HenryClosingPolicy, customerService: HenryCustomerServicePolicy,
    escalation: HenryEscalationPolicy, knowledge: HenryKnowledgePolicy,
    guardrails: HenryGuardrailPolicy, tools: HenryToolPolicy) {
    this.policies = [identity, tone, sales, closing, customerService, escalation, knowledge, guardrails, tools];
  }

  compose(context: HenryPolicyContext) {
    const sections = this.policies.map((policy) => policy.section(context)).sort((a, b) => a.priority - b.priority);
    return {
      manualVersion: HENRY_MANUAL_VERSION,
      appliedPolicies: sections.map(({ id, version }) => ({ id, version })),
      prompt: [
        `<henry-policy-manual version="${HENRY_MANUAL_VERSION}">`,
        ...sections.map((section) => `<policy id="${section.id}" version="${section.version}">\n${section.instructions.map((item) => `- ${item}`).join('\n')}\n</policy>`),
        '</henry-policy-manual>',
      ].join('\n\n'),
    };
  }
}

