import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@havona/database';
import { AuditContext, AuditService } from '../audit/audit.service';
import { CalendarAccessService } from '../calendar/calendar-access.service';
import { PrismaService } from '../common/prisma.service';
import { CommunicationsService } from '../communications/communications.service';
import { CrmService } from '../crm/crm.service';
import { EmailTemplateService } from '../email-templates/email-template.service';
import { AutomationQueueService } from '../automations/automation-queue.service';
import {
  CadenceActor,
  createCadenceSchema,
  cadenceVersionSchema,
  enrollCadenceSchema,
} from './cadence.types';

const ACTIVE = ['ACTIVE'] as const;
const SEND_STEPS = ['SEND_EMAIL', 'SEND_WHATSAPP_FUTURE'];
const STOP_EVENT: Record<string, string> = {
  COMMUNICATION_INBOUND: 'CUSTOMER_REPLIED',
  COMMUNICATION_OPT_OUT: 'OPT_OUT',
  COMMUNICATION_THREAD_CLOSED: 'THREAD_CLOSED',
  COMMUNICATION_HUMAN_TAKEOVER: 'HUMAN_TAKEOVER',
  COMMUNICATION_HUMAN_ESCALATION: 'HUMAN_TAKEOVER',
  CALENDAR_EVENT_SCHEDULED: 'MEETING_SCHEDULED',
  CALENDAR_MEETING_SCHEDULED: 'MEETING_SCHEDULED',
  MEETING_SCHEDULED: 'MEETING_SCHEDULED',
  OPPORTUNITY_WON: 'OPPORTUNITY_CLOSED',
  OPPORTUNITY_LOST: 'OPPORTUNITY_CLOSED',
  OPPORTUNITY_CLOSED: 'OPPORTUNITY_CLOSED',
  PROSPECT_DISQUALIFIED: 'PROSPECT_DISQUALIFIED',
  DOCUMENT_RECEIVED: 'DOCUMENT_RECEIVED',
  COMMUNICATION_DELIVERY_FAILED: 'PERMANENT_DELIVERY_FAILURE',
};

@Injectable()
export class CadenceService {
  private readonly dbx: any;
  constructor(
    db: PrismaService,
    private audit: AuditService,
    private access: CalendarAccessService,
    private queue: AutomationQueueService,
    private templates: EmailTemplateService,
    private communications: CommunicationsService,
    private crm: CrmService,
  ) {
    this.dbx = db as any;
  }

  private admin(actor: CadenceActor) {
    return actor.permissions.includes('automations.admin');
  }
  private async scopedUsers(actor: CadenceActor) {
    if (this.admin(actor)) return undefined;
    const ids = [actor.id];
    if (actor.permissions.includes('automations.manage_team')) {
      const members = await this.access.teamMembers({
        ...actor,
        permissions: [...actor.permissions, 'calendar.manage_team'],
      });
      ids.push(...members.map((member: { id: string }) => member.id));
    }
    return ids;
  }
  async list(actor: CadenceActor, status?: string) {
    const users = await this.scopedUsers(actor);
    return this.dbx.communicationCadence.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(users ? { OR: [{ ownerScope: 'CORPORATE' }, { createdById: { in: users } }] } : {}),
      },
      include: {
        activeVersion: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        versions: { select: { id: true, version: true, status: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async get(actor: CadenceActor, id: string) {
    const cadence = await this.dbx.communicationCadence.findUnique({
      where: { id },
      include: {
        versions: {
          include: { steps: { orderBy: { stepOrder: 'asc' } } },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!cadence) throw new NotFoundException('CADENCE_NOT_FOUND');
    const users = await this.scopedUsers(actor);
    if (users && cadence.ownerScope !== 'CORPORATE' && !users.includes(cadence.createdById))
      throw new NotFoundException('CADENCE_NOT_FOUND');
    return cadence;
  }
  async create(actor: CadenceActor, input: unknown, ctx: AuditContext) {
    if (!this.admin(actor)) throw new ForbiddenException('CADENCE_FORBIDDEN');
    const data = createCadenceSchema.parse(input);
    this.validateSteps(data.version.steps);
    const row = await this.dbx.communicationCadence.create({
      data: {
        key: data.key,
        name: data.name,
        purpose: data.purpose,
        ownerScope: data.ownerScope,
        createdById: actor.id,
        versions: { create: this.versionData(data.version, 1) },
      },
      include: { versions: { include: { steps: true } } },
    });
    await this.audit.record('CADENCE_CREATED', 'CommunicationCadence', row.id, ctx, {
      key: row.key,
    });
    return row;
  }
  async newVersion(actor: CadenceActor, id: string, input: unknown, ctx: AuditContext) {
    if (!this.admin(actor)) throw new ForbiddenException('CADENCE_FORBIDDEN');
    const data = cadenceVersionSchema.parse(input);
    this.validateSteps(data.steps);
    const cadence = await this.get(actor, id);
    const next = cadence.versions[0].version + 1;
    const row = await this.dbx.cadenceVersion.create({
      data: { cadenceId: id, ...this.versionData(data, next) },
      include: { steps: true },
    });
    await this.audit.record('CADENCE_VERSION_CREATED', 'CadenceVersion', row.id, ctx, {
      cadenceId: id,
      version: next,
    });
    return row;
  }
  private versionData(data: any, version: number) {
    return {
      version,
      allowedRoles: data.allowedRoles,
      channelPolicy: { channels: data.channels },
      enrollmentConditions: data.enrollmentConditions,
      stopConditions: data.stopConditions,
      approvalPolicy: data.approvalPolicy,
      frequencyPolicy: data.frequency,
      sendingWindow: data.sendingWindow,
      maxLifetimeDays: data.maxLifetimeDays,
      steps: {
        create: data.steps.map((step: any, index: number) => ({
          ...step,
          stepOrder: index + 1,
          condition: step.condition ?? Prisma.JsonNull,
        })),
      },
    };
  }
  private validateSteps(steps: any[]) {
    for (const step of steps) {
      if (step.type === 'SEND_EMAIL' && !step.templateKey)
        throw new BadRequestException('CADENCE_TEMPLATE_REQUIRED');
      if (step.type === 'SEND_WHATSAPP_FUTURE')
        throw new BadRequestException('CADENCE_PROVIDER_UNAVAILABLE');
      if (
        SEND_STEPS.includes(step.type) &&
        step.approvalMode === 'AUTO' &&
        !step.definition?.automationApproved
      )
        throw new BadRequestException('CADENCE_APPROVAL_REQUIRED');
    }
  }
  async status(actor: CadenceActor, id: string, status: string, ctx: AuditContext) {
    if (!this.admin(actor)) throw new ForbiddenException('CADENCE_FORBIDDEN');
    const cadence = await this.get(actor, id);
    const latest = cadence.versions[0];
    if (status === 'ACTIVE' && latest.status !== 'APPROVED')
      throw new BadRequestException('CADENCE_VERSION_NOT_APPROVED');
    const row = await this.dbx.$transaction(async (tx: any) => {
      if (status === 'APPROVED')
        await tx.cadenceVersion.update({
          where: { id: latest.id },
          data: { status: 'APPROVED', approvedAt: new Date() },
        });
      if (status === 'ACTIVE')
        await tx.cadenceVersion.update({ where: { id: latest.id }, data: { status: 'ACTIVE' } });
      return tx.communicationCadence.update({
        where: { id },
        data: { status, ...(status === 'ACTIVE' ? { activeVersionId: latest.id } : {}) },
      });
    });
    await this.audit.record(`CADENCE_${status}`, 'CommunicationCadence', id, ctx, {
      version: latest.version,
    });
    return row;
  }
  async eligible(actor: CadenceActor, prospectId: string, opportunityId?: string) {
    await this.access.authorizeRelations(actor as any, { prospectId, opportunityId });
    const rows = await this.list(actor, 'ACTIVE');
    return rows
      .filter(
        (row: any) =>
          row.activeVersion &&
          row.activeVersion.allowedRoles.some((role: string) => actor.roles?.includes(role)),
      )
      .map((row: any) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        purpose: row.purpose,
        version: row.activeVersion.version,
        steps: row.activeVersion.steps.map((s: any) => ({
          type: s.type,
          delayMinutes: s.delayMinutes,
          templateKey: s.templateKey,
        })),
        stopConditions: row.activeVersion.stopConditions,
        approvalPolicy: row.activeVersion.approvalPolicy,
      }));
  }
  async enrollments(actor: CadenceActor, status?: string) {
    const users = await this.scopedUsers(actor);
    return this.dbx.cadenceEnrollment.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(users ? { enrolledById: { in: users } } : {}),
      },
      include: {
        prospect: { select: { id: true, name: true } },
        version: { include: { cadence: { select: { id: true, key: true, name: true } } } },
        steps: {
          where: { status: { in: ['SCHEDULED', 'CLAIMED', 'DISPATCHING'] } },
          include: { step: true },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }
  async enroll(actor: CadenceActor, input: any, ctx: AuditContext) {
    const data = enrollCadenceSchema.parse(input);
    await this.access.authorizeRelations(actor as any, {
      prospectId: data.prospectId,
      opportunityId: data.opportunityId,
    });
    const cadence = await this.dbx.communicationCadence.findFirst({
      where: { id: data.cadenceId, status: 'ACTIVE' },
      include: { activeVersion: { include: { steps: { orderBy: { stepOrder: 'asc' } } } } },
    });
    if (!cadence?.activeVersion) throw new BadRequestException('CADENCE_NOT_ACTIVE');
    if (!cadence.activeVersion.allowedRoles.some((role: string) => actor.roles?.includes(role)))
      throw new ForbiddenException('CADENCE_FORBIDDEN');
    const prospect = await this.dbx.prospect.findUnique({ where: { id: data.prospectId } });
    if (!prospect?.normalizedEmail) throw new BadRequestException('CADENCE_CONTACT_INVALID');
    const thread = data.communicationThreadId
      ? await this.dbx.communicationThread.findFirst({
          where: { id: data.communicationThreadId, prospectId: data.prospectId },
          include: { consent: true },
        })
      : await this.dbx.communicationThread.findFirst({
          where: { prospectId: data.prospectId, channel: 'EMAIL' },
          include: { consent: true },
          orderBy: { updatedAt: 'desc' },
        });
    if (!thread) throw new BadRequestException('CADENCE_THREAD_REQUIRED');
    this.assertThread(thread);
    await this.assertEvidence(cadence.key, data);
    const key = this.hash(
      `${cadence.activeVersion.id}:${data.prospectId}:${data.opportunityId ?? 'none'}:${thread.id}`,
    );
    const existing = await this.dbx.cadenceEnrollment.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing && ACTIVE.includes(existing.status)) return existing;
    const now = new Date();
    const first = cadence.activeVersion.steps[0];
    const scheduledAt = this.nextAllowed(
      new Date(now.getTime() + first.delayMinutes * 60_000),
      cadence.activeVersion.sendingWindow,
    );
    const configuredLifetime = Number(process.env.CADENCE_MAX_LIFETIME_DAYS ?? 30);
    const lifetimeDays = Math.min(cadence.activeVersion.maxLifetimeDays, configuredLifetime);
    const enrollment = await this.dbx.cadenceEnrollment.create({
      data: {
        versionId: cadence.activeVersion.id,
        prospectId: data.prospectId,
        opportunityId: data.opportunityId,
        communicationThreadId: thread.id,
        enrolledById: actor.id,
        idempotencyKey: key,
        timezone: data.timezone,
        nextStepAt: scheduledAt,
        expiresAt: new Date(now.getTime() + lifetimeDays * 86_400_000),
        steps: {
          create: {
            stepId: first.id,
            scheduledAt,
            idempotencyKey: this.hash(`${key}:${first.id}`),
          },
        },
      },
      include: { steps: true },
    });
    const jobId = await this.queue.scheduleCadenceStep(
      enrollment.id,
      enrollment.steps[0].id,
      scheduledAt,
    );
    await this.dbx.cadenceStepExecution.update({
      where: { id: enrollment.steps[0].id },
      data: { bullJobId: jobId },
    });
    await this.audit.record(
      'CADENCE_STEP_SCHEDULED',
      'CadenceStepExecution',
      enrollment.steps[0].id,
      ctx,
      { enrollmentId: enrollment.id, scheduledAt: scheduledAt.toISOString() },
    );
    await this.audit.record('CADENCE_ENROLLED', 'CadenceEnrollment', enrollment.id, ctx, {
      cadenceKey: cadence.key,
      prospectId: data.prospectId,
    });
    return enrollment;
  }
  async executeStep(stepExecutionId: string) {
    const initial = await this.loadStep(stepExecutionId);
    if (!initial || initial.status !== 'SCHEDULED') return { ignored: true };
    const claimed = await this.dbx.cadenceStepExecution.updateMany({
      where: {
        id: stepExecutionId,
        status: 'SCHEDULED',
        enrollment: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
      },
      data: { status: 'CLAIMED', claimedAt: new Date() },
    });
    if (!claimed.count) return { ignored: true };
    const item = await this.loadStep(stepExecutionId);
    if (!item || item.enrollment.status !== 'ACTIVE') return { ignored: true };
    try {
      await this.revalidate(item);
      const finalClaim = await this.dbx.cadenceStepExecution.updateMany({
        where: {
          id: stepExecutionId,
          status: 'CLAIMED',
          enrollment: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
        },
        data: { status: 'DISPATCHING' },
      });
      if (!finalClaim.count) return { ignored: true };
      const result = await this.perform(item);
      await this.dbx.cadenceStepExecution.update({
        where: { id: stepExecutionId },
        data: {
          status: 'EXECUTED',
          executedAt: new Date(),
          communicationId: result?.messageId,
          result: result ?? {},
        },
      });
      await this.audit.record(
        'CADENCE_STEP_EXECUTED',
        'CadenceStepExecution',
        stepExecutionId,
        {},
        { enrollmentId: item.enrollment.id, stepType: item.step.type },
      );
      await this.scheduleNext(item.enrollment.id, item.step.stepOrder);
      return result ?? { executed: true };
    } catch (error) {
      const code = this.failure(error);
      await this.dbx.cadenceStepExecution.update({
        where: { id: stepExecutionId },
        data: { status: code.retryable ? 'SCHEDULED' : 'FAILED', failureCode: code.code },
      });
      await this.audit.record(
        'CADENCE_STEP_FAILED',
        'CadenceStepExecution',
        stepExecutionId,
        {},
        { enrollmentId: item.enrollment.id, code: code.code, retryable: code.retryable },
      );
      if (!code.retryable) await this.stopSystem(item.enrollment.id, 'ERROR_POLICY');
      if (code.retryable) throw error;
      return { failed: true, code: code.code };
    }
  }
  private loadStep(id: string) {
    return this.dbx.cadenceStepExecution.findUnique({
      where: { id },
      include: {
        step: true,
        enrollment: {
          include: {
            version: { include: { cadence: true } },
            communicationThread: { include: { consent: true } },
            prospect: true,
            opportunity: true,
          },
        },
      },
    });
  }
  private async revalidate(item: any) {
    const e = item.enrollment;
    if (e.status !== 'ACTIVE') throw new Error('POLICY_BLOCK');
    if (e.expiresAt <= new Date()) throw new Error('CADENCE_EXPIRED');
    const [prospect, thread, opportunity] = await Promise.all([
      e.prospectId
        ? this.dbx.prospect.findUnique({
            where: { id: e.prospectId },
            select: { normalizedEmail: true },
          })
        : null,
      e.communicationThreadId
        ? this.dbx.communicationThread.findUnique({
            where: { id: e.communicationThreadId },
            include: { consent: true },
          })
        : null,
      e.opportunityId
        ? this.dbx.opportunity.findUnique({
            where: { id: e.opportunityId },
            select: { status: true },
          })
        : null,
    ]);
    this.assertThread(thread);
    if (!prospect?.normalizedEmail) throw new Error('CONTACT_INVALID');
    if (opportunity && opportunity.status !== 'OPEN') throw new Error('OPPORTUNITY_CLOSED');
    if (item.step.templateKey) {
      const template = await this.operationalTemplate(item.step.templateKey);
      if (!template) throw new Error('TEMPLATE_INACTIVE');
    }
    await this.frequency(item);
  }
  private assertThread(thread: any) {
    if (
      !thread ||
      thread.status === 'CLOSED' ||
      ['HUMAN', 'PAUSED', 'CLOSED'].includes(thread.handlingMode)
    )
      throw new BadRequestException(
        thread?.handlingMode === 'HUMAN' ? 'HUMAN_TAKEOVER' : 'THREAD_PAUSED',
      );
    if (['OPTED_OUT', 'SUPPRESSED'].includes(thread.consent?.commercialStatus))
      throw new BadRequestException('CONSENT_BLOCK');
  }
  private async frequency(item: any) {
    if (!SEND_STEPS.includes(item.step.type)) return;
    const policy = item.enrollment.version.frequencyPolicy as any;
    const now = Date.now();
    const configuredDaily = Number(process.env.CADENCE_MAX_CONTACT_SENDS_PER_DAY ?? 1);
    const configuredInterval = Number(process.env.CADENCE_MIN_SEND_INTERVAL_MINUTES ?? 1440);
    const maxPerDay = Math.min(policy.maxPerDay, configuredDaily);
    const minimumInterval = Math.max(policy.minimumIntervalMinutes, configuredInterval);
    const sent = await this.dbx.cadenceStepExecution.findMany({
      where: {
        communicationId: { not: null },
        enrollment: { prospectId: item.enrollment.prospectId },
        executedAt: { gte: new Date(now - 7 * 86_400_000) },
      },
      select: { executedAt: true },
    });
    if (
      sent.filter((x: any) => x.executedAt >= new Date(now - 86_400_000)).length >= maxPerDay ||
      sent.length >= policy.maxPerSevenDays
    )
      throw new Error('FREQUENCY_CAP');
    if (sent.some((x: any) => x.executedAt > new Date(now - minimumInterval * 60_000)))
      throw new Error('FREQUENCY_CAP');
  }
  private async perform(item: any) {
    const step = item.step,
      e = item.enrollment;
    if (step.type === 'WAIT' || step.type === 'CHECK_CONDITION' || step.type === 'END')
      return { type: step.type };
    const actor = await this.workerActor(e.enrolledById);
    if (step.type === 'CREATE_TASK') {
      const task = await this.crm.createTask(
        {
          prospectId: e.prospectId,
          opportunityId: e.opportunityId,
          title: String((step.definition as any).title ?? 'Seguimiento de cadencia'),
          dueAt: new Date(Date.now() + 86_400_000),
          assigneeId: e.enrolledById,
        },
        actor,
        { actorUserId: actor.id },
      );
      return { taskId: task.id };
    }
    if (step.type === 'SEND_EMAIL' || step.type === 'PREPARE_EMAIL') {
      const template = await this.operationalTemplate(step.templateKey);
      if (!template) throw new Error('TEMPLATE_INACTIVE');
      const draft = await this.templates.createDraft(
        {
          templateId: template.id,
          recipientProspectId: e.prospectId,
          opportunityId: e.opportunityId,
          communicationThreadId: e.communicationThreadId,
          ownerId: e.enrolledById,
        },
        actor,
        { actorUserId: actor.id },
      );
      if (step.type === 'PREPARE_EMAIL') return { draftId: draft.id };
      const preview = await this.templates.preview(draft.id, actor);
      const usage = await this.templates.handoff(draft.id, actor, { actorUserId: actor.id });
      const message = await this.communications.send(
        actor,
        e.communicationThreadId,
        {
          text: preview.text,
          html: preview.html,
          subject: preview.subject,
          messageClassification: preview.messageClassification,
          idempotencyKey: this.hash(item.idempotencyKey).slice(0, 64),
          templateMetadata: {
            cadenceEnrollmentId: e.id,
            cadenceStepId: step.id,
            draftId: draft.id,
            usageId: usage.usageId,
            templateId: draft.templateId,
            templateVersionId: draft.templateVersionId,
            attachmentReferences: preview.attachmentReferences ?? [],
          },
        },
        { actorUserId: actor.id },
      );
      await this.dbx.emailTemplateUsage.update({
        where: { id: usage.usageId },
        data: { communicationMessageId: message.id },
      });
      return { messageId: message.id, status: message.status };
    }
    return { type: step.type, requiresHuman: true };
  }
  private async scheduleNext(enrollmentId: string, order: number) {
    const enrollment = await this.dbx.cadenceEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { version: { include: { steps: { orderBy: { stepOrder: 'asc' } } } } },
    });
    if (!enrollment || enrollment.status !== 'ACTIVE') return;
    const next = enrollment.version.steps.find((s: any) => s.stepOrder === order + 1);
    if (!next || next.type === 'END') {
      await this.stopSystem(enrollmentId, 'CADENCE_COMPLETED', 'COMPLETED');
      return;
    }
    const at = this.nextAllowed(
      new Date(Date.now() + next.delayMinutes * 60_000),
      enrollment.version.sendingWindow,
    );
    const execution = await this.dbx.cadenceStepExecution.upsert({
      where: { enrollmentId_stepId: { enrollmentId, stepId: next.id } },
      update: {},
      create: {
        enrollmentId,
        stepId: next.id,
        scheduledAt: at,
        idempotencyKey: this.hash(`${enrollment.idempotencyKey}:${next.id}`),
      },
    });
    const jobId = await this.queue.scheduleCadenceStep(enrollmentId, execution.id, at);
    await this.dbx.$transaction([
      this.dbx.cadenceStepExecution.update({
        where: { id: execution.id },
        data: { bullJobId: jobId },
      }),
      this.dbx.cadenceEnrollment.update({
        where: { id: enrollmentId },
        data: { currentStep: order, nextStepAt: at },
      }),
    ]);
    await this.audit.record(
      'CADENCE_STEP_SCHEDULED',
      'CadenceStepExecution',
      execution.id,
      {},
      { enrollmentId, scheduledAt: at.toISOString() },
    );
  }
  async pause(actor: CadenceActor, id: string, ctx: AuditContext) {
    return this.change(actor, id, 'PAUSED', ctx);
  }
  async getEnrollment(actor: CadenceActor, id: string) {
    return this.owned(actor, id);
  }
  async resume(actor: CadenceActor, id: string, ctx: AuditContext) {
    const e = await this.owned(actor, id);
    if (e.status !== 'PAUSED') throw new BadRequestException('CADENCE_NOT_PAUSED');
    const pending = e.steps.find((s: any) => ['SCHEDULED', 'CANCELLED'].includes(s.status));
    if (!pending) throw new BadRequestException('CADENCE_NO_PENDING_STEP');
    const at = this.nextAllowed(
      new Date(Date.now() + Math.max(60_000, pending.step.delayMinutes * 60_000)),
      e.version.sendingWindow,
    );
    const jobId = await this.queue.scheduleCadenceStep(e.id, pending.id, at);
    const row = await this.dbx.cadenceEnrollment.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        pausedAt: null,
        nextStepAt: at,
        steps: {
          update: {
            where: { id: pending.id },
            data: { status: 'SCHEDULED', scheduledAt: at, bullJobId: jobId },
          },
        },
      },
    });
    await this.audit.record('CADENCE_RESUMED', 'CadenceEnrollment', id, ctx, {});
    return row;
  }
  async stop(actor: CadenceActor, id: string, ctx: AuditContext) {
    await this.owned(actor, id);
    const row = await this.stopSystem(id, 'MANUAL_STOP');
    await this.audit.record('CADENCE_STOPPED', 'CadenceEnrollment', id, ctx, {
      reason: 'MANUAL_STOP',
    });
    return row;
  }
  private async change(actor: CadenceActor, id: string, status: string, ctx: AuditContext) {
    const e = await this.owned(actor, id);
    if (e.status !== 'ACTIVE') throw new BadRequestException('CADENCE_NOT_ACTIVE');
    await this.queue.cancelCadenceEnrollment(id);
    const row = await this.dbx.$transaction(async (tx: any) => {
      await tx.cadenceStepExecution.updateMany({
        where: { enrollmentId: id, status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
      return tx.cadenceEnrollment.update({
        where: { id },
        data: { status, pausedAt: new Date(), nextStepAt: null },
      });
    });
    await this.audit.record(`CADENCE_${status}`, 'CadenceEnrollment', id, ctx, {});
    return row;
  }
  private async owned(actor: CadenceActor, id: string) {
    const users = await this.scopedUsers(actor);
    const row = await this.dbx.cadenceEnrollment.findFirst({
      where: { id, ...(users ? { enrolledById: { in: users } } : {}) },
      include: { version: true, steps: { include: { step: true } } },
    });
    if (!row) throw new NotFoundException('CADENCE_ENROLLMENT_NOT_FOUND');
    return row;
  }
  private async stopSystem(id: string, reason: string, status = 'STOPPED') {
    await this.queue.cancelCadenceEnrollment(id);
    await this.dbx.cadenceStepExecution.updateMany({
      where: { enrollmentId: id, status: { in: ['SCHEDULED', 'CLAIMED'] } },
      data: { status: 'CANCELLED', failureCode: reason },
    });
    const row = await this.dbx.cadenceEnrollment.update({
      where: { id },
      data: { status, stopReason: reason, stoppedAt: new Date(), nextStepAt: null },
    });
    await this.audit.record(
      'CADENCE_SYSTEM_STOPPED',
      'CadenceEnrollment',
      id,
      {},
      { reason, status },
    );
    return row;
  }
  async handleDomainEvent(eventId: string) {
    const event = await this.dbx.automationEvent.findUnique({ where: { eventId } });
    const payload = event?.payload as any;
    const reason =
      event?.type === 'OPPORTUNITY_STAGE_CHANGED' &&
      ['WON', 'LOST', 'CANCELLED', 'CLOSED'].includes(String(payload?.status ?? payload?.newStatus))
        ? 'OPPORTUNITY_CLOSED'
        : event && STOP_EVENT[event.type];
    if (!event || !reason) return { stopped: 0 };
    const prospectId = event.entityType === 'Prospect' ? event.entityId : payload?.prospectId;
    const opportunityId =
      event.entityType === 'Opportunity' ? event.entityId : payload?.opportunityId;
    const threadId =
      event.entityType === 'CommunicationThread' ? event.entityId : payload?.threadId;
    const relations = [
      prospectId ? { prospectId } : undefined,
      opportunityId ? { opportunityId } : undefined,
      threadId ? { communicationThreadId: threadId } : undefined,
    ].filter(Boolean);
    if (!relations.length) return { stopped: 0 };
    const where: any = { status: 'ACTIVE', OR: relations };
    const rows = await this.dbx.cadenceEnrollment.findMany({ where, include: { version: true } });
    let stopped = 0;
    for (const row of rows)
      if (row.version.stopConditions.includes(reason)) {
        await this.stopSystem(row.id, reason);
        stopped++;
      }
    return { stopped };
  }
  private async assertEvidence(key: string, input: any) {
    if (key.startsWith('proposal.') && !input.opportunityId)
      throw new BadRequestException('CADENCE_EVIDENCE_REQUIRED');
    if (key === 'meeting.post_meeting') {
      const count = await this.dbx.meeting.count({
        where: { prospectId: input.prospectId, status: 'ENDED' },
      });
      if (!count) throw new BadRequestException('CADENCE_MEETING_EVIDENCE_REQUIRED');
    }
  }
  private nextAllowed(date: Date, window: any) {
    const zone = String(
      window.timezone ?? process.env.CADENCE_DEFAULT_TIMEZONE ?? 'America/Bogota',
    );
    let candidate = new Date(date);
    for (let i = 0; i < 24 * 8; i++) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(candidate);
      const dayName = parts.find((p) => p.type === 'weekday')?.value;
      const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(dayName ?? '') + 1;
      const hm = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
      if (window.days.includes(day) && hm >= window.start && hm <= window.end) return candidate;
      candidate = new Date(candidate.getTime() + 60 * 60_000);
    }
    throw new BadRequestException('CADENCE_SENDING_WINDOW_INVALID');
  }
  private async workerActor(id: string) {
    const user = await this.dbx.user.findUniqueOrThrow({
      where: { id },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    return {
      id,
      roles: user.roles.map((x: any) => x.role.name),
      permissions: [
        ...new Set(
          user.roles.flatMap((x: any) => x.role.permissions.map((p: any) => p.permission.key)),
        ),
      ] as string[],
    };
  }
  private async operationalTemplate(key: string) {
    const template = await this.dbx.emailTemplate.findFirst({
      where: {
        key,
        locale: 'es-CO',
        scope: 'CORPORATE',
        isCorporate: true,
        ownerId: null,
        status: 'ACTIVE',
      },
      include: {
        versions: {
          where: { status: 'ACTIVE', legalStatus: 'LEGAL_APPROVED' },
          select: { id: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (
      !template?.activeVersionId ||
      !template.versions.some((version: { id: string }) => version.id === template.activeVersionId)
    )
      return null;
    return template;
  }
  private failure(error: unknown) {
    const response = (error as { response?: unknown } | null)?.response;
    const responseCode =
      typeof response === 'string'
        ? response
        : response && typeof response === 'object' && 'code' in response
          ? String((response as { code: unknown }).code)
          : null;
    const explicitCode =
      typeof (error as { code?: unknown } | null)?.code === 'string'
        ? String((error as { code: string }).code)
        : null;
    const message = error instanceof Error ? error.message : null;
    const code = explicitCode ?? responseCode ?? message;
    const retryable = ['TEMPORARY_PROVIDER_FAILURE', 'PROVIDER_NOT_ENABLED'].includes(code ?? '');
    return {
      code:
        [
          'CONSENT_BLOCK',
          'TEMPLATE_INACTIVE',
          'CONTACT_INVALID',
          'FREQUENCY_CAP',
          'OPPORTUNITY_CLOSED',
          'CADENCE_EXPIRED',
        ].find((candidate) => candidate === code) ??
        (retryable ? 'TEMPORARY_PROVIDER_FAILURE' : 'POLICY_BLOCK'),
      retryable,
    };
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
