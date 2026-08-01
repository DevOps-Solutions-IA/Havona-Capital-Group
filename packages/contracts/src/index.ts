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
export type CrmProspectListQuery = z.infer<typeof crmProspectListQuerySchema>;
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;
