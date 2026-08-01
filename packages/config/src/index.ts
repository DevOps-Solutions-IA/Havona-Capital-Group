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

export const workerEnvironmentSchema = commonSchema
  .merge(redisSchema)
  .extend({
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
    WORKER_QUEUE_NAME: z
      .string()
      .regex(/^[a-z0-9:_-]+$/i)
      .default('havona-system'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanFromEnvironment.default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(3).default('HAVONA CAPITAL GROUP <no-reply@localhost>'),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production') {
      for (const field of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
        if (!environment[field]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'required in production',
          });
        }
      }
      if (environment.SMTP_FROM.includes('@localhost')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_FROM'],
          message: 'must use a deliverable address in production',
        });
      }
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
