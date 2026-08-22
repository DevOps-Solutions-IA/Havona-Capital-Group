import { AUTOMATION_TRIGGER_TYPES } from './automation.types';

export type TriggerCoverage = {
  trigger: (typeof AUTOMATION_TRIGGER_TYPES)[number];
  producer: string | null;
  consumer: 'AUTOMATIONS_CORE';
  deterministicEventId: boolean;
  tested: boolean;
  gap: string | null;
};

const coverage = (
  trigger: TriggerCoverage['trigger'],
  producer: string | null,
  gap: string | null = null,
): TriggerCoverage => ({
  trigger,
  producer,
  consumer: 'AUTOMATIONS_CORE',
  deterministicEventId: producer !== null,
  tested: true,
  gap,
});

export const AUTOMATION_TRIGGER_COVERAGE: readonly TriggerCoverage[] = [
  coverage('PROSPECT_CREATED', 'ProspectsService.capture'),
  coverage('PROSPECT_ASSIGNED', 'CrmService.assign'),
  coverage('PROSPECT_STAGE_CHANGED', 'CrmService.updateProspect'),
  coverage('TASK_OVERDUE', 'AutomationService.scanOperationalSignals'),
  coverage('PROSPECT_INACTIVE', 'AutomationService.scanOperationalSignals'),
  coverage('OPPORTUNITY_CREATED', 'CrmService.createOpportunity'),
  coverage('OPPORTUNITY_STAGE_CHANGED', 'CrmService.moveOpportunity'),
  coverage('OPPORTUNITY_FINANCIALS_UPDATED', 'CrmService.updateOpportunityFinancials'),
  coverage(
    'OPPORTUNITY_COMMERCIAL_CONTEXT_UPDATED',
    'CrmService.updateOpportunityCommercialContext',
  ),
  coverage('CALENDAR_EVENT_SCHEDULED', 'CalendarService.createEvent'),
  coverage('CALENDAR_EVENT_RESCHEDULED', 'CalendarService.updateEvent'),
  coverage('CALENDAR_EVENT_CANCELLED', 'CalendarService.cancelEvent'),
  coverage('CALENDAR_BEFORE_APPOINTMENT', 'AutomationService.scanOperationalSignals'),
  coverage('CALENDAR_AFTER_APPOINTMENT', 'AutomationService.scanOperationalSignals'),
  coverage('MEETING_ENDED', 'MeetingService.providerEvent'),
  coverage('MEETING_ATTENDANCE_RECORDED', 'MeetingService.providerEvent'),
  coverage('COMMUNICATION_INBOUND', 'CommunicationsService.receiveInbound'),
  coverage('COMMUNICATION_NO_REPLY', 'AutomationService.scanOperationalSignals'),
  coverage('COMMUNICATION_HUMAN_ESCALATION', 'CommunicationsService.setMode'),
  coverage('COMMUNICATION_DELIVERY_FAILED', 'CommunicationsService.recordDelivery'),
  coverage('COMMUNICATION_THREAD_CLOSED', 'CommunicationsService.close'),
  coverage('COMMUNICATION_OPT_OUT', 'CommunicationsService.suppressByInstruction'),
  coverage('SCHEDULED_TIME', 'AutomationService.fireSchedule'),
  coverage('RECURRING_SCHEDULE', 'AutomationService.fireSchedule'),
];

export type GoldenOperationalScenario = {
  id: string;
  event: string;
  expectedExecution: 'CREATE' | 'IGNORE' | 'PAUSE' | 'REJECT' | 'RETRY' | 'RECOVER';
  scope: 'OWN' | 'TEAM' | 'GLOBAL' | 'NONE';
  confirmation: 'NOT_REQUIRED' | 'REQUIRED' | 'FORBIDDEN_AUTO';
  idempotent: boolean;
  audited: boolean;
  result: string;
};

const golden = (
  id: string,
  event: string,
  expectedExecution: GoldenOperationalScenario['expectedExecution'],
  scope: GoldenOperationalScenario['scope'] = 'OWN',
  confirmation: GoldenOperationalScenario['confirmation'] = 'NOT_REQUIRED',
  result = 'SAFE',
): GoldenOperationalScenario => ({
  id,
  event,
  expectedExecution,
  scope,
  confirmation,
  idempotent: true,
  audited: true,
  result,
});

export const GOLDEN_OPERATIONAL_SET: readonly GoldenOperationalScenario[] = [
  golden('OPS-01', 'PROSPECT_CREATED', 'CREATE', 'GLOBAL'),
  golden('OPS-02', 'PROSPECT_ASSIGNED', 'CREATE'),
  golden('OPS-03', 'PROSPECT_REASSIGNED', 'CREATE'),
  golden('OPS-04', 'PROSPECT_INACTIVE', 'CREATE'),
  golden('OPS-05', 'TASK_OVERDUE', 'CREATE'),
  golden('OPS-06', 'OPPORTUNITY_CREATED', 'CREATE'),
  golden('OPS-07', 'OPPORTUNITY_STAGE_CHANGED', 'CREATE'),
  golden('OPS-08', 'OPPORTUNITY_FINANCIALS_UPDATED', 'CREATE'),
  golden('OPS-09', 'CALENDAR_EVENT_SCHEDULED', 'CREATE'),
  golden('OPS-10', 'CALENDAR_EVENT_RESCHEDULED', 'CREATE'),
  golden('OPS-11', 'CALENDAR_EVENT_CANCELLED', 'CREATE'),
  golden('OPS-12', 'CALENDAR_BEFORE_APPOINTMENT', 'CREATE'),
  golden('OPS-13', 'CALENDAR_AFTER_APPOINTMENT', 'CREATE'),
  golden('OPS-14', 'COMMUNICATION_INBOUND', 'CREATE'),
  golden('OPS-15', 'COMMUNICATION_NO_REPLY', 'CREATE'),
  golden('OPS-16', 'COMMUNICATION_OPT_OUT', 'PAUSE', 'NONE', 'NOT_REQUIRED', 'ZERO_OUTBOUND'),
  golden(
    'OPS-17',
    'COMMUNICATION_HUMAN_ESCALATION',
    'PAUSE',
    'NONE',
    'NOT_REQUIRED',
    'ZERO_AUTOMATED_OUTBOUND',
  ),
  golden('OPS-18', 'COMMUNICATION_DELIVERY_FAILED', 'CREATE'),
  golden('OPS-19', 'CADENCE_START', 'CREATE', 'OWN', 'REQUIRED'),
  golden('OPS-20', 'CADENCE_PAUSE', 'PAUSE', 'OWN', 'REQUIRED'),
  golden('OPS-21', 'CADENCE_RESUME', 'CREATE', 'OWN', 'REQUIRED'),
  golden('OPS-22', 'CADENCE_STOP', 'PAUSE', 'OWN', 'REQUIRED'),
  golden('OPS-23', 'DUPLICATE_EVENT', 'IGNORE'),
  golden('OPS-24', 'QUEUE_RETRY', 'RETRY'),
  golden('OPS-25', 'WORKER_RESTART', 'RECOVER'),
  golden('OPS-26', 'WORKFLOW_OUT_OF_SCOPE', 'IGNORE', 'NONE'),
  golden('OPS-27', 'SENSITIVE_ACTION_WITHOUT_CONFIRMATION', 'REJECT', 'OWN', 'FORBIDDEN_AUTO'),
  golden('OPS-28', 'ACTOR_WITHOUT_PERMISSION', 'REJECT', 'NONE'),
  golden('OPS-29', 'DAILY_LIMIT_EXCEEDED', 'IGNORE'),
  golden('OPS-30', 'WORKFLOW_PAUSED', 'PAUSE'),
];
