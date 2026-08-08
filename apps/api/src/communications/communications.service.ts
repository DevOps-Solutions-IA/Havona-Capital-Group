import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@havona/database';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeEmailIdentity, validatePaligMessagingContext } from '@havona/shared';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CalendarAccessService, CalendarActor } from '../calendar/calendar-access.service';
import { PrismaService } from '../common/prisma.service';
import { CommunicationsConfig } from './communications-config';
import { CommunicationsQueueService } from './communications-queue.service';
import { CommunicationError } from './communications.types';
import { AutomationEventBus } from '../automations/automation-event-bus.service';

type Actor = CalendarActor;
type Relations = {
  prospectId?: string;
  companyId?: string;
  opportunityId?: string;
  conversationId?: string;
};
const E164 = /^\+[1-9]\d{7,14}$/;
const OPT_OUT =
  /\b(no me escriban|no quiero recibir mensajes|darme de baja|cancelar suscripci[oó]n|stop|unsubscribe)\b/i;
const DELIVERY_TERMINAL = new Set(['BOUNCED', 'COMPLAINED']);

@Injectable()
export class CommunicationsService {
  constructor(
    private db: PrismaService,
    private audit: AuditService,
    private access: CalendarAccessService,
    private config: CommunicationsConfig,
    private queue: CommunicationsQueueService,
    @Optional() private eventBus?: AutomationEventBus,
  ) {}
  configStatus() {
    return this.config.status();
  }
  private isAdmin(actor: Actor) {
    return Boolean(actor.roles?.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN'));
  }
  private async scopedUserIds(actor: Actor) {
    if (this.isAdmin(actor)) return undefined;
    if (actor.permissions.includes('communications.manage_team')) {
      const members = await this.db.calendarTeamMembership.findMany({
        where: { managerId: actor.id },
        select: { memberId: true },
      });
      return [actor.id, ...members.map((m) => m.memberId)];
    }
    return [actor.id];
  }
  private async scopeWhere(actor: Actor): Promise<Prisma.CommunicationThreadWhereInput> {
    const ids = await this.scopedUserIds(actor);
    return ids ? { assignedUserId: { in: ids } } : {};
  }
  async list(actor: Actor, query: any) {
    const page = Math.max(1, Number(query.page ?? 1)),
      pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 25)));
    const scope = await this.scopeWhere(actor);
    const where: Prisma.CommunicationThreadWhereInput = {
      ...scope,
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.mode ? { handlingMode: query.mode } : {}),
      ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
      ...(query.search
        ? {
            OR: [
              { contactIdentity: { contains: query.search, mode: 'insensitive' } },
              { contactDisplayName: { contains: query.search, mode: 'insensitive' } },
              { subject: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.communicationThread.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          assignedUser: { select: { id: true, name: true } },
          prospect: { select: { id: true, name: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { bodyText: true, status: true, direction: true, createdAt: true },
          },
          consent: true,
        },
      }),
      this.db.communicationThread.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }
  async get(actor: Actor, id: string) {
    const thread = await this.db.communicationThread.findFirst({
      where: { id, ...(await this.scopeWhere(actor)) },
      include: {
        assignedUser: { select: { id: true, name: true } },
        prospect: { select: { id: true, name: true, email: true, phone: true } },
        company: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
        consent: true,
        assignments: {
          orderBy: { createdAt: 'desc' },
          include: { assignee: { select: { id: true, name: true } } },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { attachments: true, deliveryEvents: { orderBy: { occurredAt: 'asc' } } },
        },
      },
    });
    if (!thread) throw new NotFoundException('Comunicación no encontrada o fuera de su ámbito');
    return thread;
  }
  async send(actor: Actor, threadId: string, input: any, ctx: AuditContext) {
    const thread = await this.get(actor, threadId);
    const messageClassification =
      input.messageClassification ?? (thread.channel === 'EMAIL' ? 'RELATIONSHIP' : undefined);
    if (thread.status === 'CLOSED' || thread.status === 'BLOCKED')
      throw new CommunicationError(
        'COMMUNICATION_FORBIDDEN',
        'El hilo no admite nuevos mensajes',
        409,
      );
    if (
      thread.consent?.commercialStatus === 'OPTED_OUT' ||
      thread.consent?.commercialStatus === 'SUPPRESSED'
    )
      throw new CommunicationError(
        'CONTACT_SUPPRESSED',
        'El contacto solicitó no recibir comunicaciones',
        409,
      );
    if (
      ['COMMERCIAL', 'MARKETING'].includes(messageClassification) &&
      thread.consent?.commercialStatus !== 'OPTED_IN'
    )
      throw new CommunicationError(
        'COMMUNICATION_CONSENT_REQUIRED',
        'La comunicación comercial requiere consentimiento vigente',
        409,
      );
    if (input.generatedByHenry && ['PAUSED', 'CLOSED'].includes(thread.handlingMode))
      throw new CommunicationError(
        'COMMUNICATION_FORBIDDEN',
        'Henry no puede enviar en un hilo pausado o cerrado',
        409,
      );
    const config =
      thread.channel === 'WHATSAPP' ? this.config.status().whatsapp : this.config.status().email;
    if (!config.configured)
      throw new CommunicationError(
        'CHANNEL_NOT_CONFIGURED',
        `El canal ${thread.channel} no está configurado`,
        503,
      );
    if (thread.channel === 'WHATSAPP' && !input.templateName) {
      const lastInbound = await this.db.communicationMessage.findFirst({
        where: { threadId, direction: 'INBOUND' },
        orderBy: { providerCreatedAt: 'desc' },
        select: { providerCreatedAt: true, createdAt: true },
      });
      const openedAt = lastInbound?.providerCreatedAt ?? lastInbound?.createdAt;
      if (!openedAt || Date.now() - openedAt.getTime() > 24 * 60 * 60 * 1000)
        throw new CommunicationError(
          'WHATSAPP_TEMPLATE_REQUIRED',
          'Fuera de la ventana de 24 horas se requiere una plantilla aprobada',
          409,
        );
    }
    if (input.templateName) {
      const template = await this.db.whatsAppTemplate.findUnique({
        where: {
          name_language: { name: input.templateName, language: input.templateLanguage ?? 'es' },
        },
      });
      if (!template || template.status !== 'APPROVED')
        throw new CommunicationError(
          'WHATSAPP_TEMPLATE_UNAVAILABLE',
          'La plantilla no está aprobada',
          409,
        );
    }
    const commercialContext = await this.resolvePaligContext(thread);
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const message = await this.db.communicationMessage.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        threadId,
        idempotencyKey,
        direction: 'OUTBOUND',
        senderType: input.generatedByHenry ? 'HENRY' : 'USER',
        senderIdentity: actor.id,
        recipientIdentity: thread.contactIdentity,
        bodyText: input.text,
        bodyHtml: input.html,
        contentType: input.templateName ? 'TEMPLATE' : input.html ? 'HTML' : 'TEXT',
        status: 'QUEUED',
        createdById: actor.id,
        generatedByHenry: Boolean(input.generatedByHenry),
        metadata: {
          ...(input.templateName
            ? {
                templateName: input.templateName,
                templateLanguage: input.templateLanguage ?? 'es',
                templateParameters: input.templateParameters ?? [],
              }
            : {}),
          ...(input.subject ? { subject: input.subject } : {}),
          ...(messageClassification
            ? { messageClassification }
            : {}),
          ...(input.templateMetadata ?? {}),
          commercialContext,
        },
      },
    });
    await this.queue.enqueueSend(message.id, idempotencyKey);
    await this.audit.record(
      'COMMUNICATION_OUTBOUND_QUEUED',
      'CommunicationMessage',
      message.id,
      ctx,
      { threadId, channel: thread.channel, generatedByHenry: message.generatedByHenry },
    );
    return message;
  }

  private async resolvePaligContext(thread: {
    opportunityId?: string | null;
  }): Promise<Record<string, string | null> | null> {
    if (!thread.opportunityId) return null;
    const opportunity = await this.db.opportunity.findUnique({
      where: { id: thread.opportunityId },
      select: {
        customerNeedId: true,
        authorizedSolutionId: true,
        authorizedProductId: true,
        customerNeed: { select: { status: true } },
        authorizedSolution: { select: { status: true, productId: true } },
        authorizedProduct: { select: { status: true, carrier: true } },
      },
    });
    if (!opportunity)
      throw new CommunicationError('PALIG_CONTEXT_INVALID', 'Contexto comercial inválido', 409);
    let mappingStatus: string | null = null;
    if (opportunity.customerNeedId && opportunity.authorizedSolutionId) {
      const mapping = await this.db.needSolutionMapping.findUnique({
        where: {
          customerNeedId_solutionId: {
            customerNeedId: opportunity.customerNeedId,
            solutionId: opportunity.authorizedSolutionId,
          },
        },
        select: { status: true },
      });
      mappingStatus = mapping?.status ?? null;
    }
    const validationError = validatePaligMessagingContext({
      customerNeedId: opportunity.customerNeedId,
      customerNeedStatus: opportunity.customerNeed?.status ?? null,
      authorizedSolutionId: opportunity.authorizedSolutionId,
      authorizedSolutionStatus: opportunity.authorizedSolution?.status ?? null,
      solutionProductId: opportunity.authorizedSolution?.productId ?? null,
      authorizedProductId: opportunity.authorizedProductId,
      authorizedProductStatus: opportunity.authorizedProduct?.status ?? null,
      authorizedProductCarrier: opportunity.authorizedProduct?.carrier ?? null,
      mappingStatus,
    });
    if (validationError)
      throw new CommunicationError(validationError, 'Contexto comercial PALIG no autorizado', 409);
    return {
      customerNeedId: opportunity.customerNeedId,
      authorizedSolutionId: opportunity.authorizedSolutionId,
      authorizedProductId:
        opportunity.authorizedProductId ?? opportunity.authorizedSolution?.productId ?? null,
    };
  }

  async resolveEmailThread(actor: Actor, prospectId: string, ctx: AuditContext) {
    await this.access.authorizeRelations(actor, { prospectId });
    const prospect = await this.db.prospect.findUnique({
      where: { id: prospectId },
      select: { id: true, name: true, normalizedEmail: true },
    });
    if (!prospect?.normalizedEmail) throw new BadRequestException('EMAIL_RECIPIENT_REQUIRED');
    const identity = this.normalizeIdentity('EMAIL', prospect.normalizedEmail);
    const current = await this.db.communicationThread.findFirst({
      where: { channel: 'EMAIL', contactIdentity: identity, prospectId },
      orderBy: { updatedAt: 'desc' },
    });
    if (current) {
      if (current.assignedUserId) await this.access.assertUserScope(actor, current.assignedUserId);
      return current;
    }
    const thread = await this.db.communicationThread.create({
      data: {
        channel: 'EMAIL',
        provider: 'RESEND',
        contactIdentity: identity,
        contactDisplayName: prospect.name,
        prospectId,
        assignedUserId: actor.id,
        handlingMode: 'HUMAN',
      },
    });
    await this.audit.record(
      'COMMUNICATION_EMAIL_THREAD_CREATED',
      'CommunicationThread',
      thread.id,
      ctx,
      {
        prospectId,
      },
    );
    return thread;
  }
  async assign(actor: Actor, threadId: string, assigneeId: string, ctx: AuditContext) {
    await this.get(actor, threadId);
    await this.access.assertUserScope(actor, assigneeId);
    const user = await this.db.user.findFirst({
      where: { id: assigneeId, isActive: true },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('Responsable inválido');
    const result = await this.db.$transaction(async (tx) => {
      await tx.communicationAssignment.updateMany({
        where: { threadId, endedAt: null },
        data: { endedAt: new Date() },
      });
      const assignment = await tx.communicationAssignment.create({
        data: { threadId, assigneeId, assignedById: actor.id },
      });
      await tx.communicationThread.update({
        where: { id: threadId },
        data: { assignedUserId: assigneeId },
      });
      return assignment;
    });
    await this.audit.record('COMMUNICATION_ASSIGNED', 'CommunicationThread', threadId, ctx, {
      assigneeId,
    });
    return result;
  }
  async setMode(
    actor: Actor,
    threadId: string,
    mode: 'HENRY' | 'HUMAN' | 'PAUSED',
    ctx: AuditContext,
  ) {
    const thread = await this.get(actor, threadId);
    if (!actor.permissions.includes('communications.takeover'))
      throw new ForbiddenException('Permiso de transferencia requerido');
    const updated = await this.db.communicationThread.update({
      where: { id: thread.id },
      data: { handlingMode: mode },
    });
    await this.audit.record(
      mode === 'HUMAN' ? 'COMMUNICATION_HUMAN_TAKEOVER' : 'COMMUNICATION_MODE_CHANGED',
      'CommunicationThread',
      threadId,
      ctx,
      { previousMode: thread.handlingMode, mode },
    );
    if (mode === 'HUMAN')
      await this.eventBus?.publish({
        eventId: `communication:takeover:${threadId}:${updated.updatedAt.toISOString()}`,
        type: 'COMMUNICATION_HUMAN_ESCALATION',
        entityType: 'CommunicationThread',
        entityId: threadId,
        actorUserId: actor.id,
        payload: { threadId, previousMode: thread.handlingMode, mode },
      });
    return updated;
  }
  async linkCrm(actor: Actor, threadId: string, relations: Relations, ctx: AuditContext) {
    await this.get(actor, threadId);
    await this.access.authorizeRelations(actor, relations);
    const updated = await this.db.communicationThread.update({
      where: { id: threadId },
      data: relations,
    });
    await this.audit.record(
      'COMMUNICATION_CRM_LINKED',
      'CommunicationThread',
      threadId,
      ctx,
      relations,
    );
    return updated;
  }
  async close(actor: Actor, threadId: string, ctx: AuditContext) {
    await this.get(actor, threadId);
    const updated = await this.db.communicationThread.update({
      where: { id: threadId },
      data: { status: 'CLOSED', handlingMode: 'CLOSED', closedAt: new Date() },
    });
    await this.audit.record('COMMUNICATION_CLOSED', 'CommunicationThread', threadId, ctx);
    await this.eventBus?.publish({
      eventId: `communication:closed:${threadId}:${updated.updatedAt.toISOString()}`,
      type: 'COMMUNICATION_THREAD_CLOSED',
      entityType: 'CommunicationThread',
      entityId: threadId,
      actorUserId: actor.id,
      payload: { threadId },
    });
    return updated;
  }
  async suppressByInstruction(threadId: string, text: string, source: string) {
    if (!OPT_OUT.test(text)) return false;
    await this.db.$transaction([
      this.db.communicationConsent.upsert({
        where: { threadId },
        update: {
          commercialStatus: 'OPTED_OUT',
          optedOutAt: new Date(),
          source,
          evidence: { rule: 'EXPLICIT_OPT_OUT' },
        },
        create: {
          threadId,
          commercialStatus: 'OPTED_OUT',
          serviceStatus: 'UNKNOWN',
          optedOutAt: new Date(),
          source,
          evidence: { rule: 'EXPLICIT_OPT_OUT' },
        },
      }),
      this.db.communicationThread.update({
        where: { id: threadId },
        data: { handlingMode: 'PAUSED' },
      }),
    ]);
    await this.eventBus?.publish({
      eventId: `communication:optout:${threadId}`,
      type: 'COMMUNICATION_OPT_OUT',
      entityType: 'CommunicationThread',
      entityId: threadId,
      payload: { threadId, source },
      occurredAt: new Date(),
    });
    return true;
  }
  normalizeIdentity(channel: 'WHATSAPP' | 'EMAIL', value: string) {
    const normalized =
      channel === 'EMAIL' ? normalizeEmailIdentity(value) : value.trim().replace(/[\s()-]/g, '');
    if (!normalized || (channel === 'WHATSAPP' && !E164.test(normalized)))
      throw new BadRequestException(
        channel === 'EMAIL' ? 'Correo inválido' : 'Teléfono debe estar en formato E.164',
      );
    return normalized;
  }
  async receiveInbound(input: {
    channel: 'WHATSAPP' | 'EMAIL';
    provider: 'META' | 'RESEND';
    providerMessageId: string;
    from: string;
    to: string;
    text: string;
    subject?: string;
    providerCreatedAt?: Date;
    contactName?: string;
  }) {
    const identity = this.normalizeIdentity(input.channel, input.from);
    const existingMessage = await this.db.communicationMessage.findUnique({
      where: { providerMessageId: input.providerMessageId },
    });
    if (existingMessage) return existingMessage;
    const deterministicProspect = await this.db.prospect.findFirst({
      where:
        input.channel === 'EMAIL' ? { normalizedEmail: identity } : { normalizedPhone: identity },
      select: { id: true },
    });
    const thread = await this.db.communicationThread.upsert({
      where: {
        provider_providerThreadId: { provider: input.provider, providerThreadId: identity },
      },
      update: {
        lastMessageAt: input.providerCreatedAt ?? new Date(),
        unreadCount: { increment: 1 },
        contactDisplayName: input.contactName ?? undefined,
      },
      create: {
        channel: input.channel,
        provider: input.provider,
        providerThreadId: identity,
        contactIdentity: identity,
        contactDisplayName: input.contactName,
        subject: input.subject,
        handlingMode: 'HUMAN',
        prospectId: deterministicProspect?.id,
        unreadCount: 1,
        lastMessageAt: input.providerCreatedAt ?? new Date(),
      },
    });
    const message = await this.db.communicationMessage.create({
      data: {
        threadId: thread.id,
        providerMessageId: input.providerMessageId,
        idempotencyKey: `inbound:${input.provider}:${input.providerMessageId}`,
        direction: 'INBOUND',
        senderType: 'CONTACT',
        senderIdentity: identity,
        recipientIdentity: input.to,
        bodyText: input.text,
        contentType: 'TEXT',
        status: 'RECEIVED',
        providerCreatedAt: input.providerCreatedAt,
      },
    });
    await this.suppressByInstruction(thread.id, input.text, input.channel);
    await this.queue.enqueueInbound(message.id);
    await this.eventBus?.publish({
      eventId: `communication:inbound:${input.providerMessageId}`,
      type: 'COMMUNICATION_INBOUND',
      entityType: 'CommunicationThread',
      entityId: thread.id,
      payload: {
        threadId: thread.id,
        messageId: message.id,
        prospectId: thread.prospectId,
        channel: thread.channel,
      },
      occurredAt: input.providerCreatedAt ?? new Date(),
    });
    return message;
  }
  providerEventId(provider: string, value: unknown) {
    return createHash('sha256')
      .update(`${provider}:${JSON.stringify(value)}`)
      .digest('hex');
  }
  async registerWebhook(
    provider: 'META' | 'RESEND',
    providerEventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    try {
      await this.db.communicationWebhookEvent.create({
        data: {
          provider,
          providerEventId,
          eventType,
          status: 'PROCESSED',
          payload: payload as Prisma.InputJsonValue,
          attempts: 1,
          processedAt: new Date(),
        },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }
  async recordDelivery(
    providerMessageId: string,
    providerEventId: string,
    status: 'SENT' | 'DELIVERED' | 'READ' | 'BOUNCED' | 'COMPLAINED' | 'FAILED',
    occurredAt: Date,
    errorCode?: string,
    metadata?: Record<string, unknown>,
  ) {
    const message = await this.db.communicationMessage.findUnique({ where: { providerMessageId } });
    if (!message) return null;
    const updated = await this.db.$transaction(async (tx) => {
      await tx.messageDeliveryEvent.upsert({
        where: { providerEventId },
        update: {},
        create: {
          messageId: message.id,
          providerEventId,
          status,
          occurredAt,
          errorCode,
          metadata: metadata as Prisma.InputJsonValue | undefined,
        },
      });
      const current = message.status;
      const mayAdvance =
        status === 'COMPLAINED' ||
        (status === 'BOUNCED' && current !== 'COMPLAINED') ||
        (!DELIVERY_TERMINAL.has(current) &&
          !(
            (status === 'SENT' && ['DELIVERED', 'READ', 'FAILED'].includes(current)) ||
            (status === 'FAILED' && ['DELIVERED', 'READ'].includes(current)) ||
            (status === 'DELIVERED' && current === 'READ')
          ));
      if (!mayAdvance) return message;
      if (status === 'BOUNCED' || status === 'COMPLAINED') {
        await tx.communicationConsent.upsert({
          where: { threadId: message.threadId },
          update: {
            commercialStatus: 'SUPPRESSED',
            source: `RESEND_${status}`,
            evidence: { providerEventId, status },
          },
          create: {
            threadId: message.threadId,
            commercialStatus: 'SUPPRESSED',
            serviceStatus: 'UNKNOWN',
            source: `RESEND_${status}`,
            evidence: { providerEventId, status },
          },
        });
        await tx.communicationThread.update({
          where: { id: message.threadId },
          data: { status: 'BLOCKED', handlingMode: 'PAUSED' },
        });
      }
      return tx.communicationMessage.update({
        where: { id: message.id },
        data: {
          status,
          ...(status === 'SENT' ? { sentAt: occurredAt } : {}),
          ...(status === 'DELIVERED' ? { deliveredAt: occurredAt } : {}),
          ...(status === 'READ' ? { readAt: occurredAt } : {}),
          ...(['FAILED', 'BOUNCED', 'COMPLAINED'].includes(status) ? { errorCode } : {}),
        },
      });
    });
    await this.audit.record(
      `COMMUNICATION_EMAIL_${status}`,
      'CommunicationMessage',
      message.id,
      {},
      { providerEventId, status, errorCode: errorCode ?? null },
    );
    if (['FAILED', 'BOUNCED', 'COMPLAINED'].includes(status))
      await this.eventBus?.publish({
        eventId: `communication:delivery-failed:${providerEventId}`,
        type: 'COMMUNICATION_DELIVERY_FAILED',
        entityType: 'CommunicationThread',
        entityId: message.threadId,
        payload: { threadId: message.threadId, messageId: message.id, errorCode },
        occurredAt,
      });
    return updated;
  }
}
