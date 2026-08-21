import { z } from 'zod';

const commonSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const redisSchema = z.object({
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().min(16).optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
});

const booleanFromEnvironment = z.preprocess(
  (value) => value === true || value === 'true' || value === '1',
  z.boolean(),
);

const optionalEnvironmentString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const workerEnvironmentSchema = commonSchema
  .merge(redisSchema)
  .extend({
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
    WORKER_QUEUE_NAME: z
      .string()
      .regex(/^[a-z0-9:_-]+$/i)
      .default('havona-system'),
    SMTP_HOST: optionalEnvironmentString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanFromEnvironment.default(false),
    SMTP_USER: optionalEnvironmentString,
    SMTP_PASSWORD: optionalEnvironmentString,
    SMTP_FROM: optionalEnvironmentString,
  })
  .superRefine((environment, context) => {
    const smtpFields = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'] as const;
    const configuredFields = smtpFields.filter((field) => Boolean(environment[field]));
    if (configuredFields.length > 0 && configuredFields.length < smtpFields.length) {
      for (const field of smtpFields) {
        if (!environment[field]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'required when SMTP transport is configured',
          });
        }
      }
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.SMTP_FROM?.includes('@localhost')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_FROM'],
        message: 'must use a deliverable address in production',
      });
    }
  });

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function loadWorkerEnvironment(source: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  const result = workerEnvironmentSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid worker environment: ${details}`);
  }
  return result.data;
}
