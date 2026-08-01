import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { errorDetails } from '@havona/shared';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { loadWorkerEnvironment } from '@havona/config';
import nodemailer, { Transporter } from 'nodemailer';
import { z } from 'zod';

const passwordResetJobSchema = z.object({
  to: z.string().email().max(254),
  resetUrl: z.string().url().max(2048),
});

@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private readonly config = loadWorkerEnvironment();
  private readonly redis = new Redis({
    host: this.config.REDIS_HOST,
    port: this.config.REDIS_PORT,
    password: this.config.REDIS_PASSWORD,
    db: this.config.REDIS_DB,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  private worker?: Worker;
  private emailWorker?: Worker;
  private mailer?: Transporter;

  async onModuleInit(): Promise<void> {
    await this.redis.ping();
    this.mailer =
      this.config.NODE_ENV === 'production'
        ? nodemailer.createTransport({
            host: this.config.SMTP_HOST,
            port: this.config.SMTP_PORT,
            secure: this.config.SMTP_SECURE,
            auth: { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD },
          })
        : nodemailer.createTransport({ jsonTransport: true });
    if (this.config.NODE_ENV === 'production') await this.mailer.verify();
    this.worker = new Worker(this.config.WORKER_QUEUE_NAME, (job) => this.process(job), {
      connection: this.redis,
      concurrency: this.config.WORKER_CONCURRENCY,
    });
    this.worker.on('completed', (job) =>
      this.logger.log({ event: 'job.completed', jobId: job.id, jobName: job.name }),
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error({ event: 'job.failed', jobId: job?.id, ...errorDetails(error) }),
    );
    this.worker.on('error', (error) =>
      this.logger.error({ event: 'worker.error', ...errorDetails(error) }),
    );
    this.emailWorker = new Worker('email', (job) => this.processEmail(job), {
      connection: this.redis,
      concurrency: this.config.WORKER_CONCURRENCY,
    });
    this.emailWorker.on('completed', (job) =>
      this.logger.log({ event: 'email.completed', jobId: job.id, jobName: job.name }),
    );
    this.emailWorker.on('failed', (job, error) =>
      this.logger.error({ event: 'email.failed', jobId: job?.id, ...errorDetails(error) }),
    );
    this.emailWorker.on('error', (error) =>
      this.logger.error({ event: 'email.worker.error', ...errorDetails(error) }),
    );
    await this.worker.waitUntilReady();
    await this.emailWorker.waitUntilReady();
    this.logger.log({ event: 'worker.ready', queues: [this.config.WORKER_QUEUE_NAME, 'email'] });
  }

  private async processEmail(job: Job): Promise<{ messageId: string }> {
    if (job.name !== 'password-reset') throw new Error(`Unsupported email job type: ${job.name}`);
    const payload = passwordResetJobSchema.parse(job.data);
    if (!this.mailer) throw new Error('Mail transport is not initialized');
    const result = await this.mailer.sendMail({
      from: this.config.SMTP_FROM,
      to: payload.to,
      subject: 'Restablece tu contraseña de HAVONA CAPITAL GROUP',
      text: [
        'Recibimos una solicitud para restablecer tu contraseña.',
        `Abre este enlace seguro: ${payload.resetUrl}`,
        'El enlace vence en 30 minutos. Si no hiciste la solicitud, ignora este mensaje.',
      ].join('\n\n'),
    });
    return { messageId: result.messageId };
  }

  private async process(job: Job): Promise<Record<string, unknown>> {
    if (job.name !== 'system.ping') throw new Error(`Unsupported job type: ${job.name}`);
    return {
      processedAt: new Date().toISOString(),
      correlationId: job.data?.correlationId ?? null,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.emailWorker?.close();
    this.mailer?.close();
    await this.redis.quit();
  }
}
