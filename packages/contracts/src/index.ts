import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, 'Debe incluir minúscula')
  .regex(/[A-Z]/, 'Debe incluir mayúscula')
  .regex(/[0-9]/, 'Debe incluir número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir símbolo');
export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
});
export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(512),
  password: passwordSchema,
});
export const createUserSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  name: z.string().trim().min(2).max(120),
  password: passwordSchema,
  roleIds: z.array(z.string().uuid()).min(1),
});
export const updateUserSchema = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim())
      .optional(),
    name: z.string().trim().min(2).max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const userStatusSchema = z.object({ isActive: z.boolean() });
export const userRolesSchema = z.object({ roleIds: z.array(z.string().uuid()).min(1) });
export const adminResetPasswordSchema = z.object({ password: passwordSchema });
export const updateSettingSchema = z.object({ value: z.unknown() });
export type LoginInput = z.infer<typeof loginSchema>;
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
};
export type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };

const plainText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .transform((value) =>
      value
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
const optionalPlainText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) =>
      value
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .transform((value) => value || undefined)
    .optional();
const slug = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(30)
  .regex(/^\+?[0-9][0-9 ()-]{5,28}[0-9]$/);

export const captureProspectSchema = z
  .object({
    submissionId: z.string().uuid(),
    name: plainText(120),
    phone: phoneSchema.optional(),
    email: z
      .string()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase().trim())
      .optional(),
    city: plainText(100),
    source: slug(40),
    campaign: optionalPlainText(100),
    landing: slug(80),
    interest: slug(60),
    message: optionalPlainText(1200),
    consent: z.object({
      accepted: z.literal(true, {
        errorMap: () => ({ message: 'El consentimiento es obligatorio' }),
      }),
      privacyVersion: slug(40),
    }),
    website: z.string().max(0).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: 'Debe proporcionar correo o teléfono',
    path: ['email'],
  });

export const prospectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['NEW', 'REVIEWED', 'ARCHIVED']).optional(),
  source: slug(40).optional(),
  landing: slug(80).optional(),
  interest: slug(60).optional(),
  sortBy: z.enum(['createdAt', 'lastCapturedAt', 'name', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CaptureProspectInput = z.infer<typeof captureProspectSchema>;
export type ProspectListQuery = z.infer<typeof prospectListQuerySchema>;

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });
const crmPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const crmProspectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  stage: slug(40).optional(),
  ownerId: uuid.optional(),
  interest: slug(60).optional(),
  source: slug(40).optional(),
  priority: crmPriority.optional(),
  tagId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  sortBy: z.enum(['lastCapturedAt', 'name', 'createdAt']).default('lastCapturedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export const opportunityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  stage: slug(40).optional(),
  ownerId: uuid.optional(),
  status: z.enum(['OPEN', 'WON', 'LOST', 'CANCELLED']).optional(),
  priority: crmPriority.optional(),
});
export const createOpportunitySchema = z.object({
  prospectId: uuid,
  title: plainText(160),
  priority: crmPriority.default('MEDIUM'),
});
export const moveOpportunityStageSchema = z.object({
  stageId: uuid,
  outcome: z.enum(['WON', 'LOST']).optional(),
});
export const assignProspectSchema = z.object({ assigneeId: uuid });
export const createTaskSchema = z.object({
  prospectId: uuid,
  opportunityId: uuid.optional(),
  assigneeId: uuid,
  title: plainText(160),
  description: optionalPlainText(1200),
  dueAt: isoDate,
  priority: crmPriority.default('MEDIUM'),
});
export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  assigneeId: uuid.optional(),
  prospectId: uuid.optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  overdue: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export const updateTaskStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
});
export const createNoteSchema = z.object({
  prospectId: uuid,
  opportunityId: uuid.optional(),
  body: plainText(4000),
});
export const updateNoteSchema = z.object({ body: plainText(4000) });
export const createInteractionSchema = z.object({
  prospectId: uuid,
  opportunityId: uuid.optional(),
  method: z.enum(['PHONE', 'EMAIL', 'MEETING', 'VIDEO', 'OTHER']),
  summary: plainText(1200),
  occurredAt: isoDate,
});
export const createTagSchema = z.object({
  name: plainText(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export const prospectTagSchema = z.object({ tagId: uuid });
export const updateCrmProspectSchema = z
  .object({
    name: plainText(120).optional(),
    city: plainText(100).optional(),
    interest: slug(60).optional(),
    message: optionalPlainText(1200),
    status: z.enum(['NEW', 'REVIEWED', 'ARCHIVED']).optional(),
  })
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    'Debe incluir al menos un cambio',
  );
export const crmActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  prospectId: uuid.optional(),
  opportunityId: uuid.optional(),
});
export const crmListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});
export const createCompanySchema = z.object({
  name: plainText(160),
  legalName: optionalPlainText(200),
  taxIdentifier: optionalPlainText(40),
  city: optionalPlainText(100),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  phone: optionalPlainText(30),
  prospectId: uuid.optional(),
  position: optionalPlainText(120),
});
export type CrmProspectListQuery = z.infer<typeof crmProspectListQuerySchema>;
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;

export const henryIntentionSchema = z.enum([
  'pension',
  'educacion',
  'patrimonio',
  'proteccion-familiar',
  'accidentes',
  'empresarios',
  'socios',
  'socio-unico',
  'consultores',
  'hablar-con-asesor',
  'agendar',
  'otra-consulta',
]);

export const henryPageContextSchema = z
  .object({
    pageType: z.enum([
      'public-home',
      'public-solution',
      'henry-full',
      'dashboard',
      'prospect-list',
      'prospect-detail',
      'company-detail',
      'pipeline',
      'tasks',
      'agenda',
      'henry-admin',
      'other',
    ]),
    section: slug(80).optional(),
    intentHint: slug(80).optional(),
    entityType: z.enum(['prospect', 'company', 'opportunity']).optional(),
    entityId: uuid.optional(),
    selectedStage: slug(80).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.entityType) !== Boolean(value.entityId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'entityType y entityId deben enviarse juntos' });
    }
    if (value.entityType && !['prospect-detail', 'company-detail'].includes(value.pageType)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'La entidad no corresponde al tipo de página' });
    }
  });

export const createHenryConversationSchema = z.object({
  channel: z.literal('WEB').default('WEB'),
  consent: z.object({
    accepted: z.literal(true, {
      errorMap: () => ({ message: 'El consentimiento es obligatorio' }),
    }),
    privacyVersion: slug(40),
  }),
  entryPoint: slug(80).default('henry'),
  pageContext: henryPageContextSchema.optional(),
});
export const sendHenryMessageSchema = z.object({
  messageId: uuid,
  content: plainText(4000),
  pageContext: henryPageContextSchema.optional(),
});
export const henryConversationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['ACTIVE', 'WAITING_HUMAN', 'CLOSED', 'BLOCKED']).optional(),
  channel: z.enum(['WEB', 'WHATSAPP', 'EMAIL', 'VOICE']).optional(),
  escalated: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().max(120).optional(),
});
export const requestEscalationSchema = z.object({
  reason: z.enum([
    'USER_REQUEST',
    'SENSITIVE_CONTEXT',
    'LOW_CONFIDENCE',
    'UNSUPPORTED_INTENT',
    'REPEATED_ERROR',
    'HIGH_VALUE_CASE',
    'AUTOMATION_LIMIT',
    'POLICY',
  ]),
  summary: plainText(1200),
});

export type CreateHenryConversationInput = z.infer<typeof createHenryConversationSchema>;
export type SendHenryMessageInput = z.infer<typeof sendHenryMessageSchema>;
export type HenryConversationListInput = z.infer<typeof henryConversationListSchema>;
export type HenryPageContextInput = z.infer<typeof henryPageContextSchema>;

export const calendarAvailabilityQuerySchema = z.object({
  timeMin: isoDate,
  timeMax: isoDate,
  durationMinutes: z.coerce.number().int().min(15).max(480).default(45),
  timezone: z.string().trim().min(1).max(100).default('America/Bogota'),
});
export const calendarEventListQuerySchema = z.object({
  timeMin: isoDate.optional(),
  timeMax: isoDate.optional(),
});
export const calendarTeamAvailabilityQuerySchema = calendarAvailabilityQuerySchema.extend({
  userIds: z.preprocess((value) => typeof value === 'string' ? value.split(',').filter(Boolean) : value, z.array(uuid).min(1).max(20)),
});
export const calendarTeamEventsQuerySchema = calendarEventListQuerySchema.extend({ userId: uuid });
export const calendarTeamMembershipSchema = z.object({ managerId: uuid }).strict();
export const calendarAvailabilityRuleSchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  workStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  minimumNoticeMinutes: z.number().int().min(0).max(43_200),
  defaultMeetingDuration: z.number().int().min(15).max(480),
  bufferBeforeMinutes: z.number().int().min(0).max(240),
  bufferAfterMinutes: z.number().int().min(0).max(240),
  maximumFutureBookingDays: z.number().int().min(1).max(730),
});
const calendarAttendeeSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const createCalendarEventSchema = z.object({
  title: plainText(240), description: optionalPlainText(2000), start: isoDate, end: isoDate,
  timezone: z.string().trim().min(1).max(100), attendees: z.array(calendarAttendeeSchema).max(50).default([]),
  location: optionalPlainText(500), createConference: z.boolean().default(false),
  reminders: z.array(z.object({ method: z.enum(['email', 'popup']), minutes: z.number().int().min(0).max(40_320) })).max(5).optional(),
  prospectId: uuid.optional(), companyId: uuid.optional(), opportunityId: uuid.optional(), conversationId: uuid.optional(),
  calendarOwnerUserId: uuid.optional(), assignedConsultantId: uuid.optional(),
  confirmedByUser: z.literal(true), sendUpdates: z.enum(['all', 'externalOnly', 'none']).default('all'),
}).refine((v) => new Date(v.end) > new Date(v.start), { message: 'El fin debe ser posterior al inicio', path: ['end'] });
export const updateCalendarEventSchema = z.object({
  title: plainText(240).optional(), description: optionalPlainText(2000), start: isoDate.optional(), end: isoDate.optional(),
  timezone: z.string().trim().min(1).max(100).optional(), attendees: z.array(calendarAttendeeSchema).max(50).optional(),
  location: optionalPlainText(500), createConference: z.boolean().optional(), confirmedByUser: z.literal(true),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).default('all'),
}).refine((v) => !v.start || !v.end || new Date(v.end) > new Date(v.start), { message: 'El fin debe ser posterior al inicio', path: ['end'] });
export const cancelCalendarEventSchema = z.object({ reason: plainText(500), confirmedByUser: z.literal(true), sendUpdates: z.enum(['all', 'externalOnly', 'none']).default('all') });
export const selectCalendarSchema = z.object({ calendarId: z.string().trim().min(1).max(512) });

export type CalendarAvailabilityQuery = z.infer<typeof calendarAvailabilityQuerySchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
