import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@havona/database';
import { createHash } from 'node:crypto';
import { AuditContext, AuditService } from '../audit/audit.service';
import { AutomationQueueService } from '../automations/automation-queue.service';
import { CalendarAccessService, CalendarActor } from '../calendar/calendar-access.service';
import { PrismaService } from '../common/prisma.service';
import { CommunicationsService } from '../communications/communications.service';
import { EmailTemplateService } from '../email-templates/email-template.service';

type Actor = CalendarActor;
type Intent =
  | 'EMAIL_DRAFT'
  | 'EMAIL_EDIT'
  | 'EMAIL_PREVIEW'
  | 'EMAIL_SEND'
  | 'EMAIL_SCHEDULE'
  | 'EMAIL_REPLY'
  | 'EMAIL_ATTACH'
  | 'EMAIL_CANCEL_SCHEDULED'
  | 'EMAIL_BATCH_PREPARE';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class HenryMessagingOperatorService {
  private readonly confirmationTtlMs = Math.max(
    60_000,
    Number(process.env.HENRY_MESSAGING_CONFIRMATION_TTL_SECONDS ?? 900) * 1000,
  );

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CalendarAccessService,
    private readonly templates: EmailTemplateService,
    private readonly communications: CommunicationsService,
    private readonly queue: AutomationQueueService,
  ) {}

  detectIntent(text: string): Intent | null {
    const value = text.toLocaleLowerCase('es-CO');
    if (/\b(cancela|anula)\b.*\b(correo|email)\b.*\b(programad)/.test(value))
      return 'EMAIL_CANCEL_SCHEDULED';
    if (/\b(programa|agenda)\b.*\b(correo|email|env[ií]o)/.test(value)) return 'EMAIL_SCHEDULE';
    if (/\b(adjunta|anexa)\b/.test(value)) return 'EMAIL_ATTACH';
    if (/\b(responde|contesta)\b.*\b(correo|email|mensaje)/.test(value)) return 'EMAIL_REPLY';
    if (/\b(env[ií]a(?:le)?|m[aá]ndale|manda)\b/.test(value)) return 'EMAIL_SEND';
    if (/\b(m[aá]s corto|cambia el asunto|edita|modifica)\b/.test(value)) return 'EMAIL_EDIT';
    if (/\b(previsualiza|preview|mu[eé]strame)\b/.test(value)) return 'EMAIL_PREVIEW';
    if (/\b(estos|estas)\b.*\b(clientes|prospectos)\b.*\b(correos|emails)\b/.test(value))
      return 'EMAIL_BATCH_PREPARE';
    if (/\b(prepara|redacta|escribe)\b.*\b(correo|email)\b/.test(value)) return 'EMAIL_DRAFT';
    return null;
  }

  async resolveConversationReference(reference: string) {
    const row = await this.db.conversation.findFirst({
      where: { OR: [{ id: reference }, { publicId: reference }] },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('HENRY_CONVERSATION_NOT_FOUND');
    return row.id;
  }

  async resolveRecipient(
    actor: Actor,
    conversationId: string,
    input: { prospectId?: string; name?: string; threadId?: string },
  ) {
    if (input.threadId) {
      const thread = await this.communications.get(actor, input.threadId);
      if (thread.channel !== 'EMAIL' || !thread.prospectId)
        throw new BadRequestException('EMAIL_THREAD_RECIPIENT_REQUIRED');
      return this.authorizedProspect(actor, thread.prospectId, 'THREAD');
    }
    if (input.prospectId) return this.authorizedProspect(actor, input.prospectId, 'EXPLICIT');
    const conversation = await this.db.conversation.findUnique({
      where: { id: conversationId },
      include: { state: true },
    });
    if (!conversation) throw new NotFoundException('HENRY_CONVERSATION_NOT_FOUND');
    const state = this.state(conversation.state?.state);
    const page = this.state(state.pageContext);
    if (page.entityType === 'prospect' && typeof page.entityId === 'string')
      return this.authorizedProspect(actor, page.entityId, 'PAGE_CONTEXT');
    if (typeof state.activeRecipientProspectId === 'string')
      return this.authorizedProspect(actor, state.activeRecipientProspectId, 'WORKING_CONTEXT');
    if (conversation.prospectId)
      return this.authorizedProspect(actor, conversation.prospectId, 'CONVERSATION');
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('EMAIL_RECIPIENT_REQUIRED');
    const global = actor.permissions.includes('crm.read_all');
    const matches = await this.db.prospect.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
        normalizedEmail: { not: null },
        ...(global ? {} : { assignments: { some: { assigneeId: actor.id, endedAt: null } } }),
      },
      select: { id: true, name: true, normalizedEmail: true },
      take: 6,
      orderBy: { updatedAt: 'desc' },
    });
    if (matches.length !== 1)
      throw new BadRequestException({
        code: matches.length ? 'EMAIL_RECIPIENT_AMBIGUOUS' : 'EMAIL_RECIPIENT_NOT_FOUND',
        candidates: matches.map((item) => ({ id: item.id, name: item.name })),
      });
    return { ...matches[0]!, source: 'AUTHORIZED_SEARCH' };
  }

  async prepare(
    actor: Actor,
    conversationId: string,
    input: {
      prospectId?: string;
      recipientName?: string;
      threadId?: string;
      templateId?: string;
      lifecycleStage?: string;
      triggerEvent?: string;
      evidence?: string[];
      subject?: string;
      body?: string;
      messageClassification?: 'TRANSACTIONAL' | 'RELATIONSHIP' | 'SERVICE';
      calendarEventId?: string;
      meetingId?: string;
      opportunityId?: string;
      companyId?: string;
    },
    ctx: AuditContext,
  ) {
    this.assertOperator(actor);
    const recipient = await this.resolveRecipient(actor, conversationId, {
      prospectId: input.prospectId,
      name: input.recipientName,
      threadId: input.threadId,
    });
    let templateId = input.templateId;
    if (!templateId && !input.body) {
      const recommended = await this.templates.recommend(actor, {
        lifecycleStage: input.lifecycleStage,
        triggerEvent: input.triggerEvent,
        evidence: input.evidence ?? [],
      });
      if (recommended.length !== 1)
        throw new BadRequestException({
          code: recommended.length ? 'EMAIL_TEMPLATE_AMBIGUOUS' : 'EMAIL_TEMPLATE_NOT_FOUND',
          candidates: recommended.map((item) => ({ templateId: item.templateId, key: item.key })),
        });
      templateId = recommended[0]!.templateId;
    }
    const thread = input.threadId
      ? await this.communications.get(actor, input.threadId)
      : await this.communications.resolveEmailThread(actor, recipient.id, ctx);
    const draft = templateId
      ? await this.templates.createDraft(
          {
            templateId,
            recipientProspectId: recipient.id,
            communicationThreadId: thread.id,
            calendarEventId: input.calendarEventId,
            meetingId: input.meetingId,
            opportunityId: input.opportunityId,
            companyId: input.companyId,
            generatedByHenry: true,
          },
          actor,
          ctx,
        )
      : await this.templates.createAdHocDraft(
          {
            recipientProspectId: recipient.id,
            communicationThreadId: thread.id,
            subject: input.subject,
            body: input.body,
            messageClassification: input.messageClassification ?? 'RELATIONSHIP',
            generatedByHenry: true,
          },
          actor,
          ctx,
        );
    await this.setWorkingDraft(conversationId, draft.id, recipient.id, thread.id);
    const preview = await this.templates.preview(draft.id, actor, ctx);
    await this.audit.record('HENRY_EMAIL_DRAFT_PREPARED', 'EmailTemplateDraft', draft.id, ctx, {
      conversationId,
      recipientSource: recipient.source,
      templateId: templateId ?? null,
    });
    return {
      intent: 'EMAIL_DRAFT',
      draftId: draft.id,
      recipient,
      preview,
      requiresConfirmation: true,
    };
  }

  async update(
    actor: Actor,
    conversationId: string,
    input: {
      draftId?: string;
      subjectOverride?: string;
      editableBlockOverrides?: Record<string, string>;
    },
    ctx: AuditContext,
  ) {
    const draftId = input.draftId ?? (await this.activeDraft(conversationId));
    const draft = await this.templates.updateDraft(draftId, input, actor);
    const preview = await this.templates.preview(draftId, actor, ctx);
    await this.audit.record('HENRY_EMAIL_DRAFT_EDITED', 'EmailTemplateDraft', draftId, ctx, {
      conversationId,
    });
    return { intent: 'EMAIL_EDIT', draftId: draft.id, preview, confirmationInvalidated: true };
  }

  async attach(
    actor: Actor,
    conversationId: string,
    input: { draftId?: string; references: Array<{ type: string; id: string }> },
    ctx: AuditContext,
  ) {
    const draftId = input.draftId ?? (await this.activeDraft(conversationId));
    const draft = await this.db.emailTemplateDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('EMAIL_DRAFT_NOT_FOUND');
    const existing = Array.isArray(draft.attachmentReferences) ? draft.attachmentReferences : [];
    await this.templates.updateDraft(
      draftId,
      { attachmentReferences: [...existing, ...input.references] },
      actor,
    );
    const preview = await this.templates.preview(draftId, actor, ctx);
    await this.audit.record('HENRY_EMAIL_ATTACHMENT_ADDED', 'EmailTemplateDraft', draftId, ctx, {
      count: input.references.length,
    });
    return { intent: 'EMAIL_ATTACH', draftId, preview, confirmationInvalidated: true };
  }

  async requestConfirmation(
    actor: Actor,
    conversationId: string,
    input: {
      draftId?: string;
      intent?: 'EMAIL_SEND' | 'EMAIL_SCHEDULE';
      scheduledAt?: string;
      timezone?: string;
      plan?: Record<string, unknown>;
    },
    ctx: AuditContext,
  ) {
    const draftId = input.draftId ?? (await this.activeDraft(conversationId));
    const preview = await this.templates.preview(draftId, actor, ctx);
    if (preview.missingVariables.length)
      throw new BadRequestException('EMAIL_DRAFT_MISSING_VARIABLES');
    const recipient = String(preview.variablesResolved['client.email'] ?? '').toLowerCase();
    if (!EMAIL.test(recipient)) throw new BadRequestException('EMAIL_RECIPIENT_INVALID');
    const intent = input.intent ?? 'EMAIL_SEND';
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (
      intent === 'EMAIL_SCHEDULE' &&
      (!scheduledAt || !Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date())
    )
      throw new BadRequestException('EMAIL_SCHEDULE_TIME_INVALID');
    if (intent === 'EMAIL_SCHEDULE' && !input.timezone)
      throw new BadRequestException('EMAIL_SCHEDULE_TIMEZONE_REQUIRED');
    const attachmentChecksum = hash(preview.attachmentReferences ?? []);
    const idempotencyKey = `henry-${intent.toLowerCase()}:${draftId}:${preview.checksum}`;
    const operation = await this.db.henryMessagingOperation.upsert({
      where: { idempotencyKey },
      update: {
        status: 'AWAITING_CONFIRMATION',
        confirmationExpiresAt: new Date(Date.now() + this.confirmationTtlMs),
        scheduledAt,
        timezone: input.timezone,
        plan: input.plan as Prisma.InputJsonValue | undefined,
      },
      create: {
        conversationId,
        actorId: actor.id,
        intent,
        status: 'AWAITING_CONFIRMATION',
        draftId,
        communicationThreadId: await this.draftThread(draftId),
        templateVersionId: preview.templateVersionId,
        recipientIdentity: recipient,
        renderChecksum: preview.checksum,
        attachmentChecksum,
        idempotencyKey,
        confirmationLevel: 'ALWAYS_CONFIRM',
        confirmationExpiresAt: new Date(Date.now() + this.confirmationTtlMs),
        scheduledAt,
        timezone: input.timezone,
        plan: input.plan as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.record(
      'HENRY_EMAIL_CONFIRMATION_REQUESTED',
      'HenryMessagingOperation',
      operation.id,
      ctx,
      {
        intent,
        draftId,
        expiresAt: operation.confirmationExpiresAt?.toISOString(),
      },
    );
    return {
      operationId: operation.id,
      intent,
      recipient,
      subject: preview.subject,
      text: preview.text,
      attachments: preview.attachmentReferences ?? [],
      classification: preview.messageClassification,
      scheduledAt,
      timezone: input.timezone,
      expiresAt: operation.confirmationExpiresAt,
      actionLabel:
        intent === 'EMAIL_SCHEDULE'
          ? `Programar para ${scheduledAt?.toISOString()}`
          : 'Enviar correo',
      confirmationRequired: true,
    };
  }

  async confirm(actor: Actor, operationId: string, ctx: AuditContext) {
    const operation = await this.ownedOperation(actor, operationId);
    if (operation.communicationMessageId) return this.status(actor, operation.id);
    if (operation.status !== 'AWAITING_CONFIRMATION')
      throw new BadRequestException('EMAIL_CONFIRMATION_INVALID');
    if (!operation.confirmationExpiresAt || operation.confirmationExpiresAt <= new Date()) {
      await this.db.henryMessagingOperation.update({
        where: { id: operation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('EMAIL_CONFIRMATION_EXPIRED');
    }
    await this.assertSnapshot(operation, actor);
    const confirmed = await this.db.henryMessagingOperation.update({
      where: { id: operation.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await this.audit.record(
      'HENRY_EMAIL_CONFIRMATION_ACCEPTED',
      'HenryMessagingOperation',
      operation.id,
      ctx,
    );
    if (confirmed.intent === 'EMAIL_SCHEDULE') {
      const jobId = await this.queue.scheduleMessagingOperation(
        confirmed.id,
        confirmed.scheduledAt!,
      );
      const scheduled = await this.db.henryMessagingOperation.update({
        where: { id: confirmed.id },
        data: { status: 'SCHEDULED', bullJobId: jobId },
      });
      await this.db.emailTemplateDraft.update({
        where: { id: confirmed.draftId },
        data: { status: 'SCHEDULED' },
      });
      await this.audit.record(
        'HENRY_EMAIL_SCHEDULED',
        'HenryMessagingOperation',
        confirmed.id,
        ctx,
        {
          scheduledAt: confirmed.scheduledAt?.toISOString(),
          timezone: confirmed.timezone,
        },
      );
      return {
        operationId: scheduled.id,
        status: scheduled.status,
        scheduledAt: scheduled.scheduledAt,
        timezone: scheduled.timezone,
      };
    }
    return this.dispatch(confirmed.id, actor, ctx);
  }

  async executeScheduled(operationId: string) {
    const operation = await this.db.henryMessagingOperation.findUniqueOrThrow({
      where: { id: operationId },
    });
    if (operation.status !== 'SCHEDULED') return { ignored: true, status: operation.status };
    const actor = await this.loadActor(operation.actorId);
    return this.dispatch(operation.id, actor, { actorUserId: actor.id });
  }

  async cancel(actor: Actor, operationId: string, ctx: AuditContext) {
    const operation = await this.ownedOperation(actor, operationId);
    if (operation.status !== 'SCHEDULED')
      throw new BadRequestException('EMAIL_SCHEDULE_NOT_CANCELLABLE');
    if (!(await this.queue.cancelMessagingOperation(operation.id)))
      throw new BadRequestException('EMAIL_SCHEDULE_ALREADY_EXECUTING');
    await this.db.$transaction([
      this.db.henryMessagingOperation.update({
        where: { id: operation.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      this.db.emailTemplateDraft.update({
        where: { id: operation.draftId },
        data: { status: 'CANCELLED' },
      }),
    ]);
    await this.audit.record(
      'HENRY_EMAIL_SCHEDULE_CANCELLED',
      'HenryMessagingOperation',
      operation.id,
      ctx,
    );
    return { operationId, status: 'CANCELLED', cancelled: true };
  }

  async status(actor: Actor, operationId: string) {
    const operation = await this.ownedOperation(actor, operationId);
    const message = operation.communicationMessageId
      ? await this.db.communicationMessage.findUnique({
          where: { id: operation.communicationMessageId },
          select: { id: true, status: true, errorCode: true, sentAt: true, deliveredAt: true },
        })
      : null;
    return { operationId, operationStatus: operation.status, message };
  }

  async current(actor: Actor, conversationId: string) {
    const participant = await this.db.conversationParticipant.findFirst({
      where: { conversationId, userId: actor.id, type: 'USER' },
      select: { id: true },
    });
    if (!participant) throw new NotFoundException('HENRY_CONVERSATION_NOT_FOUND');
    const state = await this.db.conversationState.findUnique({ where: { conversationId } });
    const draftId = this.state(state?.state).activeEmailDraftId;
    if (typeof draftId !== 'string') return { draft: null, operation: null };
    const preview = await this.templates.preview(draftId, actor);
    const operation = await this.db.henryMessagingOperation.findFirst({
      where: { conversationId, actorId: actor.id, draftId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        intent: true,
        status: true,
        confirmationExpiresAt: true,
        scheduledAt: true,
        timezone: true,
        communicationMessageId: true,
      },
    });
    return { draft: { id: draftId, preview }, operation };
  }

  async batchPrepare(
    actor: Actor,
    conversationId: string,
    input: { prospectIds: string[]; templateId: string },
    ctx: AuditContext,
  ) {
    if (input.prospectIds.length < 1 || input.prospectIds.length > 10)
      throw new BadRequestException('EMAIL_BATCH_SIZE_INVALID');
    const drafts = [];
    for (const prospectId of [...new Set(input.prospectIds)])
      drafts.push(
        await this.prepare(
          actor,
          conversationId,
          { prospectId, templateId: input.templateId },
          ctx,
        ),
      );
    return { intent: 'EMAIL_BATCH_PREPARE', count: drafts.length, drafts, autoSend: false };
  }

  private async dispatch(operationId: string, actor: Actor, ctx: AuditContext) {
    const operation = await this.ownedOperation(actor, operationId);
    if (operation.communicationMessageId) return this.status(actor, operation.id);
    await this.assertSnapshot(operation, actor);
    const preview = await this.templates.preview(operation.draftId, actor);
    const draft = await this.db.emailTemplateDraft.findUniqueOrThrow({
      where: { id: operation.draftId },
    });
    if (draft.templateId) {
      const template = await this.db.emailTemplate.findUniqueOrThrow({
        where: { id: draft.templateId },
      });
      const version = await this.db.emailTemplateVersion.findUniqueOrThrow({
        where: { id: draft.templateVersionId! },
      });
      if (
        template.status !== 'ACTIVE' ||
        template.activeVersionId !== version.id ||
        version.status !== 'ACTIVE' ||
        version.legalStatus !== 'LEGAL_APPROVED'
      )
        throw new BadRequestException('EMAIL_TEMPLATE_NOT_OPERATIONAL');
    }
    const threadId = operation.communicationThreadId ?? (await this.draftThread(operation.draftId));
    if (!threadId) throw new BadRequestException('EMAIL_THREAD_REQUIRED');
    const usage = draft.templateId
      ? await this.templates.handoff(operation.draftId, actor, ctx)
      : null;
    const message = await this.communications.send(
      actor,
      threadId,
      {
        text: preview.text,
        html: preview.html,
        subject: preview.subject,
        messageClassification: preview.messageClassification,
        idempotencyKey: hash(operation.idempotencyKey).slice(0, 64),
        generatedByHenry: true,
        templateMetadata: {
          templateId: draft.templateId,
          templateVersionId: draft.templateVersionId,
          variantId: draft.variantId,
          draftId: draft.id,
          usageId: usage?.usageId,
          henryOperationId: operation.id,
          confirmationLevel: operation.confirmationLevel,
        },
      },
      ctx,
    );
    await this.db.$transaction([
      this.db.henryMessagingOperation.update({
        where: { id: operation.id },
        data: {
          status: 'QUEUED',
          communicationMessageId: message.id,
          completedAt: new Date(),
          result: { messageId: message.id, status: message.status },
        },
      }),
      this.db.emailTemplateDraft.update({ where: { id: draft.id }, data: { status: 'SENT' } }),
      ...(usage
        ? [
            this.db.emailTemplateUsage.update({
              where: { id: usage.usageId },
              data: { communicationMessageId: message.id },
            }),
          ]
        : []),
    ]);
    let followUp: Record<string, unknown> | null = null;
    const plan = this.state(operation.plan);
    if (plan.followUpAt && typeof plan.followUpAt === 'string') {
      try {
        const assignment = draft.recipientProspectId
          ? await this.db.assignment.findFirst({
              where: { prospectId: draft.recipientProspectId, endedAt: null },
              orderBy: { createdAt: 'desc' },
            })
          : null;
        if (!assignment) throw new Error('FOLLOW_UP_ASSIGNEE_REQUIRED');
        const task = await this.db.task.create({
          data: {
            prospectId: draft.recipientProspectId!,
            assigneeId: assignment.assigneeId,
            createdById: actor.id,
            title: 'Seguimiento posterior al correo',
            dueAt: new Date(plan.followUpAt),
            priority: 'MEDIUM',
          },
        });
        followUp = { status: 'CREATED', taskId: task.id };
      } catch (error) {
        followUp = {
          status: 'FAILED',
          code: error instanceof Error ? error.message : 'FOLLOW_UP_FAILED',
        };
        await this.db.henryMessagingOperation.update({
          where: { id: operation.id },
          data: {
            status: 'PARTIAL_FAILED',
            result: {
              messageId: message.id,
              messageStatus: message.status,
              followUp,
            } as Prisma.InputJsonValue,
          },
        });
        await this.audit.record(
          'HENRY_EMAIL_PARTIAL_FAILURE',
          'HenryMessagingOperation',
          operation.id,
          ctx,
          followUp as Prisma.InputJsonValue,
        );
      }
    }
    await this.audit.record(
      'HENRY_EMAIL_SEND_QUEUED',
      'HenryMessagingOperation',
      operation.id,
      ctx,
      { messageId: message.id, followUp } as Prisma.InputJsonValue,
    );
    return { operationId: operation.id, messageId: message.id, status: message.status, followUp };
  }

  private async assertSnapshot(operation: any, actor: Actor) {
    const preview = await this.templates.preview(operation.draftId, actor);
    if (
      preview.checksum !== operation.renderChecksum ||
      hash(preview.attachmentReferences ?? []) !== operation.attachmentChecksum ||
      String(preview.variablesResolved['client.email'] ?? '').toLowerCase() !==
        operation.recipientIdentity
    )
      throw new BadRequestException('EMAIL_CONFIRMATION_STALE');
  }
  private async authorizedProspect(actor: Actor, id: string, source: string) {
    await this.access.authorizeRelations(actor, { prospectId: id });
    const prospect = await this.db.prospect.findUnique({
      where: { id },
      select: { id: true, name: true, normalizedEmail: true },
    });
    if (!prospect?.normalizedEmail) throw new BadRequestException('EMAIL_RECIPIENT_REQUIRED');
    return { ...prospect, source };
  }
  private async ownedOperation(actor: Actor, id: string) {
    const operation = await this.db.henryMessagingOperation.findUnique({ where: { id } });
    if (!operation) throw new NotFoundException('HENRY_MESSAGING_OPERATION_NOT_FOUND');
    if (operation.actorId !== actor.id)
      throw new ForbiddenException('HENRY_MESSAGING_OPERATION_FORBIDDEN');
    return operation;
  }
  private async draftThread(id: string) {
    const draft = await this.db.emailTemplateDraft.findUnique({
      where: { id },
      select: { communicationThreadId: true },
    });
    if (!draft) throw new NotFoundException('EMAIL_DRAFT_NOT_FOUND');
    return draft.communicationThreadId;
  }
  private async activeDraft(conversationId: string) {
    const row = await this.db.conversationState.findUnique({ where: { conversationId } });
    const id = this.state(row?.state).activeEmailDraftId;
    if (typeof id !== 'string') throw new BadRequestException('EMAIL_ACTIVE_DRAFT_REQUIRED');
    return id;
  }
  private async setWorkingDraft(
    conversationId: string,
    draftId: string,
    prospectId: string,
    threadId: string,
  ) {
    const row = await this.db.conversationState.findUniqueOrThrow({ where: { conversationId } });
    const state = this.state(row.state);
    await this.db.conversationState.update({
      where: { conversationId },
      data: {
        version: { increment: 1 },
        state: {
          ...state,
          activeEmailDraftId: draftId,
          activeRecipientProspectId: prospectId,
          activeCommunicationThreadId: threadId,
          activeDraftUpdatedAt: new Date().toISOString(),
        },
      },
    });
  }
  private state(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }
  private assertOperator(actor: Actor) {
    if (
      !actor.permissions.includes('email_templates.preview') ||
      !actor.permissions.includes('communications.send')
    )
      throw new ForbiddenException('HENRY_MESSAGING_OPERATOR_FORBIDDEN');
  }
  private async loadActor(id: string): Promise<Actor> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    return {
      id,
      roles: user.roles.map((item) => item.role.name),
      permissions: [
        ...new Set(
          user.roles.flatMap((item) => item.role.permissions.map((grant) => grant.permission.key)),
        ),
      ],
    };
  }
}
