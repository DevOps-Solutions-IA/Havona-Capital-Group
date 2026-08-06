import { createHash, randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  forwardRef,
  Inject,
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
import { HenryService } from '../henry/henry.service';
import { AutomationQueueService } from './automation-queue.service';
import { AutomationEventBus } from './automation-event-bus.service';
import { CadenceService } from '../cadences/cadence.service';
import {
  AutomationActor,
  AutomationError,
  createWorkflowSchema,
  DomainEventInput,
} from './automation.types';

const ADMIN = ['automations.admin'];
const COMMUNICATION_ACTIONS = new Set([
  'SEND_WHATSAPP_TEXT',
  'SEND_WHATSAPP_TEMPLATE',
  'SEND_EMAIL',
]);

@Injectable()
export class AutomationService {
  private readonly dbx: any;
  constructor(
    db: PrismaService,
    private audit: AuditService,
    private queue: AutomationQueueService,
    private access: CalendarAccessService,
    private crm: CrmService,
    private communications: CommunicationsService,
    private emailTemplates: EmailTemplateService,
    @Inject(forwardRef(() => HenryService)) private henry: HenryService,
    private eventBus: AutomationEventBus,
    private cadences: CadenceService,
  ) {
    this.dbx = db as any;
  }

  private global(actor: AutomationActor) {
    return ADMIN.some((p) => actor.permissions.includes(p));
  }
  private async ownerScope(actor: AutomationActor) {
    if (this.global(actor)) return undefined;
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
  private async assertWorkflow(actor: AutomationActor, id: string, manage = false) {
    const owners = await this.ownerScope(actor);
    const workflow = await this.dbx.automationWorkflow.findFirst({
      where: {
        id,
        ...(owners
          ? { OR: [{ ownerUserId: { in: owners } }, { createdById: { in: owners } }] }
          : {}),
      },
      include: { triggers: true, actions: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!workflow) throw new NotFoundException('Automatización no encontrada o fuera de su ámbito');
    if (
      manage &&
      !actor.permissions.some((p) =>
        ['automations.manage_own', 'automations.manage_team', 'automations.admin'].includes(p),
      )
    )
      throw new ForbiddenException('Permiso de gestión de automatizaciones requerido');
    return workflow;
  }
  async list(actor: AutomationActor, query: any) {
    const owners = await this.ownerScope(actor);
    const where = {
      ...(owners ? { OR: [{ ownerUserId: { in: owners } }, { createdById: { in: owners } }] } : {}),
      status: query.status,
    };
    const [data, total] = await Promise.all([
      this.dbx.automationWorkflow.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          triggers: true,
          actions: { orderBy: { stepOrder: 'asc' } },
          executions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.dbx.automationWorkflow.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
  async get(actor: AutomationActor, id: string) {
    await this.assertWorkflow(actor, id);
    return this.dbx.automationWorkflow.findUnique({
      where: { id },
      include: {
        triggers: true,
        actions: { orderBy: { stepOrder: 'asc' } },
        schedules: true,
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { steps: true, approvals: true },
        },
      },
    });
  }
  async getExecution(actor: AutomationActor, id: string) {
    const execution = await this.dbx.automationExecution.findUnique({
      where: { id },
      include: {
        workflow: true,
        steps: { orderBy: { stepOrder: 'asc' } },
        approvals: true,
      },
    });
    if (!execution) throw new NotFoundException('Ejecución no encontrada');
    await this.assertWorkflow(actor, execution.workflowId);
    return execution;
  }
  async create(actor: AutomationActor, input: unknown, ctx: AuditContext) {
    const data = createWorkflowSchema.parse(input);
    if (data.scope === 'GLOBAL' && !this.global(actor))
      throw new ForbiddenException('Scope global no autorizado');
    if (data.ownerUserId && data.ownerUserId !== actor.id) {
      if (!actor.permissions.includes('automations.manage_team'))
        throw new ForbiddenException('Owner fuera de ámbito');
      await this.access.assertUserScope(
        { ...actor, permissions: [...actor.permissions, 'calendar.manage_team'] },
        data.ownerUserId,
      );
    }
    this.validateWorkflow(data.actions);
    const row = await this.dbx.automationWorkflow.create({
      data: {
        name: data.name,
        description: data.description,
        scope: data.scope,
        createdById: actor.id,
        ownerUserId: data.ownerUserId ?? actor.id,
        maxSteps: data.maxSteps,
        maxDurationSecs: data.maxDurationSecs,
        triggers: {
          create: {
            type: data.trigger.type,
            definition: data.trigger.definition as Prisma.InputJsonValue,
          },
        },
        actions: {
          create: data.actions.map((action, index) => ({
            stepOrder: index + 1,
            type: action.type,
            definition: action.definition as Prisma.InputJsonValue,
            condition: action.condition as Prisma.InputJsonValue | undefined,
            approvalMode: action.approvalMode,
            retryLimit: action.retryLimit,
            timeoutMs: action.timeoutMs,
          })),
        },
      },
      include: { triggers: true, actions: true },
    });
    await this.audit.record('AUTOMATION_WORKFLOW_CREATED', 'AutomationWorkflow', row.id, ctx, {
      scope: row.scope,
      version: row.version,
    });
    return row;
  }
  private validateWorkflow(
    actions: Array<{ type: string; definition: Record<string, unknown>; approvalMode: string }>,
  ) {
    if (actions.length > 25)
      throw new AutomationError('AUTOMATION_MAX_STEPS', 'El workflow excede el máximo de pasos');
    for (const action of actions) {
      if (
        action.type === 'DELAY' &&
        (!Number.isFinite(action.definition.delayMinutes) ||
          Number(action.definition.delayMinutes) < 1)
      )
        throw new AutomationError('AUTOMATION_INVALID_ACTION', 'Delay inválido');
      if (
        [
          'UPDATE_CRM_STAGE',
          'ASSIGN_CONSULTANT',
          'SEND_WHATSAPP_TEXT',
          'SEND_WHATSAPP_TEMPLATE',
          'SEND_EMAIL',
          'REQUEST_HUMAN_ESCALATION',
          'HENRY_REASONING',
        ].includes(action.type) &&
        action.approvalMode === 'AUTO'
      )
        throw new AutomationError(
          'AUTOMATION_APPROVAL_REQUIRED',
          `${action.type} requiere confirmación o política humana`,
        );
    }
  }
  async setStatus(
    actor: AutomationActor,
    id: string,
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    ctx: AuditContext,
  ) {
    const workflow = await this.assertWorkflow(actor, id, true);
    if (!actor.permissions.includes('automations.activate'))
      throw new ForbiddenException('No puede cambiar el estado');
    if (status === 'ACTIVE' && (!workflow.triggers.length || !workflow.actions.length))
      throw new AutomationError('AUTOMATION_INVALID_TRIGGER', 'El workflow no está completo');
    const row = await this.dbx.automationWorkflow.update({
      where: { id },
      data: { status, version: { increment: 1 } },
    });
    if (status === 'ACTIVE') await this.activateSchedules(workflow);
    else await this.deactivateSchedules(id);
    await this.audit.record(`AUTOMATION_WORKFLOW_${status}`, 'AutomationWorkflow', id, ctx, {
      previousStatus: workflow.status,
    });
    return row;
  }
  async archive(actor: AutomationActor, id: string, ctx: AuditContext) {
    return this.setStatus(actor, id, 'ARCHIVED', ctx);
  }

  async publishEvent(input: DomainEventInput) {
    return this.eventBus.publish(input);
  }
  private async activateSchedules(workflow: any) {
    const trigger = workflow.triggers.find((item: any) =>
      ['SCHEDULED_TIME', 'RECURRING_SCHEDULE'].includes(item.type),
    );
    if (!trigger) return;
    const definition = trigger.definition as Record<string, unknown>;
    const runAt = definition.runAt ? new Date(String(definition.runAt)) : undefined;
    const cron = definition.cron ? String(definition.cron) : undefined;
    if (trigger.type === 'SCHEDULED_TIME' && (!runAt || Number.isNaN(runAt.getTime())))
      throw new AutomationError(
        'AUTOMATION_INVALID_TRIGGER',
        'runAt es obligatorio para una programación puntual',
      );
    if (trigger.type === 'RECURRING_SCHEDULE' && !cron)
      throw new AutomationError(
        'AUTOMATION_INVALID_TRIGGER',
        'cron es obligatorio para una programación recurrente',
      );
    if (!definition.entityType || !definition.entityId)
      throw new AutomationError(
        'AUTOMATION_INVALID_TRIGGER',
        'La programación requiere entityType y entityId autorizados',
      );
    const schedule = await this.dbx.automationSchedule.upsert({
      where: { workflowId: workflow.id },
      update: {
        runAt,
        cron,
        timezone: String(
          definition.timezone ?? process.env.AUTOMATIONS_DEFAULT_TIMEZONE ?? 'America/Bogota',
        ),
        isActive: true,
      },
      create: {
        workflowId: workflow.id,
        runAt,
        cron,
        timezone: String(
          definition.timezone ?? process.env.AUTOMATIONS_DEFAULT_TIMEZONE ?? 'America/Bogota',
        ),
      },
    });
    await this.queue.scheduleWorkflow(schedule.id, workflow.id, runAt, cron, schedule.timezone);
  }
  private async deactivateSchedules(workflowId: string) {
    const schedules = await this.dbx.automationSchedule.findMany({
      where: { workflowId, isActive: true },
    });
    for (const schedule of schedules) await this.queue.cancelSchedule(schedule.id);
    await this.dbx.automationSchedule.updateMany({
      where: { workflowId },
      data: { isActive: false },
    });
  }
  async fireSchedule(scheduleId: string) {
    const schedule = await this.dbx.automationSchedule.findUnique({
      where: { id: scheduleId },
      include: { workflow: { include: { triggers: true } } },
    });
    if (!schedule?.isActive || schedule.workflow.status !== 'ACTIVE') return { ignored: true };
    const trigger = schedule.workflow.triggers.find((item: any) =>
      ['SCHEDULED_TIME', 'RECURRING_SCHEDULE'].includes(item.type),
    );
    if (!trigger) return { ignored: true };
    const definition = trigger.definition as Record<string, unknown>;
    const occurrence = new Date();
    const result = await this.publishEvent({
      eventId: `schedule:${schedule.id}:${occurrence.toISOString().slice(0, 16)}`,
      type: trigger.type,
      entityType: String(definition.entityType),
      entityId: String(definition.entityId),
      payload: {
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        occurrence: occurrence.toISOString(),
      },
      occurredAt: occurrence,
    });
    if (!schedule.cron)
      await this.dbx.automationSchedule.update({
        where: { id: schedule.id },
        data: { isActive: false },
      });
    return result;
  }
  async dispatchOutbox(eventId: string) {
    const outbox = await this.dbx.domainOutboxEvent.findUnique({ where: { eventId } });
    if (!outbox || outbox.status === 'PROCESSED') return { processed: true, executions: 0 };
    const claimed = await this.dbx.domainOutboxEvent.updateMany({
      where: { eventId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    // Webhook retries, recovery and the BullMQ worker may observe the same outbox
    // event concurrently. Only the process that atomically claims it may dispatch.
    if (claimed.count === 0) return { processed: false, executions: 0 };
    try {
      const event = await this.dbx.automationEvent.findUniqueOrThrow({ where: { eventId } });
      const triggers = await this.dbx.automationTrigger.findMany({
        where: { type: event.type, isActive: true, workflow: { status: 'ACTIVE' } },
        include: { workflow: true },
      });
      let executions = 0;
      for (const trigger of triggers) {
        if (!this.matchesDefinition(trigger.definition, event)) continue;
        const perDayLimit = Math.min(
          100,
          Math.max(
            1,
            Number(
              (trigger.definition as any)?.maxExecutionsPerEntityPerDay ??
                process.env.AUTOMATIONS_MAX_EXECUTIONS_PER_ENTITY_DAY ??
                10,
            ),
          ),
        );
        const recent = await this.dbx.automationExecution.count({
          where: {
            workflowId: trigger.workflowId,
            entityType: event.entityType,
            entityId: event.entityId,
            createdAt: { gte: new Date(Date.now() - 86_400_000) },
          },
        });
        if (recent >= perDayLimit) continue;
        const key = this.executionKey(
          event.eventId,
          trigger.workflowId,
          event.entityId,
          trigger.workflow.version,
        );
        const execution = await this.dbx.automationExecution.upsert({
          where: { idempotencyKey: key },
          update: {},
          create: {
            workflowId: trigger.workflowId,
            workflowVersion: trigger.workflow.version,
            entityType: event.entityType,
            entityId: event.entityId,
            idempotencyKey: key,
            correlationId: event.eventId,
            context: event.payload,
          },
        });
        await this.dbx.automationEnrollment.upsert({
          where: {
            workflowId_entityType_entityId: {
              workflowId: trigger.workflowId,
              entityType: event.entityType,
              entityId: event.entityId,
            },
          },
          update: { status: 'ACTIVE', endedAt: null },
          create: {
            workflowId: trigger.workflowId,
            entityType: event.entityType,
            entityId: event.entityId,
          },
        });
        await this.queue.enqueueExecution(execution.id, 0, 0);
        executions++;
      }
      await this.dbx.$transaction([
        this.dbx.domainOutboxEvent.update({
          where: { eventId },
          data: { status: 'PROCESSED', processedAt: new Date() },
        }),
        this.dbx.automationEvent.update({ where: { eventId }, data: { processedAt: new Date() } }),
      ]);
      await this.cadences.handleDomainEvent(eventId);
      return { processed: true, executions };
    } catch (error) {
      await this.dbx.domainOutboxEvent.update({
        where: { eventId },
        data: {
          status: 'FAILED',
          errorCode: error instanceof AutomationError ? error.code : 'AUTOMATION_ACTION_FAILED',
        },
      });
      throw error;
    }
  }
  async recoverPending() {
    const outbox = await this.dbx.domainOutboxEvent.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: new Date() } },
      take: 500,
    });
    for (const event of outbox) await this.queue.enqueueOutbox(event.eventId);
    const schedules = await this.dbx.automationSchedule.findMany({
      where: { isActive: true, workflow: { status: 'ACTIVE' } },
    });
    for (const schedule of schedules)
      await this.queue.scheduleWorkflow(
        schedule.id,
        schedule.workflowId,
        schedule.runAt ?? undefined,
        schedule.cron ?? undefined,
        schedule.timezone,
      );
    return { outbox: outbox.length, schedules: schedules.length };
  }
  private matchesDefinition(definition: any, event: any) {
    return (
      !definition?.entityType ||
      String(definition.entityType).toLowerCase() === String(event.entityType).toLowerCase()
    );
  }
  private executionKey(eventId: string, workflowId: string, entityId: string, version: number) {
    return createHash('sha256')
      .update(`${eventId}:${workflowId}:${entityId}:${version}`)
      .digest('hex');
  }

  async execute(executionId: string) {
    const execution = await this.dbx.automationExecution.findUnique({
      where: { id: executionId },
      include: {
        workflow: { include: { actions: { orderBy: { stepOrder: 'asc' } } } },
        approvals: true,
      },
    });
    if (!execution)
      throw new AutomationError('AUTOMATION_NOT_FOUND', 'Ejecución no encontrada', 404);
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'SUPPRESSED'].includes(execution.status))
      return execution;
    if (execution.workflow.status !== 'ACTIVE')
      return this.dbx.automationExecution.update({
        where: { id: executionId },
        data: { status: 'PAUSED' },
      });
    const suppression = await this.dbx.automationSuppression.findFirst({
      where: {
        entityType: execution.entityType,
        entityId: execution.entityId,
        OR: [{ workflowId: execution.workflowId }, { workflowId: null }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
    });
    if (suppression)
      return this.dbx.automationExecution.update({
        where: { id: executionId },
        data: {
          status: 'SUPPRESSED',
          failureCode: 'AUTOMATION_SUPPRESSED',
          completedAt: new Date(),
        },
      });
    await this.dbx.automationExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING', startedAt: execution.startedAt ?? new Date() },
    });
    for (const action of execution.workflow.actions.filter(
      (a: any) => a.stepOrder > execution.currentStep,
    )) {
      const started = execution.startedAt ? new Date(execution.startedAt).getTime() : Date.now();
      if (Date.now() - started > execution.workflow.maxDurationSecs * 1000)
        return this.fail(executionId, 'AUTOMATION_MAX_DURATION');
      if (action.stepOrder > execution.workflow.maxSteps)
        return this.fail(executionId, 'AUTOMATION_MAX_STEPS');
      if (!this.evaluateCondition(action.condition, execution.context ?? {})) {
        await this.recordStep(executionId, action, 'SKIPPED', {});
        continue;
      }
      if (action.approvalMode !== 'AUTO') return this.requestApproval(execution, action);
      if (action.type === 'DELAY') {
        const delayMs = Number(action.definition.delayMinutes) * 60_000;
        await this.recordStep(executionId, action, 'WAITING', { delayMs });
        await this.dbx.automationExecution.update({
          where: { id: executionId },
          data: { status: 'WAITING', currentStep: action.stepOrder },
        });
        await this.queue.enqueueExecution(executionId, delayMs, action.stepOrder);
        return { ...execution, status: 'WAITING' };
      }
      try {
        const { output, attempt } = await this.executeActionWithRetry(execution, action);
        await this.recordStep(executionId, action, 'COMPLETED', output, attempt);
        await this.dbx.automationExecution.update({
          where: { id: executionId },
          data: { currentStep: action.stepOrder },
        });
        if (action.type === 'END_WORKFLOW') break;
      } catch (error) {
        return this.fail(
          executionId,
          error instanceof AutomationError ? error.code : 'AUTOMATION_ACTION_FAILED',
        );
      }
    }
    return this.dbx.automationExecution.update({
      where: { id: executionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
  private async executeActionWithRetry(execution: any, action: any) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= action.retryLimit; attempt++) {
      try {
        const output = await this.withTimeout(
          this.executeAction(execution, action),
          action.timeoutMs,
        );
        return { output, attempt };
      } catch (error) {
        lastError = error;
        await this.recordStep(
          execution.id,
          action,
          'FAILED',
          {},
          attempt,
          error instanceof AutomationError ? error.code : 'AUTOMATION_ACTION_FAILED',
        );
        if (attempt < action.retryLimit)
          await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 2000)));
      }
    }
    throw lastError;
  }
  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new AutomationError('AUTOMATION_ACTION_TIMEOUT', 'La acción excedió su timeout'),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private evaluateCondition(condition: any, context: any) {
    if (!condition) return true;
    const actual = String(condition.field)
      .split('.')
      .reduce((value: any, key: string) => value?.[key], context);
    const value = condition.value;
    switch (condition.operator) {
      case 'EQUALS':
        return actual === value;
      case 'NOT_EQUALS':
        return actual !== value;
      case 'IN':
        return Array.isArray(value) && value.includes(actual);
      case 'NOT_IN':
        return Array.isArray(value) && !value.includes(actual);
      case 'EXISTS':
        return actual !== undefined && actual !== null;
      case 'GT':
        return actual > value;
      case 'GTE':
        return actual >= value;
      case 'LT':
        return actual < value;
      case 'LTE':
        return actual <= value;
      default:
        return false;
    }
  }
  private async executeAction(execution: any, action: any) {
    const context = (execution.context ?? {}) as Record<string, any>;
    const actor = await this.executionActor(
      execution.workflow.ownerUserId ?? execution.workflow.createdById,
    );
    const audit = { actorUserId: actor.id };
    if (
      [
        'CREATE_CRM_TASK',
        'SCHEDULE_FOLLOW_UP',
        'CREATE_CALENDAR_REMINDER',
        'NOTIFY_INTERNAL_USER',
      ].includes(action.type)
    ) {
      const prospectId =
        action.definition.prospectId ??
        context.prospectId ??
        (execution.entityType === 'Prospect' ? execution.entityId : undefined);
      if (!prospectId) throw new AutomationError('AUTOMATION_INVALID_ACTION', 'Falta prospectId');
      const dueAt = new Date(
        Date.now() + Number(action.definition.dueInMinutes ?? 60) * 60_000,
      ).toISOString();
      const task = await this.crm.createTask(
        {
          prospectId,
          opportunityId: context.opportunityId,
          assigneeId: action.definition.assigneeId ?? context.assignedUserId ?? actor.id,
          title: String(
            action.definition.title ??
              (action.type === 'CREATE_CALENDAR_REMINDER'
                ? 'Recordatorio de cita'
                : action.type === 'NOTIFY_INTERNAL_USER'
                  ? 'Notificación operativa'
                  : 'Seguimiento comercial'),
          ),
          description: action.definition.description,
          dueAt,
          priority: action.definition.priority ?? 'MEDIUM',
        },
        actor,
        { auth: { user: actor }, headers: {}, ip: undefined },
      );
      return { taskId: task.id };
    }
    if (action.type === 'UPDATE_CRM_STAGE') {
      const opportunityId = String(
        action.definition.opportunityId ??
          context.opportunityId ??
          (execution.entityType === 'Opportunity' ? execution.entityId : ''),
      );
      const stageId = String(action.definition.stageId ?? context.stageId ?? '');
      if (!opportunityId || !stageId)
        throw new AutomationError('AUTOMATION_INVALID_ACTION', 'Faltan opportunityId o stageId');
      const moved = await this.crm.moveOpportunity(
        opportunityId,
        { stageId, outcome: action.definition.outcome },
        actor,
        { auth: { user: actor }, headers: {} },
      );
      return { opportunityId: moved.id, stageId };
    }
    if (action.type === 'ASSIGN_CONSULTANT') {
      const prospectId = String(
        action.definition.prospectId ??
          context.prospectId ??
          (execution.entityType === 'Prospect' ? execution.entityId : ''),
      );
      const assigneeId = String(action.definition.assigneeId ?? context.assigneeId ?? '');
      if (!prospectId || !assigneeId)
        throw new AutomationError('AUTOMATION_INVALID_ACTION', 'Faltan prospectId o assigneeId');
      const assignment = await this.crm.assign(prospectId, assigneeId, actor, {
        auth: { user: actor },
        headers: {},
      });
      return { assignmentId: assignment.id, prospectId, assigneeId };
    }
    if (action.type === 'REQUEST_HUMAN_ESCALATION') {
      const threadId = String(
        action.definition.threadId ??
          context.threadId ??
          (execution.entityType === 'CommunicationThread' ? execution.entityId : ''),
      );
      if (!threadId)
        throw new AutomationError('AUTOMATION_INVALID_ACTION', 'Falta threadId para escalar');
      const thread = await this.communications.setMode(actor, threadId, 'HUMAN', audit);
      return { threadId: thread.id, mode: thread.handlingMode };
    }
    if (COMMUNICATION_ACTIONS.has(action.type)) {
      const threadId = String(
        action.definition.threadId ??
          context.threadId ??
          (execution.entityType === 'CommunicationThread' ? execution.entityId : ''),
      );
      if (!threadId) throw new AutomationError('AUTOMATION_INVALID_ACTION', 'Falta threadId');
      if (action.type === 'SEND_EMAIL' && action.definition.templateKey) {
        await this.emailTemplates.assertAutomationDispatch(String(action.definition.templateKey), {
          evidence: Array.isArray(context.evidence) ? context.evidence.map(String) : [],
          approvalMode: action.approvalMode,
        });
      }
      const message = await this.communications.send(
        actor,
        threadId,
        {
          text: String(action.definition.text ?? context.messageDraft ?? ''),
          html: action.definition.html,
          templateName:
            action.type === 'SEND_WHATSAPP_TEMPLATE' ? action.definition.templateName : undefined,
          templateLanguage: action.definition.templateLanguage,
          templateParameters: action.definition.templateParameters,
          idempotencyKey: createHash('sha256')
            .update(`${execution.id}:${action.id}`)
            .digest('hex')
            .slice(0, 32)
            .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5'),
        },
        audit,
      );
      return { messageId: message.id };
    }
    if (action.type === 'HENRY_REASONING')
      return this.henry.reasonForAutomation({
        objective: String(action.definition.objective ?? ''),
        context,
        actor,
      });
    if (action.type === 'PAUSE_WORKFLOW') {
      await this.dbx.automationWorkflow.update({
        where: { id: execution.workflowId },
        data: { status: 'PAUSED' },
      });
      return { paused: true };
    }
    if (action.type === 'END_WORKFLOW') return { ended: true };
    throw new AutomationError(
      'AUTOMATION_INVALID_ACTION',
      `Acción no implementada: ${action.type}`,
    );
  }
  private async executionActor(id: string): Promise<AutomationActor> {
    const user = await this.dbx.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user?.isActive)
      throw new AutomationError(
        'AUTOMATION_FORBIDDEN',
        'El propietario del workflow no está activo',
        403,
      );
    return {
      id: user.id,
      roles: user.roles.map((item: any) => item.role.name),
      permissions: [
        ...new Set<string>(
          user.roles.flatMap((item: any) =>
            item.role.permissions.map((entry: any) => entry.permission.key),
          ),
        ),
      ],
    };
  }
  private async requestApproval(execution: any, action: any) {
    const approver = execution.workflow.ownerUserId ?? execution.workflow.createdById;
    await this.dbx.automationApproval.upsert({
      where: { executionId_stepOrder: { executionId: execution.id, stepOrder: action.stepOrder } },
      update: {},
      create: {
        executionId: execution.id,
        stepOrder: action.stepOrder,
        requestedBy: 'AUTOMATION',
        approverUserId: approver,
        actionPreview: { type: action.type, definition: action.definition },
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      },
    });
    await this.recordStep(execution.id, action, 'AWAITING_APPROVAL', { approvalRequired: true });
    return this.dbx.automationExecution.update({
      where: { id: execution.id },
      data: { status: 'AWAITING_APPROVAL' },
    });
  }
  async resolveApproval(
    actor: AutomationActor,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string | undefined,
    ctx: AuditContext,
  ) {
    const approval = await this.dbx.automationApproval.findUnique({
      where: { id },
      include: { execution: true },
    });
    if (!approval || (approval.approverUserId !== actor.id && !this.global(actor)))
      throw new NotFoundException('Aprobación no encontrada');
    if (approval.status !== 'PENDING')
      throw new AutomationError(
        'AUTOMATION_APPROVAL_EXPIRED',
        'La aprobación ya fue resuelta',
        409,
      );
    if (approval.expiresAt <= new Date())
      throw new AutomationError('AUTOMATION_APPROVAL_EXPIRED', 'La aprobación expiró', 409);
    await this.dbx.automationApproval.update({
      where: { id },
      data: { status: decision, resolutionNote: note, resolvedAt: new Date() },
    });
    await this.audit.record(`AUTOMATION_APPROVAL_${decision}`, 'AutomationApproval', id, ctx, {
      executionId: approval.executionId,
      stepOrder: approval.stepOrder,
    });
    if (decision === 'REJECTED')
      return this.dbx.automationExecution.update({
        where: { id: approval.executionId },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
    const action = await this.dbx.automationAction.findFirstOrThrow({
      where: { workflowId: approval.execution.workflowId, stepOrder: approval.stepOrder },
    });
    const output = await this.executeAction(
      {
        ...approval.execution,
        workflow: await this.dbx.automationWorkflow.findUnique({
          where: { id: approval.execution.workflowId },
        }),
      },
      action,
    );
    await this.recordStep(approval.executionId, action, 'COMPLETED', output, 1);
    await this.dbx.automationExecution.update({
      where: { id: approval.executionId },
      data: { status: 'QUEUED', currentStep: approval.stepOrder },
    });
    await this.queue.enqueueExecution(approval.executionId, 0, approval.stepOrder);
    return { approved: true };
  }
  async pauseEntity(
    actor: AutomationActor,
    entityType: string,
    entityId: string,
    reason: string,
    ctx: AuditContext,
  ) {
    const row = await this.dbx.automationSuppression.create({
      data: { entityType, entityId, reason, createdById: actor.id },
    });
    await this.dbx.automationExecution.updateMany({
      where: {
        entityType,
        entityId,
        status: { in: ['QUEUED', 'RUNNING', 'WAITING', 'AWAITING_APPROVAL'] },
      },
      data: { status: 'SUPPRESSED', failureCode: 'AUTOMATION_SUPPRESSED', completedAt: new Date() },
    });
    await this.audit.record('AUTOMATION_ENTITY_SUPPRESSED', entityType, entityId, ctx, { reason });
    return row;
  }
  async cancel(actor: AutomationActor, id: string, ctx: AuditContext) {
    const execution = await this.dbx.automationExecution.findUnique({
      where: { id },
      include: { workflow: true },
    });
    if (!execution) throw new NotFoundException('Ejecución no encontrada');
    await this.assertWorkflow(actor, execution.workflowId, true);
    await this.queue.cancelExecution(id, execution.workflow.maxSteps);
    const row = await this.dbx.automationExecution.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    await this.audit.record('AUTOMATION_EXECUTION_CANCELLED', 'AutomationExecution', id, ctx);
    return row;
  }
  private recordStep(
    executionId: string,
    action: any,
    status: string,
    output: any,
    attempt = 0,
    failureCode?: string,
  ) {
    return this.dbx.automationStepExecution.upsert({
      where: { executionId_actionId_attempt: { executionId, actionId: action.id, attempt } },
      update: {
        status,
        output,
        failureCode,
        completedAt: ['COMPLETED', 'SKIPPED', 'FAILED'].includes(status) ? new Date() : undefined,
      },
      create: {
        executionId,
        actionId: action.id,
        stepOrder: action.stepOrder,
        status,
        attempt,
        output,
        failureCode,
        policyId: 'automations-core',
        ruleId: `ACTION_${action.type}`,
        startedAt: new Date(),
        completedAt: ['COMPLETED', 'SKIPPED', 'FAILED'].includes(status) ? new Date() : undefined,
      },
    });
  }
  private fail(executionId: string, failureCode: string) {
    return this.dbx.automationExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', failureCode, completedAt: new Date(), retries: { increment: 1 } },
    });
  }
}
