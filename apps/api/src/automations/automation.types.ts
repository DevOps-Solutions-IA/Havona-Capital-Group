import { z } from 'zod';

export const AUTOMATION_TRIGGER_TYPES = [
  'PROSPECT_CREATED',
  'PROSPECT_ASSIGNED',
  'PROSPECT_STAGE_CHANGED',
  'TASK_OVERDUE',
  'PROSPECT_INACTIVE',
  'OPPORTUNITY_CREATED',
  'OPPORTUNITY_STAGE_CHANGED',
  'OPPORTUNITY_FINANCIALS_UPDATED',
  'OPPORTUNITY_COMMERCIAL_CONTEXT_UPDATED',
  'CALENDAR_EVENT_SCHEDULED',
  'CALENDAR_EVENT_RESCHEDULED',
  'CALENDAR_EVENT_CANCELLED',
  'CALENDAR_BEFORE_APPOINTMENT',
  'CALENDAR_AFTER_APPOINTMENT',
  'MEETING_ENDED',
  'MEETING_ATTENDANCE_RECORDED',
  'COMMUNICATION_INBOUND',
  'COMMUNICATION_NO_REPLY',
  'COMMUNICATION_HUMAN_ESCALATION',
  'COMMUNICATION_DELIVERY_FAILED',
  'COMMUNICATION_THREAD_CLOSED',
  'COMMUNICATION_OPT_OUT',
  'SCHEDULED_TIME',
  'RECURRING_SCHEDULE',
] as const;

export const AUTOMATION_ACTION_TYPES = [
  'CREATE_CRM_TASK',
  'UPDATE_CRM_STAGE',
  'ASSIGN_CONSULTANT',
  'SEND_WHATSAPP_TEXT',
  'SEND_WHATSAPP_TEMPLATE',
  'SEND_EMAIL',
  'SCHEDULE_FOLLOW_UP',
  'CREATE_CALENDAR_REMINDER',
  'REQUEST_HUMAN_ESCALATION',
  'NOTIFY_INTERNAL_USER',
  'PAUSE_WORKFLOW',
  'END_WORKFLOW',
  'HENRY_REASONING',
  'DELAY',
] as const;

export const automationConditionSchema = z
  .object({
    field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,119}$/),
    operator: z.enum(['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'EXISTS', 'GT', 'GTE', 'LT', 'LTE']),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  })
  .strict();

export const automationActionSchema = z
  .object({
    type: z.enum(AUTOMATION_ACTION_TYPES),
    definition: z.record(z.string(), z.unknown()),
    condition: automationConditionSchema.optional(),
    approvalMode: z.enum(['AUTO', 'REQUIRES_CONFIRMATION', 'HUMAN_ONLY']).default('AUTO'),
    retryLimit: z.number().int().min(0).max(5).default(3),
    timeoutMs: z.number().int().min(1000).max(120000).default(30000),
  })
  .strict();

export const createWorkflowSchema = z
  .object({
    name: z.string().trim().min(3).max(160),
    description: z.string().trim().max(1000).optional(),
    scope: z.enum(['OWN', 'TEAM', 'GLOBAL']).default('OWN'),
    trigger: z
      .object({
        type: z.enum(AUTOMATION_TRIGGER_TYPES),
        definition: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
    actions: z.array(automationActionSchema).min(1).max(25),
    ownerUserId: z.string().uuid().optional(),
    maxSteps: z.number().int().min(1).max(50).default(25),
    maxDurationSecs: z.number().int().min(60).max(2_592_000).default(86400),
  })
  .strict();

export type AutomationActor = { id: string; roles?: string[]; permissions: string[] };
export type DomainEventInput = {
  eventId: string;
  type: (typeof AUTOMATION_TRIGGER_TYPES)[number];
  entityType: string;
  entityId: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
};

export class AutomationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
