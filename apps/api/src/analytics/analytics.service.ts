import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@havona/database';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { analyticsPeriod, previousPeriod } from './analytics-time';
import { METRIC_CATALOG, metricDefinition } from './metric-catalog';
import { AnalyticsActor, AnalyticsCoverage, AnalyticsPeriod, AnalyticsScope, MetricResult } from './analytics.types';

const complete = (covered: number, total = covered): AnalyticsCoverage => ({ status: 'COMPLETE', covered, total, percentage: total ? Math.round((covered / total) * 10000) / 100 : 100 });
const unavailable = (warning: string): AnalyticsCoverage => ({ status: 'NOT_AVAILABLE', covered: null, total: null, percentage: null, warning });
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; };

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

  catalog() { return { version: 1, timezoneDefault: 'America/Bogota', definitions: METRIC_CATALOG }; }

  async scope(actor: AnalyticsActor, requestedUserId?: string): Promise<AnalyticsScope> {
    if (actor.permissions.includes('analytics.read_all')) return requestedUserId ? { kind: 'GLOBAL', userIds: [requestedUserId] } : { kind: 'GLOBAL' };
    if (actor.permissions.includes('analytics.read_team')) {
      const memberships = await this.db.calendarTeamMembership.findMany({ where: { managerId: actor.id }, select: { memberId: true } });
      const allowed = [actor.id, ...memberships.map((item) => item.memberId)];
      if (requestedUserId && !allowed.includes(requestedUserId)) throw new ForbiddenException('El usuario no pertenece al ámbito analítico autorizado');
      return { kind: 'TEAM', userIds: requestedUserId ? [requestedUserId] : allowed };
    }
    if (requestedUserId && requestedUserId !== actor.id) throw new ForbiddenException('No puede consultar analítica de otro consultor');
    return { kind: 'OWN', userIds: [actor.id] };
  }

  private prospectWhere(scope: AnalyticsScope): Prisma.ProspectWhereInput {
    return scope.userIds ? { assignments: { some: { assigneeId: { in: scope.userIds }, endedAt: null } } } : {};
  }
  private opportunityWhere(scope: AnalyticsScope): Prisma.OpportunityWhereInput {
    return scope.userIds ? { ownerId: { in: scope.userIds } } : {};
  }
  private periodResult(period: AnalyticsPeriod) { return { start: period.start.toISOString(), end: period.end.toISOString(), timezone: period.timezone }; }

  async metric(key: string, query: any, actor: AnalyticsActor): Promise<MetricResult> {
    const definition = metricDefinition(key);
    if (!definition) throw new NotFoundException('Métrica no registrada en el catálogo semántico');
    const period = analyticsPeriod(query);
    const scope = await this.scope(actor, query.consultantId);
    const range = { gte: period.start, lt: period.end };
    let value: number | null = null, numerator: number | null | undefined, denominator: number | null | undefined;
    let coverage = complete(0);
    if (key === 'sales.pipeline_value') coverage = unavailable('El modelo vigente no almacena valor monetario de oportunidad.');
    else if (key === 'crm.prospects.created') value = await this.db.prospect.count({ where: { ...this.prospectWhere(scope), createdAt: range } });
    else if (key === 'crm.prospects.assigned') value = await this.db.assignment.count({ where: { ...(scope.userIds ? { assigneeId: { in: scope.userIds } } : {}), createdAt: range } });
    else if (key === 'crm.opportunities.created') value = await this.db.opportunity.count({ where: { ...this.opportunityWhere(scope), createdAt: range } });
    else if (key === 'crm.opportunities.won' || key === 'crm.opportunities.lost') value = await this.db.opportunity.count({ where: { ...this.opportunityWhere(scope), status: key.endsWith('won') ? 'WON' : 'LOST', closedAt: range } });
    else if (key === 'sales.win_rate') {
      [numerator, denominator] = await Promise.all([
        this.db.opportunity.count({ where: { ...this.opportunityWhere(scope), status: 'WON', closedAt: range } }),
        this.db.opportunity.count({ where: { ...this.opportunityWhere(scope), status: { in: ['WON', 'LOST'] }, closedAt: range } }),
      ]);
      value = denominator ? numerator / denominator : null;
      coverage = denominator ? complete(denominator) : { status: 'INSUFFICIENT_DATA', covered: 0, total: 0, percentage: null, warning: 'No existen cierres comparables en el periodo.' };
    } else if (key === 'sales.average_cycle_days') {
      const rows = await this.db.opportunity.findMany({ where: { ...this.opportunityWhere(scope), status: { in: ['WON', 'LOST'] }, closedAt: range }, select: { createdAt: true, closedAt: true } });
      const days = rows.flatMap((row) => row.closedAt ? [(row.closedAt.getTime() - row.createdAt.getTime()) / 86_400_000] : []);
      value = days.length ? days.reduce((sum, item) => sum + item, 0) / days.length : null;
      coverage = days.length ? complete(days.length) : { status: 'INSUFFICIENT_DATA', covered: 0, total: 0, percentage: null, warning: 'No existen oportunidades cerradas.' };
    } else if (key === 'activities.interactions') value = await this.db.interaction.count({ where: { ...(scope.userIds ? { actorId: { in: scope.userIds } } : {}), occurredAt: range } });
    else if (key === 'activities.tasks_completed') value = await this.db.task.count({ where: { ...(scope.userIds ? { assigneeId: { in: scope.userIds } } : {}), completedAt: range } });
    else if (key === 'activities.tasks_overdue') value = await this.db.task.count({ where: { ...(scope.userIds ? { assigneeId: { in: scope.userIds } } : {}), status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: period.end } } });
    else if (key === 'calendar.appointments_scheduled') value = await this.db.calendarEventLink.count({ where: { ...(scope.userIds ? { assignedConsultantId: { in: scope.userIds } } : {}), startAt: range } });
    else if (key === 'communications.inbound' || key === 'communications.outbound') value = await this.db.communicationMessage.count({ where: { direction: key.endsWith('inbound') ? 'INBOUND' : 'OUTBOUND', createdAt: range, ...(scope.userIds ? { thread: { assignedUserId: { in: scope.userIds } } } : {}) } });
    else if (key === 'automations.executions') value = await this.db.automationExecution.count({ where: { createdAt: range, ...(scope.userIds ? { workflow: { ownerUserId: { in: scope.userIds } } } : {}) } });
    else if (key === 'henry.conversations') value = await this.db.conversation.count({ where: { createdAt: range, ...(scope.userIds ? { participants: { some: { userId: { in: scope.userIds } } } } : {}) } });
    else if (key === 'henry.escalations') value = await this.db.escalation.count({ where: { createdAt: range, ...(scope.userIds ? { assignedToId: { in: scope.userIds } } : {}) } });
    if (value !== null && coverage.status === 'COMPLETE') coverage = complete(value);
    return { metric: key, version: definition.version, value, availability: value === null ? 'notAvailable' : 'available', numerator, denominator, period: this.periodResult(period), scope: scope.kind, coverage, source: definition.source, generatedAt: new Date().toISOString() };
  }

  async compareMetric(key: string, query: any, actor: AnalyticsActor) {
    const period = analyticsPeriod(query), previous = previousPeriod(period);
    const current = await this.metric(key, { ...query, preset: 'custom', start: period.start.toISOString(), end: new Date(period.end.getTime() - 1).toISOString() }, actor);
    const prior = await this.metric(key, { ...query, preset: 'custom', start: previous.start.toISOString(), end: new Date(previous.end.getTime() - 1).toISOString() }, actor);
    const comparable = current.value !== null && prior.value !== null;
    const absolute = comparable ? current.value! - prior.value! : null;
    const percentage = comparable && prior.value !== 0 ? absolute! / prior.value! : null;
    return { current, previous: prior, delta: { absolute, percentage, status: !comparable || prior.value === 0 ? 'NOT_COMPARABLE' : 'COMPARABLE' } };
  }

  async summary(query: any, actor: AnalyticsActor) {
    const keys = ['crm.prospects.created', 'crm.opportunities.created', 'calendar.appointments_scheduled', 'crm.opportunities.won', 'sales.win_rate', 'sales.pipeline_value'] as const;
    const metrics = await Promise.all(keys.map((key) => this.compareMetric(key, query, actor)));
    const [funnel, pipeline, priorities, goals, quality] = await Promise.all([this.funnel(query, actor), this.pipeline(query, actor), this.priorities(query, actor), this.goals(query, actor), this.dataQuality(query, actor)]);
    return { period: metrics[0]?.current.period, freshness: { status: 'LIVE', generatedAt: new Date().toISOString(), expectationMinutes: 5 }, metrics, funnel, pipeline, priorities: priorities.slice(0, 8), goals, dataQuality: quality.summary };
  }

  async funnel(query: any, actor: AnalyticsActor) {
    const period = analyticsPeriod(query), scope = await this.scope(actor, query.consultantId), range = { gte: period.start, lt: period.end };
    const stages = await this.db.pipelineStage.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } });
    const histories = await this.db.opportunityStageHistory.findMany({ where: { createdAt: range, opportunity: this.opportunityWhere(scope) }, select: { opportunityId: true, newStageId: true, createdAt: true } });
    const entered = new Map<string, Set<string>>();
    histories.forEach((item) => { const set = entered.get(item.newStageId) ?? new Set<string>(); set.add(item.opportunityId); entered.set(item.newStageId, set); });
    const durationRows = await this.db.opportunityStageHistory.findMany({ where: { opportunity: this.opportunityWhere(scope) }, orderBy: [{ opportunityId: 'asc' }, { createdAt: 'asc' }], select: { opportunityId: true, newStageId: true, createdAt: true } });
    const durations = new Map<string, number[]>();
    for (let index = 0; index < durationRows.length - 1; index++) { const current = durationRows[index]!, next = durationRows[index + 1]!; if (current.opportunityId !== next.opportunityId) continue; const list = durations.get(current.newStageId) ?? []; list.push((next.createdAt.getTime() - current.createdAt.getTime()) / 86_400_000); durations.set(current.newStageId, list); }
    const rows = stages.map((stage, index) => { const count = entered.get(stage.id)?.size ?? 0; const nextStage = stages[index + 1]; const nextCount = nextStage ? entered.get(nextStage.id)?.size ?? 0 : null; const times = durations.get(stage.id) ?? []; return { stage: { id: stage.id, key: stage.key, name: stage.name, position: stage.position }, entered: count, conversionToNext: nextCount === null || count === 0 ? null : Math.min(1, nextCount / count), averageDays: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null, medianDays: median(times), sampleSize: times.length }; });
    return { period: this.periodResult(period), scope: scope.kind, semantics: 'Cada oportunidad cuenta una vez por etapa dentro del periodo aunque reingrese. Duración usa transiciones consecutivas históricas.', stages: rows, leakage: rows.slice(0, -1).map((row, i) => ({ from: row.stage.key, to: rows[i + 1]!.stage.key, count: Math.max(0, row.entered - rows[i + 1]!.entered) })) };
  }

  async pipeline(query: any, actor: AnalyticsActor) {
    const period = analyticsPeriod(query), scope = await this.scope(actor, query.consultantId), now = new Date();
    const rows = await this.db.opportunity.findMany({ where: { ...this.opportunityWhere(scope), status: 'OPEN' }, include: { stage: true, owner: { select: { id: true, name: true } }, prospect: { select: { id: true, name: true } }, tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } }, orderBy: { dueAt: 'asc' }, take: 1 }, interactions: { orderBy: { occurredAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'asc' }, take: 500 });
    const items = rows.map((row) => { const inactivityDays = Math.floor((now.getTime() - (row.interactions[0]?.occurredAt ?? row.createdAt).getTime()) / 86_400_000); const overdue = row.tasks.some((task) => task.dueAt < now); const components = [{ factor: 'INACTIVITY', contribution: inactivityDays >= 14 ? 25 : inactivityDays >= 7 ? 12 : 0, evidence: `${inactivityDays} días sin interacción` }, { factor: 'OVERDUE_TASK', contribution: overdue ? 20 : 0, evidence: overdue ? 'Existe tarea vencida' : 'Sin tarea vencida' }, { factor: 'NO_NEXT_ACTION', contribution: row.tasks.length ? 0 : 15, evidence: row.tasks.length ? 'Existe siguiente tarea' : 'No existe siguiente tarea' }].filter((item) => item.contribution); const riskScore = components.reduce((sum, item) => sum + item.contribution, 0); return { id: row.id, title: row.title, stage: row.stage, owner: row.owner, prospect: row.prospect, inactivityDays, riskScore, riskLevel: riskScore >= 45 ? 'CRITICAL' : riskScore >= 20 ? 'WARNING' : 'INFO', components, nextAction: row.tasks[0] ?? null }; });
    return { period: this.periodResult(period), active: items.length, monetaryValue: { value: null, availability: 'notAvailable', coverage: unavailable('Opportunity no posee valor monetario ni expectedCloseAt.') }, aging: items, stalled: items.filter((item) => item.inactivityDays >= 7), methodology: { version: 1, maximumObservedScore: 60, warning: 'Risk score explicable; no representa probabilidad de pérdida.' } };
  }

  async priorities(query: any, actor: AnalyticsActor) {
    const pipeline = await this.pipeline(query, actor); const scope = await this.scope(actor, query.consultantId); const now = new Date();
    const tasks = await this.db.task.findMany({ where: { ...(scope.userIds ? { assigneeId: { in: scope.userIds } } : {}), status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } }, include: { prospect: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } }, orderBy: { dueAt: 'asc' }, take: 100 });
    return [...pipeline.stalled.map((item: any) => ({ type: 'STALLED_OPPORTUNITY', severity: item.riskLevel, entityType: 'Opportunity', entityId: item.id, title: item.title, reason: item.components.map((c: any) => c.evidence).join('; '), evidence: item.components, suggestedAction: 'SCHEDULE_FOLLOW_UP', urgency: item.riskScore })), ...tasks.map((task) => ({ type: 'OVERDUE_TASK', severity: task.priority === 'URGENT' ? 'CRITICAL' : 'WARNING', entityType: 'Task', entityId: task.id, title: task.title, reason: `Vencida desde ${task.dueAt.toISOString()}`, evidence: [{ dueAt: task.dueAt, assignee: task.assignee }], suggestedAction: 'COMPLETE_OR_RESCHEDULE_TASK', urgency: 50 }))].sort((a, b) => b.urgency - a.urgency);
  }

  async dataQuality(query: any, actor: AnalyticsActor) {
    const scope = await this.scope(actor, query.consultantId), opportunityWhere = this.opportunityWhere(scope), prospectWhere = this.prospectWhere(scope);
    const [prospects, opportunities, withoutOwner, openWithoutTask] = await Promise.all([this.db.prospect.count({ where: prospectWhere }), this.db.opportunity.count({ where: opportunityWhere }), this.db.opportunity.count({ where: { ...opportunityWhere, ownerId: null } }), this.db.opportunity.count({ where: { ...opportunityWhere, status: 'OPEN', tasks: { none: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } } })]);
    const missingSource = 0;
    const checks = [{ key: 'prospect.source', missing: missingSource, total: prospects, note: 'Source es obligatorio en el esquema; inconsistencia esperada 0.' }, { key: 'opportunity.owner', missing: withoutOwner, total: opportunities }, { key: 'opportunity.next_action', missing: openWithoutTask, total: opportunities }, { key: 'opportunity.value', missing: opportunities, total: opportunities, note: 'Campo no modelado; KPIs monetarios no disponibles.' }, { key: 'opportunity.expected_close', missing: opportunities, total: opportunities, note: 'Campo no modelado; forecast no disponible.' }].map((item) => ({ ...item, coveragePercentage: item.total ? Math.round(((item.total - item.missing) / item.total) * 10000) / 100 : null }));
    return { summary: { status: checks.some((item) => item.missing > 0) ? 'PARTIAL' : 'COMPLETE', checks: checks.length, issues: checks.reduce((sum, item) => sum + item.missing, 0) }, checks, unknownIsZero: false };
  }

  async communications(query: any, actor: AnalyticsActor) {
    const period = analyticsPeriod(query), scope = await this.scope(actor, query.consultantId), range = { gte: period.start, lt: period.end }, thread = scope.userIds ? { assignedUserId: { in: scope.userIds } } : undefined;
    const [inbound, outbound, failed, delivered, unread, escalated] = await Promise.all([
      this.db.communicationMessage.count({ where: { direction: 'INBOUND', createdAt: range, thread } }),
      this.db.communicationMessage.count({ where: { direction: 'OUTBOUND', createdAt: range, thread } }),
      this.db.communicationMessage.count({ where: { status: 'FAILED', createdAt: range, thread } }),
      this.db.communicationMessage.count({ where: { status: 'DELIVERED', createdAt: range, thread } }),
      this.db.communicationThread.count({ where: { ...(thread ?? {}), unreadCount: { gt: 0 } } }),
      this.db.communicationThread.count({ where: { ...(thread ?? {}), handlingMode: 'HUMAN', status: { in: ['OPEN', 'PENDING'] } } }),
    ]);
    return { period: this.periodResult(period), inbound, outbound, failed, delivered, deliveryRate: outbound ? delivered / outbound : null, unreadThreads: unread, escalatedThreads: escalated, satisfaction: { value: null, availability: 'notAvailable' } };
  }

  async automations(query: any, actor: AnalyticsActor) {
    const period = analyticsPeriod(query), scope = await this.scope(actor, query.consultantId), where: any = { createdAt: { gte: period.start, lt: period.end }, ...(scope.userIds ? { workflow: { ownerUserId: { in: scope.userIds } } } : {}) };
    const [total, completed, failed, approvals] = await Promise.all([this.db.automationExecution.count({ where }), this.db.automationExecution.count({ where: { ...where, status: 'COMPLETED' } }), this.db.automationExecution.count({ where: { ...where, status: 'FAILED' } }), this.db.automationApproval.count({ where: { status: 'PENDING', execution: where } })]);
    return { period: this.periodResult(period), executions: total, completed, failed, successRate: total ? completed / total : null, pendingApprovals: approvals, attributionWarning: 'Interacción con automatización no implica causalidad comercial.' };
  }

  async henry(query: any, actor: AnalyticsActor) {
    const period = analyticsPeriod(query), scope = await this.scope(actor, query.consultantId), range = { gte: period.start, lt: period.end }, conversationScope = scope.userIds ? { participants: { some: { userId: { in: scope.userIds } } } } : {};
    const [conversations, escalations, executions, failures, usage] = await Promise.all([this.db.conversation.count({ where: { ...conversationScope, createdAt: range } }), this.db.escalation.count({ where: { createdAt: range, ...(scope.userIds ? { assignedToId: { in: scope.userIds } } : {}) } }), this.db.aIExecution.count({ where: { startedAt: range, conversation: conversationScope } }), this.db.aIExecution.count({ where: { startedAt: range, status: 'FAILED', conversation: conversationScope } }), this.db.aIUsage.aggregate({ where: { execution: { startedAt: range, conversation: conversationScope } }, _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true } })]);
    return { period: this.periodResult(period), conversations, escalations, executions, failures, resolutionWithoutEscalation: conversations ? Math.max(0, conversations - escalations) / conversations : null, usage: { inputTokens: usage._sum.inputTokens ?? 0, outputTokens: usage._sum.outputTokens ?? 0, costUsd: usage._sum.estimatedCostUsd?.toNumber() ?? null, costLabel: usage._sum.estimatedCostUsd == null ? 'notAvailable' : 'provider-reported-or-estimated-as-stored' } };
  }

  async goals(query: any, actor: AnalyticsActor) { const scope = await this.scope(actor, query.consultantId); return this.db.analyticsGoal.findMany({ where: { ...(scope.userIds ? { OR: [{ scopeUserId: { in: scope.userIds } }, { scopeType: 'ORGANIZATION', ...(scope.kind === 'OWN' ? { scopeUserId: null } : {}) }] } : {}), status: query.status ?? 'ACTIVE' }, orderBy: { periodEnd: 'asc' } }); }
  async createGoal(input: any, actor: AnalyticsActor, request: any) {
    const definition = metricDefinition(input.metricKey); if (!definition || definition.unit === 'CURRENCY') throw new BadRequestException('Métrica no disponible para metas');
    if (input.scopeUserId) await this.scope(actor, input.scopeUserId);
    const row = await this.db.analyticsGoal.create({ data: { metricKey: input.metricKey, targetValue: new Prisma.Decimal(input.targetValue), unit: definition.unit, scopeType: input.scopeType, scopeUserId: input.scopeUserId, periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd), timezone: input.timezone ?? 'America/Bogota', createdById: actor.id } });
    await this.audit.record('ANALYTICS_GOAL_CREATED', 'AnalyticsGoal', row.id, { actorUserId: actor.id, ipAddress: request.ip, userAgent: request.headers?.['user-agent'] }, { metricKey: row.metricKey, scopeType: row.scopeType }); return row;
  }
  async updateGoal(id: string, input: any, actor: AnalyticsActor, request: any) { const existing = await this.db.analyticsGoal.findUnique({ where: { id } }); if (!existing) throw new NotFoundException('Meta no encontrada'); if (existing.scopeUserId) await this.scope(actor, existing.scopeUserId); const row = await this.db.analyticsGoal.update({ where: { id }, data: { ...(input.targetValue !== undefined ? { targetValue: new Prisma.Decimal(input.targetValue) } : {}), status: input.status } }); await this.audit.record('ANALYTICS_GOAL_UPDATED', 'AnalyticsGoal', id, { actorUserId: actor.id, ipAddress: request.ip, userAgent: request.headers?.['user-agent'] }, { status: row.status }); return row; }

  async team(query: any, actor: AnalyticsActor) { const scope = await this.scope(actor); if (scope.kind === 'OWN') throw new ForbiddenException('Sin acceso a analítica de equipo'); const ids = scope.userIds ?? (await this.db.user.findMany({ where: { isActive: true }, select: { id: true } })).map((u) => u.id); const users = await this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }); return Promise.all(users.map(async (user) => ({ user, prospects: (await this.metric('crm.prospects.created', { ...query, consultantId: user.id }, actor)).value, opportunities: (await this.metric('crm.opportunities.created', { ...query, consultantId: user.id }, actor)).value, overdueTasks: (await this.metric('activities.tasks_overdue', { ...query, consultantId: user.id }, actor)).value, winRate: (await this.metric('sales.win_rate', { ...query, consultantId: user.id }, actor)).value }))); }

  async anomalies(query: any, actor: AnalyticsActor) { const current = await this.compareMetric('activities.tasks_overdue', query, actor); if (current.current.value === null || current.previous.value === null || current.previous.value < 5) return { data: [], status: 'INSUFFICIENT_DATA', reason: 'Se requieren al menos 5 observaciones en el periodo base.' }; const ratio = current.current.value / current.previous.value; return { data: ratio >= 1.5 ? [{ metric: 'activities.tasks_overdue', observed: current.current.value, baseline: current.previous.value, magnitude: ratio, confidence: 'RULE_BASED', explanation: 'Incremento igual o superior a 50% frente al periodo equivalente.' }] : [], status: 'AVAILABLE' }; }
}
