import { z } from 'zod';

export const cadenceStepType = z.enum([
  'SEND_EMAIL',
  'PREPARE_EMAIL',
  'SEND_WHATSAPP_FUTURE',
  'CREATE_TASK',
  'WAIT',
  'CHECK_CONDITION',
  'ESCALATE',
  'SUGGEST_MEETING',
  'END',
]);

export const cadenceStopCondition = z.enum([
  'CUSTOMER_REPLIED',
  'MEETING_SCHEDULED',
  'OPPORTUNITY_CLOSED',
  'PROSPECT_DISQUALIFIED',
  'OPT_OUT',
  'SUPPRESSED',
  'HUMAN_TAKEOVER',
  'THREAD_PAUSED',
  'THREAD_CLOSED',
  'DOCUMENT_RECEIVED',
  'MANUAL_STOP',
  'CADENCE_COMPLETED',
  'ERROR_POLICY',
]);

const ianaTimezone = z
  .string()
  .min(3)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'CADENCE_TIMEZONE_INVALID');

export const cadenceVersionSchema = z.object({
  allowedRoles: z.array(z.enum(['CONSULTOR', 'GERENTE', 'ADMIN', 'SUPER_ADMIN'])).min(1),
  channels: z.array(z.enum(['EMAIL', 'WHATSAPP', 'FUTURE_CHANNEL'])).min(1),
  enrollmentConditions: z.record(z.string(), z.unknown()).default({}),
  stopConditions: z.array(cadenceStopCondition).min(1),
  approvalPolicy: z.enum(['AUTO', 'APPROVAL_REQUIRED', 'HENRY_CONFIRM', 'MANAGER_APPROVAL']),
  frequency: z.object({
    maxPerDay: z.number().int().min(1).max(20),
    maxPerSevenDays: z.number().int().min(1).max(50),
    minimumIntervalMinutes: z.number().int().min(1).max(43_200),
  }),
  sendingWindow: z
    .object({
      days: z.array(z.number().int().min(1).max(7)).min(1),
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      timezone: ianaTimezone,
    })
    .refine((window) => window.start <= window.end, 'CADENCE_SENDING_WINDOW_INVALID'),
  maxLifetimeDays: z.number().int().min(1).max(365),
  steps: z
    .array(
      z.object({
        type: cadenceStepType,
        delayMinutes: z.number().int().min(0).max(525_600),
        templateKey: z.string().min(3).max(120).optional(),
        approvalMode: z.enum(['AUTO', 'REQUIRES_CONFIRMATION', 'HUMAN_ONLY']),
        condition: z.record(z.string(), z.unknown()).optional(),
        requiredEvidence: z.array(z.string().min(2)).default([]),
        definition: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(25),
});

export const createCadenceSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
    name: z.string().trim().min(3).max(160),
    purpose: z.string().trim().min(10).max(500),
    ownerScope: z.enum(['CORPORATE', 'PERSONAL']).default('CORPORATE'),
    version: cadenceVersionSchema,
  })
  .strict();

export const enrollCadenceSchema = z
  .object({
    cadenceId: z.string().uuid(),
    prospectId: z.string().uuid(),
    opportunityId: z.string().uuid().optional(),
    communicationThreadId: z.string().uuid().optional(),
    timezone: ianaTimezone.default('America/Bogota'),
    confirm: z.literal(true),
  })
  .strict();

export type CadenceActor = { id: string; roles?: string[]; permissions: string[] };
