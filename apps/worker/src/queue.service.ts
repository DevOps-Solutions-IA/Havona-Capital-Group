import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { errorDetails } from '@havona/shared';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { loadWorkerEnvironment } from '@havona/config';
import nodemailer, { Transporter } from 'nodemailer';
import { z } from 'zod';
import { PrismaClient } from '@havona/database';

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
  private communicationsWorker?: Worker;
  private readonly db = new PrismaClient();
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
    this.communicationsWorker = new Worker(
      process.env.COMMUNICATIONS_QUEUE_NAME ?? 'havona-communications',
      (job) => this.processCommunication(job),
      { connection: this.redis, concurrency: this.config.WORKER_CONCURRENCY },
    );
    this.communicationsWorker.on('completed', (job) =>
      this.logger.log({ event: 'communication.completed', jobId: job.id, jobName: job.name }),
    );
    this.communicationsWorker.on('failed', (job, error) =>
      this.logger.error({
        event: 'communication.failed',
        jobId: job?.id,
        errorName: error.name,
        errorCode: (error as NodeJS.ErrnoException).code,
      }),
    );
    await this.worker.waitUntilReady();
    await this.emailWorker.waitUntilReady();
    await this.communicationsWorker.waitUntilReady();
    this.logger.log({
      event: 'worker.ready',
      queues: [
        this.config.WORKER_QUEUE_NAME,
        'email',
        process.env.COMMUNICATIONS_QUEUE_NAME ?? 'havona-communications',
      ],
    });
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

  private async processCommunication(job: Job): Promise<Record<string, unknown>> {
    const messageId = z.string().uuid().parse(job.data?.messageId);
    if (job.name === 'communication.inbound') return { accepted: true, messageId };
    if (job.name !== 'communication.send')
      throw new Error(`Unsupported communication job: ${job.name}`);
    const message = await this.db.communicationMessage.findUnique({
      where: { id: messageId },
      include: { thread: true },
    });
    if (!message) throw new Error('COMMUNICATION_THREAD_NOT_FOUND');
    if (['SENT', 'DELIVERED', 'READ'].includes(message.status))
      return { idempotent: true, messageId };
    const consent = await this.db.communicationConsent.findUnique({
      where: { threadId: message.threadId },
    });
    if (consent?.commercialStatus === 'OPTED_OUT' || consent?.commercialStatus === 'SUPPRESSED') {
      await this.db.communicationMessage.update({
        where: { id: message.id },
        data: { status: 'BLOCKED', errorCode: 'CONTACT_SUPPRESSED' },
      });
      return { blocked: true, messageId };
    }
    try {
      const providerMessageId =
        message.thread.channel === 'WHATSAPP'
          ? await this.sendMeta(message)
          : await this.sendResend(message);
      await this.db.communicationMessage.update({
        where: { id: message.id },
        data: { providerMessageId, status: 'SENT', sentAt: new Date() },
      });
      return { sent: true, messageId };
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 100) : 'PROVIDER_UNAVAILABLE';
      await this.db.communicationMessage.update({
        where: { id: message.id },
        data: { status: 'FAILED', errorCode: code },
      });
      throw error;
    }
  }

  private async sendMeta(message: any): Promise<string> {
    const token = process.env.META_WHATSAPP_ACCESS_TOKEN,
      phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    if (process.env.META_WHATSAPP_ENABLED !== 'true' || !token || !phoneId)
      throw new Error('CHANNEL_NOT_CONFIGURED');
    const metadata = (message.metadata ?? {}) as Record<string, any>;
    const payload =
      message.contentType === 'TEMPLATE'
        ? {
            messaging_product: 'whatsapp',
            to: message.recipientIdentity,
            type: 'template',
            template: {
              name: metadata.templateName,
              language: { code: metadata.templateLanguage ?? 'es' },
              components: (metadata.templateParameters ?? []).length
                ? [
                    {
                      type: 'body',
                      parameters: metadata.templateParameters.map((text: string) => ({
                        type: 'text',
                        text,
                      })),
                    },
                  ]
                : [],
            },
          }
        : {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.recipientIdentity,
            type: 'text',
            text: { preview_url: false, body: message.bodyText },
          };
    const response = await fetch(
      `${(process.env.META_WHATSAPP_BASE_URL ?? 'https://graph.facebook.com').replace(/\/$/, '')}/${process.env.META_WHATSAPP_API_VERSION ?? 'v23.0'}/${phoneId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Number(process.env.META_WHATSAPP_REQUEST_TIMEOUT_MS ?? 15000)),
      },
    );
    const data = (await response.json().catch(() => ({}))) as { messages?: { id: string }[] };
    if (!response.ok || !data.messages?.[0]?.id) throw new Error('MESSAGE_SEND_FAILED');
    return data.messages[0].id;
  }
  private async sendResend(message: any): Promise<string> {
    const key = process.env.RESEND_API_KEY,
      from = process.env.RESEND_FROM_EMAIL;
    if (process.env.RESEND_ENABLED !== 'true' || !key || !from)
      throw new Error('CHANNEL_NOT_CONFIGURED');
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const subject =
      typeof metadata.subject === 'string' ? metadata.subject : message.thread.subject;
    if (!subject) throw new Error('EMAIL_SUBJECT_REQUIRED');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${process.env.RESEND_FROM_NAME ?? 'HAVONA CAPITAL GROUP'} <${from}>`,
        to: [message.recipientIdentity],
        subject,
        text: message.bodyText,
        html: message.bodyHtml ?? undefined,
        reply_to: process.env.RESEND_REPLY_TO || undefined,
      }),
      signal: AbortSignal.timeout(Number(process.env.RESEND_REQUEST_TIMEOUT_MS ?? 15000)),
    });
    const data = (await response.json().catch(() => ({}))) as { id?: string };
    if (!response.ok || !data.id) throw new Error('EMAIL_DELIVERY_FAILED');
    return data.id;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.emailWorker?.close();
    await this.communicationsWorker?.close();
    this.mailer?.close();
    await this.redis.quit();
    await this.db.$disconnect();
  }
}
