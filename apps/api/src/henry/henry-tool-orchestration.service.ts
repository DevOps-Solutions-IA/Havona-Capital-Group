import { Injectable } from '@nestjs/common';
import type { AIToolDefinition } from '../ai/ai-provider';
import type { ResolvedHenryContext } from './henry-context.service';
import type { HenryCommercialIntent } from './henry-commercial-behavior.service';
import type { HenryConversationStage, HenryPolicyDecision } from './policies/henry-policy.types';

export type HenryCapability =
  | 'SALES_KNOWLEDGE'
  | 'CALENDAR'
  | 'MEET'
  | 'CRM'
  | 'TRAINING'
  | 'MESSAGING'
  | 'ANALYTICS'
  | 'AUTOMATION'
  | 'GENERAL';

export type HenryToolKind = 'READ' | 'MUTATION';

const CAPABILITY_TOOLS: Record<HenryCapability, readonly string[]> = {
  SALES_KNOWLEDGE: [
    'search_knowledge',
    'get_knowledge_document',
    'list_authorized_products',
    'get_memory',
  ],
  CALENDAR: [
    'get_calendar_availability',
    'list_calendar_events',
    'get_calendar_event',
    'create_calendar_event',
    'reschedule_calendar_event',
    'cancel_calendar_event',
  ],
  MEET: [
    'get_meeting',
    'get_meeting_join_info',
    'create_meeting_for_calendar_event',
    'cancel_meeting',
  ],
  CRM: [
    'get_prospect_context',
    'create_or_update_prospect',
    'register_interaction',
    'create_crm_activity',
    'create_task',
    'qualify_prospect',
    'get_available_consultants',
    'request_appointment_intent',
  ],
  TRAINING: [
    'get_training_progress',
    'get_training_plan',
    'get_training_performance',
    'get_team_training_summary',
    'start_roleplay',
    'continue_roleplay',
    'evaluate_roleplay',
    'search_knowledge',
  ],
  MESSAGING: [
    'get_communication_thread',
    'get_recent_messages',
    'send_communication_message',
    'request_human_takeover',
    'list_email_templates',
    'recommend_email_templates',
    'get_email_template',
    'create_email_draft',
    'personalize_email_draft',
    'preview_email_draft',
    'request_email_confirmation',
    'send_email_draft',
    'schedule_email_draft',
    'get_email_send_status',
  ],
  ANALYTICS: [
    'get_commercial_summary',
    'get_analytics_metric',
    'get_commercial_funnel',
    'get_pipeline_health',
    'get_priority_actions',
    'get_team_scorecard',
    'get_goal_progress',
    'get_analytics_data_quality',
    'get_analytics_anomalies',
    'get_communications_performance',
    'get_automations_performance',
  ],
  AUTOMATION: [
    'get_automation_workflow',
    'list_active_automation_workflows',
    'get_automation_execution',
    'pause_automation_for_entity',
    'list_eligible_cadences',
    'start_cadence',
    'get_cadence_status',
    'pause_cadence',
    'resume_cadence',
    'stop_cadence',
    'explain_cadence',
  ],
  GENERAL: ['request_human_escalation'],
};

const MUTATING_TOOLS = new Set([
  'create_or_update_prospect',
  'register_interaction',
  'create_crm_activity',
  'create_task',
  'qualify_prospect',
  'request_human_escalation',
  'request_appointment_intent',
  'create_calendar_event',
  'reschedule_calendar_event',
  'cancel_calendar_event',
  'create_meeting_for_calendar_event',
  'cancel_meeting',
  'send_communication_message',
  'request_human_takeover',
  'pause_automation_for_entity',
  'start_roleplay',
  'continue_roleplay',
  'evaluate_roleplay',
  'save_memory',
  'forget_memory',
  'create_email_draft',
  'personalize_email_draft',
  'update_email_draft',
  'attach_to_email_draft',
  'request_email_confirmation',
  'send_email_draft',
  'schedule_email_draft',
  'cancel_scheduled_email',
  'reply_to_email_thread',
  'prepare_email_batch',
  'start_cadence',
  'pause_cadence',
  'resume_cadence',
  'stop_cadence',
]);

const PROSPECT_REQUIRED = new Set([
  'get_prospect_context',
  'register_interaction',
  'create_crm_activity',
  'create_task',
  'qualify_prospect',
  'get_available_consultants',
  'request_appointment_intent',
]);

@Injectable()
export class HenryToolAuthorizationService {
  evaluate(input: {
    toolName: string;
    runtimeContext: ResolvedHenryContext;
    prospectAssociated: boolean;
    availableDefinitions: ReadonlySet<string>;
  }): HenryPolicyDecision {
    if (!input.availableDefinitions.has(input.toolName))
      return { action: 'REJECT', policyId: 'tools', ruleId: 'TOOL-NOT-DEFINED-001' };
    if (!input.runtimeContext.toolPermissions.includes(input.toolName))
      return { action: 'REJECT', policyId: 'tools', ruleId: 'TOOL-ROLE-DENIED-001' };
    if (PROSPECT_REQUIRED.has(input.toolName) && !input.prospectAssociated)
      return { action: 'REJECT', policyId: 'tools', ruleId: 'TOOL-PROSPECT-REQUIRED-001' };
    return { action: 'ALLOW', policyId: 'tools', ruleId: 'TOOL-CONTEXT-ALLOW-001' };
  }

  kind(toolName: string): HenryToolKind {
    return MUTATING_TOOLS.has(toolName) ? 'MUTATION' : 'READ';
  }
}

export type HenryToolSelection = {
  capability: HenryCapability;
  candidateTools: string[];
  selectedTools: AIToolDefinition[];
  reason: string;
};

@Injectable()
export class HenryCapabilityRouter {
  select(input: {
    content: string;
    stage: HenryConversationStage;
    commercialIntent: HenryCommercialIntent;
    runtimeContext: ResolvedHenryContext;
    definitions: AIToolDefinition[];
    authorization: HenryToolAuthorizationService;
    prospectAssociated: boolean;
  }): HenryToolSelection {
    const normalized = input.content.toLocaleLowerCase('es');
    const page = `${input.runtimeContext.page.pageType} ${input.runtimeContext.page.section ?? ''}`;
    const signals = new Set<HenryCapability>();
    if (
      ['INFORMATION', 'EXPLORATION', 'PRODUCT_INTEREST', 'COMPARISON', 'OBJECTION'].includes(
        input.commercialIntent,
      ) ||
      /producto|cobertura|prima|tasa|precio|caro|objeci[oó]n|venta|negoci|vida flex|pensi[oó]n|seguro/.test(
        normalized,
      )
    )
      signals.add('SALES_KNOWLEDGE');
    if (input.stage === 'APPOINTMENT' || /calendar|agenda|cita/.test(`${normalized} ${page}`))
      signals.add('CALENDAR');
    if (/reuni[oó]n|videollamada|meet/.test(`${normalized} ${page}`)) signals.add('MEET');
    if (/crm|prospecto|oportunidad|tarea|pipeline/.test(`${normalized} ${page}`))
      signals.add('CRM');
    if (/formaci[oó]n|academia|entrenamiento|roleplay/.test(`${normalized} ${page}`))
      signals.add('TRAINING');
    if (/mensaje|correo|email|comunicaci[oó]n|whatsapp/.test(`${normalized} ${page}`))
      signals.add('MESSAGING');
    if (/anal[ií]tica|m[eé]trica|scorecard|rendimiento/.test(`${normalized} ${page}`))
      signals.add('ANALYTICS');
    if (/automatiz|cadencia|workflow/.test(`${normalized} ${page}`)) signals.add('AUTOMATION');
    if (!signals.size) signals.add('GENERAL');

    const ordered = [...signals];
    const candidateTools = [
      ...new Set(ordered.flatMap((capability) => CAPABILITY_TOOLS[capability])),
    ];
    const definitions = new Map(
      input.definitions.map((definition) => [definition.name, definition]),
    );
    const availableDefinitions = new Set(definitions.keys());
    const selectedTools = candidateTools
      .filter(
        (toolName) =>
          input.authorization.evaluate({
            toolName,
            runtimeContext: input.runtimeContext,
            prospectAssociated: input.prospectAssociated,
            availableDefinitions,
          }).action === 'ALLOW',
      )
      .map((toolName) => definitions.get(toolName))
      .filter((definition): definition is AIToolDefinition => Boolean(definition));
    return {
      capability: ordered[0]!,
      candidateTools,
      selectedTools,
      reason: `commercial=${input.commercialIntent};stage=${input.stage};page=${input.runtimeContext.page.pageType};signals=${ordered.join('+')}`,
    };
  }
}

export class HenryToolBudget {
  private reads = 0;
  private mutations = 0;
  constructor(
    readonly maxTotal: number,
    readonly maxMutations = 1,
  ) {}
  canConsume(kind: HenryToolKind) {
    return this.used < this.maxTotal && (kind === 'READ' || this.mutations < this.maxMutations);
  }
  consume(kind: HenryToolKind) {
    if (!this.canConsume(kind)) return false;
    kind === 'READ' ? (this.reads += 1) : (this.mutations += 1);
    return true;
  }
  get used() {
    return this.reads + this.mutations;
  }
  snapshot() {
    return { hardLimit: this.maxTotal, readUsed: this.reads, mutationUsed: this.mutations };
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}

export class HenryToolCallCache {
  private readonly values = new Map<string, Record<string, unknown>>();
  fingerprint(toolName: string, args: unknown) {
    return `${toolName}:${JSON.stringify(canonicalize(args))}`;
  }
  get(fingerprint: string) {
    return this.values.get(fingerprint);
  }
  set(fingerprint: string, output: Record<string, unknown>) {
    this.values.set(fingerprint, output);
  }
}
