import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import {
  errorDetails,
  normalizeEmailIdentity,
  ResendTransportError,
  sendResendEmail,
  validatePaligMessagingContext,
} from '@havona/shared';
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
    if (
      this.config.SMTP_HOST &&
      this.config.SMTP_USER &&
      this.config.SMTP_PASSWORD &&
      this.config.SMTP_FROM
    ) {
      this.mailer = nodemailer.createTransport({
        host: this.config.SMTP_HOST,
        port: this.config.SMTP_PORT,
        secure: this.config.SMTP_SECURE,
        auth: { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD },
      });
      if (this.config.NODE_ENV === 'production') await this.mailer.verify();
    } else if (this.config.NODE_ENV !== 'production') {
      this.mailer = nodemailer.createTransport({ jsonTransport: true });
    }
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
    if (!this.mailer || !this.config.SMTP_FROM) throw new Error('CHANNEL_NOT_CONFIGURED');
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
    if (['SENT', 'DELIVERED', 'READ', 'BOUNCED', 'COMPLAINED'].includes(message.status))
      return { idempotent: true, messageId };
    const claim = await this.db.communicationMessage.updateMany({
      where: { id: message.id, status: { in: ['QUEUED', 'FAILED'] } },
      data: { status: 'SENDING', errorCode: null },
    });
    if (!claim.count) return { idempotent: true, messageId };
    const policyBlock = await this.validateCommunicationBeforeDispatch(message);
    if (policyBlock) {
      await this.db.communicationMessage.update({
        where: { id: message.id },
        data: { status: 'BLOCKED', errorCode: policyBlock },
      });
      this.logger.warn({ event: 'communication.blocked', messageId, code: policyBlock });
      return { blocked: true, messageId, code: policyBlock };
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
      const providerError =
        error instanceof ResendTransportError
          ? error
          : new ResendTransportError(
              error instanceof Error ? error.message.slice(0, 100) : 'PROVIDER_UNAVAILABLE',
              true,
            );
      const exhausted = job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
      await this.db.communicationMessage.update({
        where: { id: message.id },
        data: {
          status: providerError.retryable && !exhausted ? 'QUEUED' : 'FAILED',
          errorCode: providerError.code,
        },
      });
      this.logger[providerError.retryable ? 'warn' : 'error']({
        event:
          providerError.retryable && !exhausted
            ? 'communication.retry_scheduled'
            : 'communication.failed',
        messageId,
        code: providerError.code,
        retryable: providerError.retryable,
        exhausted,
      });
      if (providerError.retryable && !exhausted) throw providerError;
      return { failed: true, messageId, code: providerError.code, retryable: false };
    }
  }

  private async validateCommunicationBeforeDispatch(message: any): Promise<string | null> {
    if (message.thread.status === 'CLOSED' || message.thread.status === 'BLOCKED')
      return 'COMMUNICATION_FORBIDDEN';
    if (message.thread.channel === 'EMAIL') {
      const recipient = normalizeEmailIdentity(message.recipientIdentity);
      if (!recipient) return 'CONTACT_INVALID';
      if (message.thread.prospectId) {
        const prospect = await this.db.prospect.findUnique({
          where: { id: message.thread.prospectId },
          select: { normalizedEmail: true },
        });
        if (
          !prospect?.normalizedEmail ||
          normalizeEmailIdentity(prospect.normalizedEmail) !== recipient
        )
          return 'CONTACT_INVALID';
      }
    }
    const consent = await this.db.communicationConsent.findUnique({
      where: { threadId: message.threadId },
    });
    if (consent?.commercialStatus === 'OPTED_OUT' || consent?.commercialStatus === 'SUPPRESSED')
      return 'CONTACT_SUPPRESSED';
    const metadata = (message.metadata ?? {}) as Record<string, any>;
    if (
      ['COMMERCIAL', 'MARKETING'].includes(String(metadata.messageClassification ?? '')) &&
      consent?.commercialStatus !== 'OPTED_IN'
    )
      return 'COMMUNICATION_CONSENT_REQUIRED';
    if (Array.isArray(metadata.attachmentReferences) && metadata.attachmentReferences.length)
      return 'ATTACHMENTS_NOT_DISPATCHABLE';
    if (metadata.templateVersionId) {
      const version = await this.db.emailTemplateVersion.findUnique({
        where: { id: String(metadata.templateVersionId) },
        include: { template: true },
      });
      if (
        !version ||
        version.status !== 'ACTIVE' ||
        version.legalStatus !== 'LEGAL_APPROVED' ||
        version.template.status !== 'ACTIVE' ||
        version.template.activeVersionId !== version.id
      )
        return 'EMAIL_TEMPLATE_NOT_OPERATIONAL';
    }
    if (message.thread.opportunityId) {
      const opportunity = await this.db.opportunity.findUnique({
        where: { id: message.thread.opportunityId },
        select: {
          customerNeedId: true,
          authorizedSolutionId: true,
          authorizedProductId: true,
          customerNeed: { select: { status: true } },
          authorizedSolution: { select: { status: true, productId: true } },
          authorizedProduct: { select: { status: true, carrier: true } },
        },
      });
      if (!opportunity) return 'PALIG_CONTEXT_INVALID';
      const mapping =
        opportunity.customerNeedId && opportunity.authorizedSolutionId
          ? await this.db.needSolutionMapping.findUnique({
              where: {
                customerNeedId_solutionId: {
                  customerNeedId: opportunity.customerNeedId,
                  solutionId: opportunity.authorizedSolutionId,
                },
              },
              select: { status: true },
            })
          : null;
      const paligError = validatePaligMessagingContext({
        customerNeedId: opportunity.customerNeedId,
        customerNeedStatus: opportunity.customerNeed?.status ?? null,
        authorizedSolutionId: opportunity.authorizedSolutionId,
        authorizedSolutionStatus: opportunity.authorizedSolution?.status ?? null,
        solutionProductId: opportunity.authorizedSolution?.productId ?? null,
        authorizedProductId: opportunity.authorizedProductId,
        authorizedProductStatus: opportunity.authorizedProduct?.status ?? null,
        authorizedProductCarrier: opportunity.authorizedProduct?.carrier ?? null,
        mappingStatus: mapping?.status ?? null,
      });
      if (paligError) return paligError;
    }
    return null;
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
    const result = await sendResendEmail({
      apiKey: key,
      fromEmail: from,
      fromName: process.env.RESEND_FROM_NAME ?? 'HAVONA CAPITAL GROUP',
      to: message.recipientIdentity,
      subject,
      text: message.bodyText ?? '',
      html: message.bodyHtml ?? undefined,
      replyTo: process.env.RESEND_REPLY_TO || undefined,
      idempotencyKey: message.idempotencyKey,
      timeoutMs: Number(process.env.RESEND_REQUEST_TIMEOUT_MS ?? 15000),
    });
    return result.providerMessageId;
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
