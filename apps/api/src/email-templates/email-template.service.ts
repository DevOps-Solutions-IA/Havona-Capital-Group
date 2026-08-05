import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@havona/database';
import { CORPORATE_EMAIL_LIBRARY, CORPORATE_EMAIL_LIBRARY_BY_KEY } from '@havona/contracts';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CalendarAccessService, CalendarActor } from '../calendar/calendar-access.service';
import { PrismaService } from '../common/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { variableRegistry } from './email-template.catalog';
import { EmailBlock, EmailTemplateRenderer } from './email-template.renderer';
import { LEGAL_CONTENT_REGISTRY } from './legal-content.registry';

type Actor = CalendarActor;
const isAdmin = (actor: Actor) =>
  Boolean(actor.roles?.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

@Injectable()
export class EmailTemplateService {
  constructor(
    private db: PrismaService,
    private audit: AuditService,
    private access: CalendarAccessService,
    private renderer: EmailTemplateRenderer,
    private knowledge: KnowledgeService,
  ) {}

  catalog() {
    return CORPORATE_EMAIL_LIBRARY.map((definition) => ({ ...definition, body: undefined }));
  }
  variables() {
    return variableRegistry;
  }
  legalRegistry(actor: Actor) {
    this.assert(actor, 'email_templates.read');
    return LEGAL_CONTENT_REGISTRY;
  }
  private assert(actor: Actor, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('EMAIL_TEMPLATE_FORBIDDEN');
  }
  private async readableOwnerIds(actor: Actor) {
    if (isAdmin(actor)) return null;
    if (!actor.permissions.includes('calendar.manage_team')) return [actor.id];
    const members = await this.access.teamMembers(actor);
    return [actor.id, ...members.map((member) => member.id)];
  }
  private async templateForActor(id: string, actor: Actor) {
    const ownerIds = await this.readableOwnerIds(actor);
    const row = await this.db.emailTemplate.findFirst({
      where: {
        id,
        ...(ownerIds ? { OR: [{ isCorporate: true }, { ownerId: { in: ownerIds } }] } : {}),
      },
      include: {
        versions: { orderBy: { version: 'desc' } },
        owner: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('EMAIL_TEMPLATE_NOT_FOUND');
    return row;
  }
  async list(actor: Actor, query: any = {}) {
    this.assert(actor, 'email_templates.read');
    const ownerIds = await this.readableOwnerIds(actor);
    const scope =
      query.scope === 'PERSONAL'
        ? ownerIds
          ? { ownerId: { in: ownerIds } }
          : { isCorporate: false }
        : query.scope === 'CORPORATE'
          ? { isCorporate: true }
          : ownerIds
            ? { OR: [{ isCorporate: true }, { ownerId: { in: ownerIds } }] }
            : {};
    return this.db.emailTemplate.findMany({
      where: {
        AND: [
          scope,
          ...(query.search
            ? [
                {
                  OR: [
                    { name: { contains: query.search, mode: 'insensitive' as const } },
                    { purpose: { contains: query.search, mode: 'insensitive' as const } },
                    { tags: { has: query.search.toLowerCase() } },
                  ],
                },
              ]
            : []),
        ],
        ...(query.category ? { category: query.category } : {}),
        ...(query.locale ? { locale: query.locale } : {}),
      },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }
  get(id: string, actor: Actor) {
    this.assert(actor, 'email_templates.read');
    return this.templateForActor(id, actor);
  }

  async create(input: any, actor: Actor, ctx: AuditContext) {
    const corporate = input.scope === 'CORPORATE';
    this.assert(
      actor,
      corporate ? 'email_templates.manage_corporate' : 'email_templates.create_personal',
    );
    const definition = corporate ? CORPORATE_EMAIL_LIBRARY_BY_KEY.get(input.key) : undefined;
    if (corporate && !definition) throw new BadRequestException('EMAIL_TEMPLATE_KEY_NOT_GOVERNED');
    const ownerId = corporate ? null : actor.id;
    const row = await this.db.emailTemplate.create({
      data: {
        key: input.key,
        name: definition?.name ?? input.name,
        description: definition?.description ?? input.description,
        category: definition?.category ?? input.category,
        purpose: definition?.purpose ?? input.purpose,
        lifecycleStage: definition?.lifecycleStage ?? input.lifecycleStage,
        scope: input.scope,
        ownerId,
        locale: input.locale,
        isCorporate: corporate,
        isDefault: false,
        status: 'DRAFT',
        tags: definition
          ? [definition.category.toLowerCase(), definition.lifecycleStage.toLowerCase()]
          : (input.tags ?? []),
        governance: definition ?? undefined,
        contentOwner: definition?.contentOwner,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await this.audit.record('EMAIL_TEMPLATE_CREATED', 'EmailTemplate', row.id, ctx, {
      scope: row.scope,
      key: row.key,
    });
    return row;
  }

  async createVersion(templateId: string, input: any, actor: Actor, ctx: AuditContext) {
    const template = await this.templateForActor(templateId, actor);
    this.assert(
      actor,
      template.isCorporate ? 'email_templates.manage_corporate' : 'email_templates.edit_personal',
    );
    if (!template.isCorporate && template.ownerId !== actor.id)
      throw new ForbiddenException('EMAIL_TEMPLATE_FORBIDDEN');
    const blocks = input.blocks as EmailBlock[];
    this.renderer.validateBlocks(blocks, template.isCorporate);
    if (
      ['COMMERCIAL', 'MARKETING'].includes(input.messageClassification) &&
      !blocks.some((block) => block.type === 'UNSUBSCRIBE' && block.mode !== 'EDITABLE')
    )
      throw new BadRequestException('EMAIL_TEMPLATE_UNSUBSCRIBE_REQUIRED');
    const variables = this.renderer.variables(input.subject, input.preheader, blocks);
    const definition = CORPORATE_EMAIL_LIBRARY_BY_KEY.get(template.key);
    const requiredVariables = input.requiredVariables ?? definition?.requiredVariables ?? variables;
    const lint = this.renderer.lint({
      subject: input.subject,
      blocks,
      requiredVariables,
      classification: input.messageClassification,
      ctaRequired: Boolean(definition),
    });
    if (!lint.valid)
      throw new BadRequestException({ code: 'EMAIL_TEMPLATE_CONTENT_INVALID', ...lint });
    const latest = template.versions[0]?.version ?? 0;
    const checksum = createHash('sha256')
      .update(
        JSON.stringify({
          subject: input.subject,
          preheader: input.preheader,
          blocks,
          variables,
          classification: input.messageClassification,
        }),
      )
      .digest('hex');
    const version = await this.db.emailTemplateVersion.create({
      data: {
        templateId,
        version: latest + 1,
        locale: template.locale,
        status: 'REVIEW',
        subject: input.subject,
        preheader: input.preheader,
        blocks,
        variableContract: { required: requiredVariables, allowed: variables },
        messageClassification: input.messageClassification,
        subjectAlternatives: input.subjectAlternatives ?? definition?.subjectAlternatives ?? [],
        contentPolicy: definition ?? input.contentPolicy ?? {},
        legalStatus: 'LEGAL_REVIEW_REQUIRED',
        checksum,
        createdById: actor.id,
      },
    });
    await this.db.emailTemplate.update({
      where: { id: templateId },
      data: { status: 'REVIEW', updatedById: actor.id },
    });
    await this.audit.record(
      'EMAIL_TEMPLATE_VERSION_CREATED',
      'EmailTemplateVersion',
      version.id,
      ctx,
      { templateId, version: version.version },
    );
    return version;
  }

  async approve(id: string, actor: Actor, ctx: AuditContext) {
    this.assert(actor, 'email_templates.approve');
    const template = await this.templateForActor(id, actor);
    if (!template.isCorporate)
      throw new BadRequestException('EMAIL_TEMPLATE_CORPORATE_APPROVAL_ONLY');
    const version = template.versions.find((item) => item.status === 'REVIEW');
    if (!version) throw new BadRequestException('EMAIL_TEMPLATE_NOT_READY');
    await this.db.$transaction([
      this.db.emailTemplateVersion.update({
        where: { id: version.id },
        data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
      }),
      this.db.emailTemplate.update({
        where: { id },
        data: { status: 'APPROVED', updatedById: actor.id },
      }),
    ]);
    await this.audit.record('EMAIL_TEMPLATE_APPROVED', 'EmailTemplate', id, ctx, {
      version: version.version,
    });
    return { id, version: version.version, status: 'APPROVED' };
  }

  async activate(id: string, actor: Actor, ctx: AuditContext) {
    this.assert(actor, 'email_templates.manage_corporate');
    const template = await this.templateForActor(id, actor);
    const version = template.versions.find((item) => item.status === 'APPROVED');
    if (!template.isCorporate || !version)
      throw new BadRequestException('EMAIL_TEMPLATE_NOT_APPROVED');
    if (version.legalStatus !== 'LEGAL_APPROVED')
      throw new BadRequestException('EMAIL_TEMPLATE_LEGAL_REVIEW_REQUIRED');
    await this.db.$transaction([
      this.db.emailTemplateVersion.updateMany({
        where: { templateId: id, status: 'ACTIVE' },
        data: { status: 'INACTIVE' },
      }),
      this.db.emailTemplateVersion.update({
        where: { id: version.id },
        data: { status: 'ACTIVE', activatedAt: new Date() },
      }),
      this.db.emailTemplate.update({
        where: { id },
        data: { status: 'ACTIVE', activeVersionId: version.id, updatedById: actor.id },
      }),
      this.db.emailTemplateVariant.updateMany({
        where: { parentTemplateId: id, parentVersionId: { not: version.id } },
        data: { updateAvailable: true },
      }),
    ]);
    await this.audit.record('EMAIL_TEMPLATE_ACTIVATED', 'EmailTemplate', id, ctx, {
      version: version.version,
    });
    return { id, version: version.version, status: 'ACTIVE' };
  }

  async recordLegalReview(
    versionId: string,
    input: { reference: string; nextReviewAt?: string },
    actor: Actor,
    ctx: AuditContext,
  ) {
    this.assert(actor, 'email_templates.legal_approve');
    const version = await this.db.emailTemplateVersion.findUnique({
      where: { id: versionId },
      include: { template: true },
    });
    if (!version?.template.isCorporate)
      throw new NotFoundException('EMAIL_TEMPLATE_VERSION_NOT_FOUND');
    const reviewedAt = new Date();
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.emailTemplateVersion.update({
        where: { id: versionId },
        data: {
          legalStatus: 'LEGAL_APPROVED',
          contentPolicy: {
            ...((version.contentPolicy as Record<string, unknown> | null) ?? {}),
            legalReviewReference: input.reference,
            legalReviewedById: actor.id,
            legalReviewedAt: reviewedAt.toISOString(),
          },
        },
      });
      await tx.emailTemplate.update({
        where: { id: version.templateId },
        data: {
          lastReviewedAt: reviewedAt,
          nextReviewAt: input.nextReviewAt ? new Date(input.nextReviewAt) : null,
          updatedById: actor.id,
        },
      });
      return updated;
    });
    await this.audit.record(
      'EMAIL_TEMPLATE_LEGAL_REVIEW_RECORDED',
      'EmailTemplateVersion',
      versionId,
      ctx,
      {
        reference: input.reference,
        nextReviewAt: input.nextReviewAt ?? null,
      },
    );
    return { id: row.id, legalStatus: row.legalStatus };
  }

  async recommend(
    actor: Actor,
    input: {
      lifecycleStage?: string;
      triggerEvent?: string;
      evidence?: string[];
      automation?: boolean;
    },
  ) {
    this.assert(actor, 'email_templates.read');
    const evidence = new Set(input.evidence ?? []);
    const candidates = CORPORATE_EMAIL_LIBRARY.filter((definition) => {
      if (input.lifecycleStage && definition.lifecycleStage !== input.lifecycleStage) return false;
      if (input.triggerEvent && !definition.triggerEvents.includes(input.triggerEvent))
        return false;
      if (!definition.allowedRoles.some((role) => actor.roles?.includes(role))) return false;
      if (input.automation && !definition.automationEligible) return false;
      return definition.requiredEvidence.every((requirement) => evidence.has(requirement));
    });
    const active = await this.db.emailTemplate.findMany({
      where: {
        key: { in: candidates.map((candidate) => candidate.key) },
        locale: 'es-CO',
        isCorporate: true,
        status: 'ACTIVE',
      },
      include: {
        versions: { where: { status: 'ACTIVE', legalStatus: 'LEGAL_APPROVED' }, take: 1 },
      },
    });
    return active
      .filter((template) => template.versions.length)
      .map((template) => ({
        templateId: template.id,
        key: template.key,
        name: template.name,
        purpose: template.purpose,
        policy: CORPORATE_EMAIL_LIBRARY_BY_KEY.get(template.key),
        evidenceUsed: input.evidence ?? [],
      }));
  }

  async assertAutomationDispatch(
    templateKey: string,
    input: { evidence?: string[]; approvalMode?: string },
  ) {
    const definition = CORPORATE_EMAIL_LIBRARY_BY_KEY.get(templateKey);
    if (!definition) throw new BadRequestException('EMAIL_TEMPLATE_KEY_NOT_GOVERNED');
    if (!definition.automationEligible)
      throw new BadRequestException('EMAIL_TEMPLATE_AUTOMATION_NOT_ALLOWED');
    if (definition.automationPolicy === 'AUTOMATION_WITH_APPROVAL' && input.approvalMode === 'AUTO')
      throw new BadRequestException('EMAIL_TEMPLATE_AUTOMATION_APPROVAL_REQUIRED');
    if (
      definition.automationPolicy !== 'AUTOMATION_ALLOWED' &&
      definition.automationPolicy !== 'AUTOMATION_WITH_APPROVAL'
    )
      throw new BadRequestException('EMAIL_TEMPLATE_AUTOMATION_NOT_ALLOWED');
    const evidence = new Set(input.evidence ?? []);
    const missingEvidence = definition.requiredEvidence.filter((item) => !evidence.has(item));
    if (missingEvidence.length)
      throw new BadRequestException({
        code: 'EMAIL_TEMPLATE_EVIDENCE_REQUIRED',
        missingEvidence,
      });
    const template = await this.db.emailTemplate.findFirst({
      where: { key: templateKey, isCorporate: true, status: 'ACTIVE' },
      include: {
        versions: {
          where: { status: 'ACTIVE', legalStatus: 'LEGAL_APPROVED' },
          take: 1,
        },
      },
    });
    if (!template?.versions.length) throw new BadRequestException('EMAIL_TEMPLATE_NOT_OPERATIONAL');
    return { template, version: template.versions[0], definition };
  }

  async reviewDue(actor: Actor) {
    this.assert(actor, 'email_templates.manage_corporate');
    return this.db.emailTemplate.findMany({
      where: { isCorporate: true, nextReviewAt: { lte: new Date() }, status: { not: 'ARCHIVED' } },
      select: { id: true, key: true, name: true, nextReviewAt: true, status: true },
      orderBy: { nextReviewAt: 'asc' },
    });
  }

  async createVariant(templateId: string, input: any, actor: Actor, ctx: AuditContext) {
    this.assert(actor, 'email_templates.create_personal');
    const template = await this.templateForActor(templateId, actor);
    if (!template.isCorporate || template.status !== 'ACTIVE' || !template.activeVersionId)
      throw new BadRequestException('EMAIL_TEMPLATE_MASTER_NOT_ACTIVE');
    const version = template.versions.find((item) => item.id === template.activeVersionId)!;
    const blocks = version.blocks as unknown as EmailBlock[];
    const locked = new Set(
      blocks.filter((block) => !this.renderer.isEditable(block)).map((block) => block.id),
    );
    if (Object.keys(input.overrides ?? {}).some((key) => locked.has(key))) {
      await this.audit.record(
        'EMAIL_TEMPLATE_PROTECTED_MODIFICATION_REJECTED',
        'EmailTemplate',
        templateId,
        ctx,
        { blockIds: Object.keys(input.overrides).filter((key) => locked.has(key)) },
      );
      throw new ForbiddenException('EMAIL_TEMPLATE_BLOCK_LOCKED');
    }
    const row = await this.db.emailTemplateVariant.create({
      data: {
        parentTemplateId: templateId,
        parentVersionId: version.id,
        ownerId: actor.id,
        name: input.name,
        overrides: input.overrides ?? {},
      },
    });
    await this.audit.record('EMAIL_TEMPLATE_VARIANT_CREATED', 'EmailTemplateVariant', row.id, ctx, {
      templateId,
    });
    return row;
  }

  async createDraft(input: any, actor: Actor, ctx: AuditContext) {
    this.assert(actor, 'email_templates.preview');
    await this.access.authorizeRelations(actor, {
      prospectId: input.recipientProspectId,
      companyId: input.companyId,
      opportunityId: input.opportunityId,
    });
    if (input.communicationThreadId) {
      const thread = await this.db.communicationThread.findUnique({
        where: { id: input.communicationThreadId },
        select: { channel: true, prospectId: true, assignedUserId: true },
      });
      if (!thread || thread.channel !== 'EMAIL')
        throw new BadRequestException('EMAIL_THREAD_INVALID');
      if (thread.assignedUserId) await this.access.assertUserScope(actor, thread.assignedUserId);
      else if (!isAdmin(actor)) throw new ForbiddenException('EMAIL_THREAD_FORBIDDEN');
      if (thread.prospectId && thread.prospectId !== input.recipientProspectId)
        throw new BadRequestException('EMAIL_THREAD_RECIPIENT_MISMATCH');
    }
    if (input.ownerId && input.ownerId !== actor.id)
      await this.access.assertUserScope(actor, input.ownerId);
    const template = input.templateId ? await this.templateForActor(input.templateId, actor) : null;
    let versionId = input.templateVersionId ?? template?.activeVersionId;
    if (template && !versionId)
      throw new BadRequestException('EMAIL_TEMPLATE_ACTIVE_VERSION_REQUIRED');
    if (versionId && !template?.versions.some((version) => version.id === versionId))
      throw new BadRequestException('EMAIL_TEMPLATE_VERSION_INVALID');
    const variant = input.variantId
      ? await this.db.emailTemplateVariant.findFirst({
          where: { id: input.variantId, ownerId: actor.id, parentTemplateId: input.templateId },
        })
      : null;
    if (input.variantId && !variant)
      throw new ForbiddenException('EMAIL_TEMPLATE_VARIANT_FORBIDDEN');
    await this.validateAttachments(input.attachmentReferences ?? [], actor);
    const row = await this.db.emailTemplateDraft.create({
      data: {
        ownerId: input.ownerId ?? actor.id,
        createdById: actor.id,
        templateId: input.templateId,
        templateVersionId: versionId,
        variantId: input.variantId,
        recipientProspectId: input.recipientProspectId,
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        communicationThreadId: input.communicationThreadId,
        calendarEventId: input.calendarEventId,
        meetingId: input.meetingId,
        subjectOverride: input.subjectOverride,
        editableBlockOverrides: input.editableBlockOverrides,
        attachmentReferences: input.attachmentReferences,
        generatedByHenry: Boolean(input.generatedByHenry),
        status: 'DRAFT',
      },
    });
    await this.audit.record('EMAIL_DRAFT_CREATED', 'EmailTemplateDraft', row.id, ctx, {
      templateId: input.templateId ?? null,
      generatedByHenry: row.generatedByHenry,
    });
    return row;
  }

  private async validateAttachments(references: Array<{ type: string; id: string }>, actor: Actor) {
    for (const reference of references) {
      if (reference.type === 'KNOWLEDGE_DOCUMENT') {
        const document = await this.knowledge.getDocument(reference.id, {
          id: actor.id,
          roles: actor.roles ?? [],
          permissions: actor.permissions,
        });
        if (document.status !== 'PUBLISHED')
          throw new BadRequestException('EMAIL_ATTACHMENT_KNOWLEDGE_NOT_PUBLISHED');
      } else {
        const attachment = await this.db.communicationAttachment.findUnique({
          where: { id: reference.id },
          include: { message: { include: { thread: true } } },
        });
        if (!attachment) throw new NotFoundException('EMAIL_ATTACHMENT_NOT_FOUND');
        const assigned = attachment.message.thread.assignedUserId;
        if (assigned) await this.access.assertUserScope(actor, assigned);
        else if (!isAdmin(actor)) throw new ForbiddenException('EMAIL_ATTACHMENT_FORBIDDEN');
        if (attachment.expiresAt && attachment.expiresAt <= new Date())
          throw new BadRequestException('EMAIL_ATTACHMENT_EXPIRED');
      }
    }
  }

  private async draft(id: string, actor: Actor) {
    const ownerIds = await this.readableOwnerIds(actor);
    const scope = ownerIds ? { ownerId: { in: ownerIds } } : {};
    const row = await this.db.emailTemplateDraft.findFirst({
      where: { id, ...scope },
      include: { template: true, templateVersion: true, variant: true },
    });
    if (!row) throw new NotFoundException('EMAIL_DRAFT_NOT_FOUND');
    return row;
  }
  async listDrafts(actor: Actor) {
    this.assert(actor, 'email_templates.preview');
    const ownerIds = await this.readableOwnerIds(actor);
    return this.db.emailTemplateDraft.findMany({
      where: ownerIds ? { ownerId: { in: ownerIds } } : {},
      include: {
        template: { select: { id: true, name: true, key: true } },
        recipientProspect: { select: { id: true, name: true, normalizedEmail: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }
  async updateDraft(id: string, input: any, actor: Actor) {
    const draft = await this.draft(id, actor);
    if (draft.ownerId !== actor.id) throw new ForbiddenException('EMAIL_DRAFT_FORBIDDEN');
    if (['SENT', 'CANCELLED'].includes(draft.status))
      throw new BadRequestException('EMAIL_DRAFT_IMMUTABLE');
    if (input.attachmentReferences)
      await this.validateAttachments(input.attachmentReferences, actor);
    return this.db.emailTemplateDraft.update({
      where: { id },
      data: {
        subjectOverride: input.subjectOverride,
        editableBlockOverrides: input.editableBlockOverrides,
        attachmentReferences: input.attachmentReferences,
        status: 'DRAFT',
        renderedSnapshot: Prisma.JsonNull,
      },
    });
  }

  async preview(id: string, actor: Actor, ctx?: AuditContext) {
    this.assert(actor, 'email_templates.preview');
    const draft = await this.draft(id, actor);
    if (!draft.templateVersion || !draft.template)
      throw new BadRequestException('EMAIL_DRAFT_TEMPLATE_REQUIRED');
    const version = draft.templateVersion;
    const base = version.blocks as unknown as EmailBlock[];
    const variantOverrides = (draft.variant?.overrides ?? {}) as Record<string, string>;
    const draftOverrides = (draft.editableBlockOverrides ?? {}) as Record<string, string>;
    const blocks = base.map((block) => ({
      ...block,
      content: this.renderer.isEditable(block)
        ? (draftOverrides[block.id] ?? variantOverrides[block.id] ?? block.content)
        : block.content,
    }));
    this.renderer.validateBlocks(blocks, draft.template.isCorporate);
    const variables = await this.resolveVariables(draft, actor);
    const contract = version.variableContract as { required?: string[] };
    const rendered = this.renderer.render({
      subject: draft.subjectOverride ?? version.subject,
      preheader: version.preheader,
      blocks,
      variables,
      required: contract.required ?? [],
    });
    const status = rendered.missingVariables.length ? 'DRAFT' : 'READY';
    const snapshot = {
      ...rendered,
      templateId: draft.templateId,
      templateVersionId: draft.templateVersionId,
      templateVersion: version.version,
      variantId: draft.variantId,
      draftId: draft.id,
      messageClassification: version.messageClassification,
      locale: version.locale,
      variablesResolved: Object.fromEntries(
        Object.entries(variables).filter(([, value]) => value != null),
      ),
      attachmentReferences: draft.attachmentReferences,
      calendarEventId: draft.calendarEventId,
      meetingId: draft.meetingId,
      renderedAt: new Date().toISOString(),
    };
    await this.db.emailTemplateDraft.update({
      where: { id },
      data: { status, renderedSnapshot: snapshot },
    });
    if (ctx)
      await this.audit.record('EMAIL_DRAFT_PREVIEWED', 'EmailTemplateDraft', id, ctx, {
        missingVariableCount: rendered.missingVariables.length,
      });
    return snapshot;
  }

  private async resolveVariables(draft: any, actor: Actor) {
    const [client, consultant, company, opportunity, appointment, meeting, product, signature] =
      await Promise.all([
        draft.recipientProspectId
          ? this.db.prospect.findUnique({
              where: { id: draft.recipientProspectId },
              select: { name: true, normalizedEmail: true },
            })
          : null,
        this.db.user.findUnique({
          where: { id: draft.ownerId },
          select: { name: true, email: true },
        }),
        draft.companyId
          ? this.db.company.findUnique({ where: { id: draft.companyId }, select: { name: true } })
          : null,
        draft.opportunityId
          ? this.db.opportunity.findUnique({
              where: { id: draft.opportunityId },
              select: { title: true },
            })
          : null,
        draft.calendarEventId
          ? this.db.calendarEventLink.findUnique({
              where: { id: draft.calendarEventId },
              select: {
                startAt: true,
                timezone: true,
                assignedConsultantId: true,
                createdById: true,
              },
            })
          : null,
        draft.meetingId
          ? this.db.meeting.findUnique({
              where: { id: draft.meetingId },
              select: { id: true, ownerUserId: true, status: true },
            })
          : null,
        this.resolveProduct(draft, actor),
        this.db.emailSignature.findFirst({
          where: { ownerId: draft.ownerId },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        }),
      ]);
    if (!client?.normalizedEmail) throw new BadRequestException('EMAIL_RECIPIENT_REQUIRED');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.normalizedEmail))
      throw new BadRequestException('EMAIL_RECIPIENT_INVALID');
    if (appointment)
      await this.access.assertUserScope(
        actor,
        appointment.assignedConsultantId ?? appointment.createdById,
      );
    if (meeting) await this.access.assertUserScope(actor, meeting.ownerUserId);
    const locale = 'es-CO',
      timezone = appointment?.timezone ?? 'America/Bogota';
    return {
      'client.firstName': firstName(client.name),
      'client.fullName': client.name,
      'client.email': client.normalizedEmail,
      'consultant.firstName': consultant ? firstName(consultant.name) : null,
      'consultant.fullName': consultant?.name,
      'consultant.email': consultant?.email,
      'consultant.phone': signature?.phone,
      'company.name': company?.name,
      'opportunity.name': opportunity?.title,
      'appointment.date': appointment?.startAt.toLocaleDateString(locale, { timeZone: timezone }),
      'appointment.time': appointment?.startAt.toLocaleTimeString(locale, {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
      }),
      'appointment.timezone': appointment?.timezone,
      'meeting.url':
        meeting && meeting.status !== 'CANCELLED'
          ? `${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/meet/${meeting.id}`
          : null,
      'product.name': product,
      'system.companyName': 'HAVONA CAPITAL GROUP',
    };
  }

  private async resolveProduct(draft: any, actor: Actor) {
    const references = Array.isArray(draft.attachmentReferences) ? draft.attachmentReferences : [];
    const reference = references.find((item: any) => item?.type === 'KNOWLEDGE_DOCUMENT');
    if (!reference?.id) return null;
    const document = await this.knowledge.getDocument(reference.id, {
      id: actor.id,
      roles: actor.roles ?? [],
      permissions: actor.permissions,
    });
    return document.status === 'PUBLISHED' ? document.title : null;
  }

  signature(actor: Actor) {
    this.assert(actor, 'email_templates.preview');
    return this.db.emailSignature.findMany({
      where: { ownerId: actor.id },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }
  async saveSignature(input: any, actor: Actor, ctx: AuditContext) {
    this.assert(actor, 'email_templates.preview');
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { name: true, email: true },
    });
    if (input.isDefault)
      await this.db.emailSignature.updateMany({
        where: { ownerId: actor.id },
        data: { isDefault: false },
      });
    const row = await this.db.emailSignature.create({
      data: {
        ownerId: actor.id,
        displayName: user.name,
        email: user.email,
        title: input.title,
        phone: input.phone,
        approvedLinks: input.approvedLinks ?? [],
        isDefault: Boolean(input.isDefault),
      },
    });
    await this.audit.record('EMAIL_SIGNATURE_CREATED', 'EmailSignature', row.id, ctx, {
      isDefault: row.isDefault,
    });
    return row;
  }

  async handoff(id: string, actor: Actor, ctx: AuditContext) {
    const draft = await this.draft(id, actor);
    const snapshot = await this.preview(id, actor);
    if (snapshot.missingVariables.length)
      throw new BadRequestException('EMAIL_DRAFT_MISSING_VARIABLES');
    if (draft.communicationThreadId) {
      const thread = await this.db.communicationThread.findUnique({
        where: { id: draft.communicationThreadId },
        include: { consent: true },
      });
      if (!thread || thread.channel !== 'EMAIL')
        throw new BadRequestException('EMAIL_THREAD_INVALID');
      if (
        thread.consent?.commercialStatus === 'OPTED_OUT' ||
        thread.consent?.commercialStatus === 'SUPPRESSED'
      )
        throw new ForbiddenException('CONTACT_SUPPRESSED');
    }
    const usage = await this.db.emailTemplateUsage.create({
      data: {
        templateId: draft.templateId!,
        templateVersionId: draft.templateVersionId!,
        variantId: draft.variantId,
        draftId: draft.id,
        actorId: actor.id,
        snapshot,
      },
    });
    await this.audit.record(
      'EMAIL_DRAFT_COMMUNICATIONS_HANDOFF_READY',
      'EmailTemplateDraft',
      id,
      ctx,
      { usageId: usage.id, classification: snapshot.messageClassification },
    );
    return {
      usageId: usage.id,
      draftId: id,
      communicationsPayload: {
        recipient: snapshot.variablesResolved['client.email'],
        subject: snapshot.subject,
        html: snapshot.html,
        text: snapshot.text,
        metadata: {
          templateId: draft.templateId,
          templateVersionId: draft.templateVersionId,
          variantId: draft.variantId,
          draftId: id,
          usageId: usage.id,
        },
      },
      providerDispatched: false,
    };
  }
}
