import { BadRequestException, Injectable } from '@nestjs/common';
import { ActivityType, EscalationReason, Prisma } from '@havona/database';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditContext, AuditService } from '../audit/audit.service';
import { AIToolDefinition } from '../ai/ai-provider';
import { PrismaService } from '../common/prisma.service';
import { ProspectsService } from '../prospects/prospects.service';
import { CalendarService } from '../calendar/calendar.service';
import type { HenryActor } from './henry-context.service';

type ToolContext = {
  conversationId: string;
  audit: AuditContext;
  decision?: { policyId: string; ruleId: string };
  actor?: HenryActor;
};

const optionalContact = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  interest: z.string().trim().min(2).max(60),
  message: z.string().trim().max(1200).optional(),
}).refine((value) => Boolean(value.email || value.phone), 'Se requiere correo o teléfono');

const schemas = {
  get_prospect_context: z.object({}),
  create_or_update_prospect: optionalContact,
  register_interaction: z.object({ summary: z.string().trim().min(2).max(1200) }),
  create_crm_activity: z.object({ summary: z.string().trim().min(2).max(300) }),
  create_task: z.object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1200).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    confirmedByUser: z.literal(true),
  }),
  qualify_prospect: z.object({
    intention: z.enum([
      'pension', 'educacion', 'patrimonio', 'proteccion-familiar', 'accidentes',
      'empresarios', 'socios', 'socio-unico', 'consultores', 'hablar-con-asesor',
      'agendar', 'otra-consulta',
    ]),
  }),
  request_human_escalation: z.object({
    reason: z.enum([
      'USER_REQUEST', 'SENSITIVE_CONTEXT', 'LOW_CONFIDENCE', 'UNSUPPORTED_INTENT',
      'REPEATED_ERROR', 'HIGH_VALUE_CASE', 'AUTOMATION_LIMIT', 'POLICY',
    ]),
    summary: z.string().trim().min(2).max(1200),
  }),
  get_available_consultants: z.object({}),
  request_appointment_intent: z.object({ summary: z.string().trim().min(2).max(300) }),
  get_calendar_availability: z.object({ timeMin: z.string().datetime({ offset: true }), timeMax: z.string().datetime({ offset: true }), durationMinutes: z.number().int().min(15).max(480), timezone: z.string().min(1).max(100) }),
  list_calendar_events: z.object({ timeMin: z.string().datetime({ offset: true }).optional(), timeMax: z.string().datetime({ offset: true }).optional() }),
  get_calendar_event: z.object({ eventLinkId: z.string().uuid() }),
  create_calendar_event: z.object({ title: z.string().min(2).max(240), description: z.string().max(2000).optional(), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100), attendees: z.array(z.object({ email: z.string().email() })).max(50).default([]), prospectId: z.string().uuid().optional(), opportunityId: z.string().uuid().optional(), createConference: z.boolean().default(false), confirmedByUser: z.literal(true), idempotencyKey: z.string().uuid() }),
  reschedule_calendar_event: z.object({ eventLinkId: z.string().uuid(), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100), confirmedByUser: z.literal(true), idempotencyKey: z.string().uuid() }),
  cancel_calendar_event: z.object({ eventLinkId: z.string().uuid(), reason: z.string().min(2).max(500), confirmedByUser: z.literal(true), idempotencyKey: z.string().uuid() }),
} as const;

type ToolName = keyof typeof schemas;

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

@Injectable()
export class HenryToolsService {
  readonly definitions: AIToolDefinition[] = [
    { name: 'get_prospect_context', description: 'Consulta el contexto CRM autorizado asociado a esta conversación.', parameters: objectSchema({}) },
    { name: 'create_or_update_prospect', description: 'Crea o consolida un prospecto cuando la persona ya suministró datos de contacto y autorizó su tratamiento.', parameters: objectSchema({
      name: { type: 'string' }, city: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, interest: { type: 'string' }, message: { type: 'string' },
    }, ['name', 'city', 'interest']) },
    { name: 'register_interaction', description: 'Registra un resumen factual de la interacción en el CRM asociado.', parameters: objectSchema({ summary: { type: 'string' } }, ['summary']) },
    { name: 'create_crm_activity', description: 'Agrega una actividad factual al historial del prospecto asociado.', parameters: objectSchema({ summary: { type: 'string' } }, ['summary']) },
    { name: 'create_task', description: 'Crea una tarea solo después de que el usuario interno confirme explícitamente la acción.', parameters: objectSchema({ title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }, confirmedByUser: { type: 'boolean', const: true } }, ['title', 'confirmedByUser']) },
    { name: 'qualify_prospect', description: 'Registra la intención confirmada por la persona, sin emitir recomendación financiera.', parameters: objectSchema({ intention: { type: 'string', enum: ['pension', 'educacion', 'patrimonio', 'proteccion-familiar', 'accidentes', 'empresarios', 'socios', 'socio-unico', 'consultores', 'hablar-con-asesor', 'agendar', 'otra-consulta'] } }, ['intention']) },
    { name: 'request_human_escalation', description: 'Solicita intervención humana y crea trazabilidad comercial.', parameters: objectSchema({ reason: { type: 'string', enum: ['USER_REQUEST', 'SENSITIVE_CONTEXT', 'LOW_CONFIDENCE', 'UNSUPPORTED_INTENT', 'REPEATED_ERROR', 'HIGH_VALUE_CASE', 'AUTOMATION_LIMIT', 'POLICY'] }, summary: { type: 'string' } }, ['reason', 'summary']) },
    { name: 'get_available_consultants', description: 'Comprueba si existe un responsable comercial disponible o asignado, sin exponer datos privados.', parameters: objectSchema({}) },
    { name: 'request_appointment_intent', description: 'Registra intención de agendar para que Fase 4 pueda procesarla; no crea una cita.', parameters: objectSchema({ summary: { type: 'string' } }, ['summary']) },
    { name: 'get_calendar_availability', description: 'Consulta disponibilidad real de Google Calendar dentro de las reglas configuradas.', parameters: objectSchema({ timeMin: { type: 'string' }, timeMax: { type: 'string' }, durationMinutes: { type: 'number' }, timezone: { type: 'string' } }, ['timeMin', 'timeMax', 'durationMinutes', 'timezone']) },
    { name: 'list_calendar_events', description: 'Lista citas reales del calendario propio autorizado.', parameters: objectSchema({ timeMin: { type: 'string' }, timeMax: { type: 'string' } }) },
    { name: 'get_calendar_event', description: 'Consulta el detalle de una cita propia autorizada.', parameters: objectSchema({ eventLinkId: { type: 'string' } }, ['eventLinkId']) },
    { name: 'create_calendar_event', description: 'Crea una cita real solo tras confirmación explícita.', parameters: objectSchema({ title: { type: 'string' }, description: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, timezone: { type: 'string' }, attendees: { type: 'array', items: objectSchema({ email: { type: 'string' } }, ['email']) }, prospectId: { type: 'string' }, opportunityId: { type: 'string' }, createConference: { type: 'boolean' }, confirmedByUser: { type: 'boolean', const: true }, idempotencyKey: { type: 'string' } }, ['title', 'start', 'end', 'timezone', 'confirmedByUser', 'idempotencyKey']) },
    { name: 'reschedule_calendar_event', description: 'Reprograma una cita real solo tras confirmación explícita.', parameters: objectSchema({ eventLinkId: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, timezone: { type: 'string' }, confirmedByUser: { type: 'boolean', const: true }, idempotencyKey: { type: 'string' } }, ['eventLinkId', 'start', 'end', 'timezone', 'confirmedByUser', 'idempotencyKey']) },
    { name: 'cancel_calendar_event', description: 'Cancela una cita real solo tras confirmación explícita.', parameters: objectSchema({ eventLinkId: { type: 'string' }, reason: { type: 'string' }, confirmedByUser: { type: 'boolean', const: true }, idempotencyKey: { type: 'string' } }, ['eventLinkId', 'reason', 'confirmedByUser', 'idempotencyKey']) },
  ];

  constructor(
    private readonly db: PrismaService,
    private readonly prospects: ProspectsService,
    private readonly auditService: AuditService,
    private readonly calendar: CalendarService,
  ) {}

  isAllowed(name: string): name is ToolName {
    return Object.prototype.hasOwnProperty.call(schemas, name);
  }

  async execute(name: string, rawInput: unknown, context: ToolContext): Promise<Record<string, unknown>> {
    if (!this.isAllowed(name)) throw new BadRequestException('Herramienta no autorizada');
    const parsed = schemas[name].safeParse(rawInput);
    if (!parsed.success) throw new BadRequestException('Entrada de herramienta inválida');
    const input = parsed.data as any;
    switch (name) {
      case 'get_prospect_context': return this.getProspectContext(context.conversationId);
      case 'create_or_update_prospect': return this.createProspect(input, context);
      case 'register_interaction': return this.registerInteraction(input.summary, context);
      case 'create_crm_activity': return this.createActivity(input.summary, context);
      case 'create_task': return this.createTask(input, context);
      case 'qualify_prospect': return this.qualify(input.intention, context);
      case 'request_human_escalation': return this.escalate(input.reason, input.summary, context);
      case 'get_available_consultants': return this.availableConsultants(context.conversationId);
      case 'request_appointment_intent': return this.appointmentIntent(input.summary, context);
      case 'get_calendar_availability': return this.calendar.availability(this.requireActor(context), input);
      case 'list_calendar_events': return this.calendar.listEvents(this.requireActor(context), input);
      case 'get_calendar_event': return this.calendar.getLinkedEvent(this.requireActor(context), input.eventLinkId);
      case 'create_calendar_event': return await this.calendar.createEvent(this.requireActor(context), input, input.idempotencyKey, context.audit) as Record<string, unknown>;
      case 'reschedule_calendar_event': return await this.calendar.updateEvent(this.requireActor(context), input.eventLinkId, input, input.idempotencyKey, context.audit) as Record<string, unknown>;
      case 'cancel_calendar_event': return await this.calendar.cancelEvent(this.requireActor(context), input.eventLinkId, input, input.idempotencyKey, context.audit) as Record<string, unknown>;
    }
  }

  async escalate(reason: keyof typeof EscalationReason, summary: string, context: ToolContext) {
    const conversation = await this.db.conversation.findUniqueOrThrow({
      where: { id: context.conversationId },
      select: { id: true, prospectId: true },
    });
    const assignment = conversation.prospectId
      ? await this.db.assignment.findFirst({ where: { prospectId: conversation.prospectId, endedAt: null }, orderBy: { createdAt: 'desc' } })
      : null;
    const existing = await this.db.escalation.findFirst({
      where: { conversationId: conversation.id, status: { in: ['OPEN', 'ASSIGNED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { escalationId: existing.id, status: existing.status, humanFollowUpRequested: true };
    return this.db.$transaction(async (tx) => {
      let taskId: string | undefined;
      if (conversation.prospectId && assignment) {
        const task = await tx.task.create({ data: {
          prospectId: conversation.prospectId,
          assigneeId: assignment.assigneeId,
          createdById: assignment.assignedById,
          title: 'Atender escalamiento de Henry',
          description: summary,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          priority: reason === 'HIGH_VALUE_CASE' || reason === 'SENSITIVE_CONTEXT' ? 'HIGH' : 'MEDIUM',
        } });
        taskId = task.id;
        await tx.activity.create({ data: {
          prospectId: conversation.prospectId,
          type: ActivityType.HENRY_ESCALATION_REQUESTED,
          summary: 'Henry solicitó intervención humana',
          metadata: { reason },
        } });
      }
      const escalation = await tx.escalation.create({ data: {
        conversationId: conversation.id,
        reason: reason as EscalationReason,
        summary,
        assignedToId: assignment?.assigneeId,
        status: assignment ? 'ASSIGNED' : 'OPEN',
        taskId,
        policyId: context.decision?.policyId,
        ruleId: context.decision?.ruleId,
      } });
      await tx.conversation.update({ where: { id: conversation.id }, data: { status: 'WAITING_HUMAN' } });
      await this.auditService.record('HENRY_ESCALATED', 'Conversation', conversation.id, context.audit, { reason, taskId, ...context.decision }, tx);
      return { escalationId: escalation.id, status: escalation.status, humanFollowUpRequested: true };
    });
  }

  private async conversationProspect(conversationId: string) {
    const conversation = await this.db.conversation.findUnique({ where: { id: conversationId }, select: { prospectId: true } });
    if (!conversation?.prospectId) throw new BadRequestException('La conversación aún no está asociada a un prospecto');
    return conversation.prospectId;
  }

  private async getProspectContext(conversationId: string) {
    const prospectId = await this.conversationProspect(conversationId);
    const prospect = await this.db.prospect.findUniqueOrThrow({ where: { id: prospectId }, select: {
      id: true, name: true, city: true, interest: true, status: true,
      assignments: { where: { endedAt: null }, select: { assignee: { select: { name: true } } }, take: 1 },
      opportunities: { where: { status: 'OPEN' }, select: { stage: { select: { name: true } }, priority: true }, take: 1 },
    } });
    return { prospect };
  }

  private async createProspect(input: z.infer<typeof optionalContact>, context: ToolContext) {
    const conversation = await this.db.conversation.findUniqueOrThrow({
      where: { id: context.conversationId },
      select: { privacyVersion: true },
    });
    const captured = await this.prospects.capture({
      submissionId: randomUUID(), name: input.name, city: input.city, email: input.email,
      phone: input.phone, source: 'henry-entry', landing: 'henry', interest: this.slug(input.interest),
      message: input.message, consent: { accepted: true, privacyVersion: conversation.privacyVersion }, website: '',
    }, context.audit);
    await this.db.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id: context.conversationId }, data: { prospectId: captured.id } });
      const participant = await tx.conversationParticipant.findFirst({ where: { conversationId: context.conversationId, type: 'VISITOR' } });
      if (participant) await tx.conversationParticipant.update({ where: { id: participant.id }, data: { type: 'PROSPECT', prospectId: captured.id, displayName: input.name } });
      const currentState = await tx.conversationState.findUnique({ where: { conversationId: context.conversationId } });
      const state = currentState?.state && typeof currentState.state === 'object' && !Array.isArray(currentState.state) ? currentState.state as Record<string, Prisma.JsonValue> : {};
      await tx.conversationState.update({ where: { conversationId: context.conversationId }, data: { version: { increment: 1 }, state: { ...state, prospectAssociated: true, confirmedFields: ['name', 'city', ...(input.email ? ['email'] : []), ...(input.phone ? ['phone'] : []), 'interest'] } } });
      await tx.activity.create({ data: { prospectId: captured.id, type: ActivityType.HENRY_CONVERSATION_STARTED, summary: 'Conversación iniciada con Henry' } });
    });
    return { prospectId: captured.id, associated: true };
  }

  private async registerInteraction(summary: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const interaction = await this.db.interaction.create({ data: { prospectId, actorId: null, method: 'OTHER', summary, occurredAt: new Date() } });
    return { interactionId: interaction.id };
  }

  private async createActivity(summary: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const activity = await this.db.activity.create({ data: { prospectId, type: ActivityType.HENRY_INTERACTION_RECORDED, summary } });
    return { activityId: activity.id };
  }

  private async createTask(input: { title: string; description?: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const assignment = await this.db.assignment.findFirst({ where: { prospectId, endedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!assignment) throw new BadRequestException('No existe responsable asignado; solicite escalamiento');
    const task = await this.db.task.create({ data: {
      prospectId, assigneeId: assignment.assigneeId, createdById: assignment.assignedById,
      title: input.title, description: input.description,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), priority: input.priority,
    } });
    return { taskId: task.id, created: true };
  }

  private async qualify(intention: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const currentState = await this.db.conversationState.findUnique({ where: { conversationId: context.conversationId } });
    const state = currentState?.state && typeof currentState.state === 'object' && !Array.isArray(currentState.state) ? currentState.state as Record<string, Prisma.JsonValue> : {};
    await this.db.$transaction([
      this.db.conversation.update({ where: { id: context.conversationId }, data: { intention } }),
      this.db.prospect.update({ where: { id: prospectId }, data: { interest: intention } }),
      this.db.activity.create({ data: { prospectId, type: ActivityType.PROSPECT_UPDATED, summary: 'Intención confirmada por Henry', metadata: { intention } } }),
      this.db.conversationState.update({ where: { conversationId: context.conversationId }, data: { version: { increment: 1 }, state: { ...state, intention, prospectAssociated: true, qualificationConfirmed: true } } }),
    ]);
    return { prospectId, intention, qualified: true };
  }

  private async availableConsultants(conversationId: string) {
    const conversation = await this.db.conversation.findUnique({ where: { id: conversationId }, select: { prospectId: true } });
    const assigned = conversation?.prospectId ? await this.db.assignment.findFirst({ where: { prospectId: conversation.prospectId, endedAt: null }, select: { assigneeId: true } }) : null;
    const activeCount = await this.db.user.count({ where: { isActive: true, roles: { some: { role: { name: 'CONSULTOR' } } } } });
    return { assigned: Boolean(assigned), consultantsAvailable: activeCount > 0 };
  }

  private async appointmentIntent(summary: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const activity = await this.db.activity.create({ data: { prospectId, type: ActivityType.HENRY_APPOINTMENT_INTENT, summary } });
    return { activityId: activity.id, appointmentCreated: false, status: 'INTENT_RECORDED' };
  }

  private slug(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'otra-consulta';
  }
  private requireActor(context: ToolContext) { if (!context.actor) throw new BadRequestException('La herramienta de agenda requiere sesión autenticada'); return context.actor; }
}
