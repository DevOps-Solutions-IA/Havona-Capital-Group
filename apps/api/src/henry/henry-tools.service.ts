import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ActivityType, EscalationReason, Prisma } from '@havona/database';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditContext, AuditService } from '../audit/audit.service';
import { AIToolDefinition } from '../ai/ai-provider';
import { PrismaService } from '../common/prisma.service';
import { ProspectsService } from '../prospects/prospects.service';
import { CalendarService } from '../calendar/calendar.service';
import { MeetingService } from '../meetings/meeting.service';
import { CommunicationsService } from '../communications/communications.service';
import type { HenryActor } from './henry-context.service';
import { ModuleRef } from '@nestjs/core';
import { AutomationService } from '../automations/automation.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { RagOrchestratorService } from '../knowledge/rag-orchestrator.service';
import { HenryMemoryService } from '../knowledge/memory.service';
import { TrainingService } from '../training/training.service';
import { EmailTemplateService } from '../email-templates/email-template.service';

type ToolContext = {
  conversationId: string;
  audit: AuditContext;
  decision?: { policyId: string; ruleId: string };
  actor?: HenryActor;
};

const optionalContact = z
  .object({
    name: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().min(7).max(30).optional(),
    interest: z.string().trim().min(2).max(60),
    message: z.string().trim().max(1200).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), 'Se requiere correo o teléfono');

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
      'pension',
      'educacion',
      'patrimonio',
      'proteccion-familiar',
      'accidentes',
      'empresarios',
      'socios',
      'socio-unico',
      'consultores',
      'hablar-con-asesor',
      'agendar',
      'otra-consulta',
    ]),
  }),
  request_human_escalation: z.object({
    reason: z.enum([
      'USER_REQUEST',
      'SENSITIVE_CONTEXT',
      'LOW_CONFIDENCE',
      'UNSUPPORTED_INTENT',
      'REPEATED_ERROR',
      'HIGH_VALUE_CASE',
      'AUTOMATION_LIMIT',
      'POLICY',
    ]),
    summary: z.string().trim().min(2).max(1200),
  }),
  get_available_consultants: z.object({}),
  request_appointment_intent: z.object({ summary: z.string().trim().min(2).max(300) }),
  get_calendar_availability: z.object({
    timeMin: z.string().datetime({ offset: true }),
    timeMax: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(480),
    timezone: z.string().min(1).max(100),
  }),
  list_calendar_events: z.object({
    timeMin: z.string().datetime({ offset: true }).optional(),
    timeMax: z.string().datetime({ offset: true }).optional(),
  }),
  get_calendar_event: z.object({ eventLinkId: z.string().uuid() }),
  create_calendar_event: z.object({
    title: z.string().min(2).max(240),
    description: z.string().max(2000).optional(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    timezone: z.string().min(1).max(100),
    attendees: z
      .array(z.object({ email: z.string().email() }))
      .max(50)
      .default([]),
    prospectId: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
    createConference: z.boolean().default(false),
    confirmedByUser: z.literal(true),
    idempotencyKey: z.string().uuid(),
  }),
  reschedule_calendar_event: z.object({
    eventLinkId: z.string().uuid(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    timezone: z.string().min(1).max(100),
    confirmedByUser: z.literal(true),
    idempotencyKey: z.string().uuid(),
  }),
  cancel_calendar_event: z.object({
    eventLinkId: z.string().uuid(),
    reason: z.string().min(2).max(500),
    confirmedByUser: z.literal(true),
    idempotencyKey: z.string().uuid(),
  }),
  get_meeting: z.object({ meetingId: z.string().uuid() }),
  create_meeting_for_calendar_event: z.object({
    calendarEventLinkId: z.string().uuid(),
    title: z.string().min(2).max(240),
    scheduledStartAt: z.string().datetime({ offset: true }),
    scheduledEndAt: z.string().datetime({ offset: true }),
    timezone: z.string().min(1).max(100),
    confirmedByUser: z.literal(true),
    idempotencyKey: z.string().uuid(),
  }),
  get_meeting_join_info: z.object({ meetingId: z.string().uuid() }),
  cancel_meeting: z.object({
    meetingId: z.string().uuid(),
    reason: z.string().min(2).max(500),
    confirmedByUser: z.literal(true),
  }),
  get_communication_thread: z.object({ threadId: z.string().uuid() }),
  get_recent_messages: z.object({ threadId: z.string().uuid() }),
  send_communication_message: z.object({
    threadId: z.string().uuid(),
    text: z.string().trim().min(1).max(8000),
    idempotencyKey: z.string().uuid(),
    confirmedByUser: z.literal(true),
  }),
  assign_communication_thread: z.object({
    threadId: z.string().uuid(),
    assigneeId: z.string().uuid(),
    confirmedByUser: z.literal(true),
  }),
  request_human_takeover: z.object({
    threadId: z.string().uuid(),
    confirmedByUser: z.literal(true),
  }),
  return_thread_to_henry: z.object({
    threadId: z.string().uuid(),
    confirmedByUser: z.literal(true),
  }),
  link_thread_to_crm: z.object({
    threadId: z.string().uuid(),
    prospectId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
    confirmedByUser: z.literal(true),
  }),
  close_communication_thread: z.object({
    threadId: z.string().uuid(),
    confirmedByUser: z.literal(true),
  }),
  get_automation_workflow: z.object({ workflowId: z.string().uuid() }),
  list_active_automation_workflows: z.object({}),
  get_automation_execution: z.object({ executionId: z.string().uuid() }),
  pause_automation_for_entity: z.object({
    entityType: z.string().min(2).max(60),
    entityId: z.string().uuid(),
    reason: z.string().min(3).max(160),
    confirmedByUser: z.literal(true),
  }),
  get_commercial_summary: z.object({
    preset: z.enum(['today', 'week', 'month', 'quarter', 'year']).default('month'),
  }),
  get_analytics_metric: z.object({
    metricKey: z.string().min(3).max(120),
    preset: z.enum(['today', 'week', 'month', 'quarter', 'year']).default('month'),
  }),
  get_commercial_funnel: z.object({
    preset: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  }),
  get_pipeline_health: z.object({
    preset: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  }),
  get_priority_actions: z.object({ preset: z.enum(['today', 'week', 'month']).default('today') }),
  get_team_scorecard: z.object({
    preset: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  }),
  get_goal_progress: z.object({}),
  get_analytics_data_quality: z.object({}),
  get_analytics_anomalies: z.object({
    preset: z.enum(['week', 'month', 'quarter']).default('week'),
  }),
  get_communications_performance: z.object({
    preset: z.enum(['week', 'month', 'quarter']).default('month'),
  }),
  get_automations_performance: z.object({
    preset: z.enum(['week', 'month', 'quarter']).default('month'),
  }),
  search_knowledge: z.object({
    query: z.string().trim().min(2).max(500),
    historicalAt: z.string().datetime({ offset: true }).optional(),
  }),
  get_knowledge_document: z.object({ documentId: z.string().uuid() }),
  get_training_progress: z.object({}),
  start_roleplay: z.object({
    scenarioKey: z.enum(['objection_price', 'think_about_it', 'already_insured', 'no_budget']),
  }),
  evaluate_roleplay: z.object({
    roleplayId: z.string().uuid(),
    transcript: z
      .array(
        z.object({ role: z.enum(['CONSULTANT', 'CLIENT']), content: z.string().min(1).max(4000) }),
      )
      .min(2)
      .max(100),
  }),
  get_memory: z.object({}),
  save_memory: z.object({
    key: z.string().min(2).max(120),
    value: z.union([
      z.string().max(1000),
      z.array(z.string().max(160)).max(20),
      z.record(z.string(), z.unknown()),
    ]),
    confirmedByUser: z.boolean().optional(),
  }),
  forget_memory: z.object({ memoryId: z.string().uuid(), confirmedByUser: z.literal(true) }),
  get_knowledge_gaps: z.object({}),
  list_email_templates: z.object({
    search: z.string().max(120).optional(),
    category: z.string().max(60).optional(),
  }),
  get_email_template: z.object({ templateId: z.string().uuid() }),
  create_email_draft: z.object({
    templateId: z.string().uuid(),
    recipientProspectId: z.string().uuid(),
    companyId: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
    communicationThreadId: z.string().uuid().optional(),
    calendarEventId: z.string().uuid().optional(),
    meetingId: z.string().uuid().optional(),
  }),
  personalize_email_draft: z.object({
    draftId: z.string().uuid(),
    subjectOverride: z.string().max(300).optional(),
    editableBlockOverrides: z.record(z.string().max(20000)).optional(),
  }),
  preview_email_draft: z.object({ draftId: z.string().uuid() }),
} as const;

type ToolName = keyof typeof schemas;

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

@Injectable()
export class HenryToolsService {
  readonly definitions: AIToolDefinition[] = [
    {
      name: 'get_prospect_context',
      description: 'Consulta el contexto CRM autorizado asociado a esta conversación.',
      parameters: objectSchema({}),
    },
    {
      name: 'create_or_update_prospect',
      description:
        'Crea o consolida un prospecto cuando la persona ya suministró datos de contacto y autorizó su tratamiento.',
      parameters: objectSchema(
        {
          name: { type: 'string' },
          city: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          interest: { type: 'string' },
          message: { type: 'string' },
        },
        ['name', 'city', 'interest'],
      ),
    },
    {
      name: 'register_interaction',
      description: 'Registra un resumen factual de la interacción en el CRM asociado.',
      parameters: objectSchema({ summary: { type: 'string' } }, ['summary']),
    },
    {
      name: 'create_crm_activity',
      description: 'Agrega una actividad factual al historial del prospecto asociado.',
      parameters: objectSchema({ summary: { type: 'string' } }, ['summary']),
    },
    {
      name: 'create_task',
      description:
        'Crea una tarea solo después de que el usuario interno confirme explícitamente la acción.',
      parameters: objectSchema(
        {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          confirmedByUser: { type: 'boolean', const: true },
        },
        ['title', 'confirmedByUser'],
      ),
    },
    {
      name: 'qualify_prospect',
      description:
        'Registra la intención confirmada por la persona, sin emitir recomendación financiera.',
      parameters: objectSchema(
        {
          intention: {
            type: 'string',
            enum: [
              'pension',
              'educacion',
              'patrimonio',
              'proteccion-familiar',
              'accidentes',
              'empresarios',
              'socios',
              'socio-unico',
              'consultores',
              'hablar-con-asesor',
              'agendar',
              'otra-consulta',
            ],
          },
        },
        ['intention'],
      ),
    },
    {
      name: 'request_human_escalation',
      description: 'Solicita intervención humana y crea trazabilidad comercial.',
      parameters: objectSchema(
        {
          reason: {
            type: 'string',
            enum: [
              'USER_REQUEST',
              'SENSITIVE_CONTEXT',
              'LOW_CONFIDENCE',
              'UNSUPPORTED_INTENT',
              'REPEATED_ERROR',
              'HIGH_VALUE_CASE',
              'AUTOMATION_LIMIT',
              'POLICY',
            ],
          },
          summary: { type: 'string' },
        },
        ['reason', 'summary'],
      ),
    },
    {
      name: 'get_available_consultants',
      description:
        'Comprueba si existe un responsable comercial disponible o asignado, sin exponer datos privados.',
      parameters: objectSchema({}),
    },
    {
      name: 'request_appointment_intent',
      description:
        'Registra intención de agendar para que Fase 4 pueda procesarla; no crea una cita.',
      parameters: objectSchema({ summary: { type: 'string' } }, ['summary']),
    },
    {
      name: 'get_calendar_availability',
      description:
        'Consulta disponibilidad real de Google Calendar dentro de las reglas configuradas.',
      parameters: objectSchema(
        {
          timeMin: { type: 'string' },
          timeMax: { type: 'string' },
          durationMinutes: { type: 'number' },
          timezone: { type: 'string' },
        },
        ['timeMin', 'timeMax', 'durationMinutes', 'timezone'],
      ),
    },
    {
      name: 'list_calendar_events',
      description: 'Lista citas reales del calendario propio autorizado.',
      parameters: objectSchema({ timeMin: { type: 'string' }, timeMax: { type: 'string' } }),
    },
    {
      name: 'get_calendar_event',
      description: 'Consulta el detalle de una cita propia autorizada.',
      parameters: objectSchema({ eventLinkId: { type: 'string' } }, ['eventLinkId']),
    },
    {
      name: 'create_calendar_event',
      description: 'Crea una cita real solo tras confirmación explícita.',
      parameters: objectSchema(
        {
          title: { type: 'string' },
          description: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          timezone: { type: 'string' },
          attendees: {
            type: 'array',
            items: objectSchema({ email: { type: 'string' } }, ['email']),
          },
          prospectId: { type: 'string' },
          opportunityId: { type: 'string' },
          createConference: { type: 'boolean' },
          confirmedByUser: { type: 'boolean', const: true },
          idempotencyKey: { type: 'string' },
        },
        ['title', 'start', 'end', 'timezone', 'confirmedByUser', 'idempotencyKey'],
      ),
    },
    {
      name: 'reschedule_calendar_event',
      description: 'Reprograma una cita real solo tras confirmación explícita.',
      parameters: objectSchema(
        {
          eventLinkId: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          timezone: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
          idempotencyKey: { type: 'string' },
        },
        ['eventLinkId', 'start', 'end', 'timezone', 'confirmedByUser', 'idempotencyKey'],
      ),
    },
    {
      name: 'cancel_calendar_event',
      description: 'Cancela una cita real solo tras confirmación explícita.',
      parameters: objectSchema(
        {
          eventLinkId: { type: 'string' },
          reason: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
          idempotencyKey: { type: 'string' },
        },
        ['eventLinkId', 'reason', 'confirmedByUser', 'idempotencyKey'],
      ),
    },
    {
      name: 'get_meeting',
      description: 'Consulta una reunión HAVONA autorizada.',
      parameters: objectSchema({ meetingId: { type: 'string' } }, ['meetingId']),
    },
    {
      name: 'create_meeting_for_calendar_event',
      description: 'Crea HAVONA Meet para una cita existente solo tras confirmación explícita.',
      parameters: objectSchema(
        {
          calendarEventLinkId: { type: 'string' },
          title: { type: 'string' },
          scheduledStartAt: { type: 'string' },
          scheduledEndAt: { type: 'string' },
          timezone: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
          idempotencyKey: { type: 'string' },
        },
        [
          'calendarEventLinkId',
          'title',
          'scheduledStartAt',
          'scheduledEndAt',
          'timezone',
          'confirmedByUser',
          'idempotencyKey',
        ],
      ),
    },
    {
      name: 'get_meeting_join_info',
      description: 'Obtiene acceso server-side a una reunión autorizada.',
      parameters: objectSchema({ meetingId: { type: 'string' } }, ['meetingId']),
    },
    {
      name: 'cancel_meeting',
      description: 'Cancela HAVONA Meet solo tras confirmación explícita.',
      parameters: objectSchema(
        {
          meetingId: { type: 'string' },
          reason: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
        },
        ['meetingId', 'reason', 'confirmedByUser'],
      ),
    },
    {
      name: 'get_communication_thread',
      description: 'Consulta un hilo omnicanal dentro del ámbito RBAC.',
      parameters: objectSchema({ threadId: { type: 'string' } }, ['threadId']),
    },
    {
      name: 'get_recent_messages',
      description: 'Consulta mensajes recientes autorizados sin acceder al proveedor.',
      parameters: objectSchema({ threadId: { type: 'string' } }, ['threadId']),
    },
    {
      name: 'send_communication_message',
      description:
        'Envía mediante Communications Core después de confirmación explícita y respetando canal, consentimiento y ventanas.',
      parameters: objectSchema(
        {
          threadId: { type: 'string' },
          text: { type: 'string' },
          idempotencyKey: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
        },
        ['threadId', 'text', 'idempotencyKey', 'confirmedByUser'],
      ),
    },
    {
      name: 'assign_communication_thread',
      description: 'Asigna un hilo a un responsable autorizado tras confirmación.',
      parameters: objectSchema(
        {
          threadId: { type: 'string' },
          assigneeId: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
        },
        ['threadId', 'assigneeId', 'confirmedByUser'],
      ),
    },
    {
      name: 'request_human_takeover',
      description: 'Transfiere el hilo a atención humana sin perder historial.',
      parameters: objectSchema(
        { threadId: { type: 'string' }, confirmedByUser: { type: 'boolean', const: true } },
        ['threadId', 'confirmedByUser'],
      ),
    },
    {
      name: 'return_thread_to_henry',
      description: 'Devuelve el hilo a modo Henry tras confirmación humana.',
      parameters: objectSchema(
        { threadId: { type: 'string' }, confirmedByUser: { type: 'boolean', const: true } },
        ['threadId', 'confirmedByUser'],
      ),
    },
    {
      name: 'link_thread_to_crm',
      description: 'Vincula un hilo a CRM autorizado tras confirmación.',
      parameters: objectSchema(
        {
          threadId: { type: 'string' },
          prospectId: { type: 'string' },
          companyId: { type: 'string' },
          opportunityId: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
        },
        ['threadId', 'confirmedByUser'],
      ),
    },
    {
      name: 'close_communication_thread',
      description: 'Cierra un hilo autorizado tras confirmación explícita.',
      parameters: objectSchema(
        { threadId: { type: 'string' }, confirmedByUser: { type: 'boolean', const: true } },
        ['threadId', 'confirmedByUser'],
      ),
    },
    {
      name: 'get_automation_workflow',
      description: 'Consulta un workflow autorizado de HAVONA Automations Core.',
      parameters: objectSchema({ workflowId: { type: 'string' } }, ['workflowId']),
    },
    {
      name: 'list_active_automation_workflows',
      description: 'Lista workflows activos dentro del ámbito autorizado.',
      parameters: objectSchema({}, []),
    },
    {
      name: 'get_automation_execution',
      description: 'Consulta una ejecución de automatización autorizada.',
      parameters: objectSchema({ executionId: { type: 'string' } }, ['executionId']),
    },
    {
      name: 'pause_automation_for_entity',
      description: 'Pausa automatizaciones para una entidad tras confirmación explícita.',
      parameters: objectSchema(
        {
          entityType: { type: 'string' },
          entityId: { type: 'string' },
          reason: { type: 'string' },
          confirmedByUser: { type: 'boolean', const: true },
        },
        ['entityType', 'entityId', 'reason', 'confirmedByUser'],
      ),
    },
    {
      name: 'get_commercial_summary',
      description:
        'Obtiene KPIs comerciales determinísticos, cobertura, comparación, riesgos y prioridades del ámbito autorizado.',
      parameters: objectSchema({
        preset: { type: 'string', enum: ['today', 'week', 'month', 'quarter', 'year'] },
      }),
    },
    {
      name: 'get_analytics_metric',
      description:
        'Consulta una métrica del catálogo semántico con definición, periodo, cobertura y comparación.',
      parameters: objectSchema(
        {
          metricKey: { type: 'string' },
          preset: { type: 'string', enum: ['today', 'week', 'month', 'quarter', 'year'] },
        },
        ['metricKey'],
      ),
    },
    {
      name: 'get_commercial_funnel',
      description: 'Consulta el embudo real, conversiones y tiempos por etapa.',
      parameters: objectSchema({
        preset: { type: 'string', enum: ['week', 'month', 'quarter', 'year'] },
      }),
    },
    {
      name: 'get_pipeline_health',
      description:
        'Consulta salud, aging y factores explicables de riesgo del pipeline autorizado.',
      parameters: objectSchema({
        preset: { type: 'string', enum: ['week', 'month', 'quarter', 'year'] },
      }),
    },
    {
      name: 'get_priority_actions',
      description: 'Obtiene prioridades determinísticas sustentadas por evidencia operativa.',
      parameters: objectSchema({ preset: { type: 'string', enum: ['today', 'week', 'month'] } }),
    },
    {
      name: 'get_team_scorecard',
      description: 'Consulta scorecard del equipo autorizado; no produce rankings opacos.',
      parameters: objectSchema({
        preset: { type: 'string', enum: ['week', 'month', 'quarter', 'year'] },
      }),
    },
    {
      name: 'get_goal_progress',
      description: 'Consulta metas reales visibles en el ámbito autorizado.',
      parameters: objectSchema({}),
    },
    {
      name: 'get_analytics_data_quality',
      description: 'Expone cobertura y datos faltantes que afectan la confiabilidad.',
      parameters: objectSchema({}),
    },
    {
      name: 'get_analytics_anomalies',
      description: 'Consulta anomalías explicables solo cuando existe muestra suficiente.',
      parameters: objectSchema({ preset: { type: 'string', enum: ['week', 'month', 'quarter'] } }),
    },
    {
      name: 'get_communications_performance',
      description: 'Consulta hechos operativos de Communications Core sin inferir satisfacción.',
      parameters: objectSchema({ preset: { type: 'string', enum: ['week', 'month', 'quarter'] } }),
    },
    {
      name: 'get_automations_performance',
      description:
        'Consulta ejecuciones y fallos de Automations Core sin atribuir causalidad comercial.',
      parameters: objectSchema({ preset: { type: 'string', enum: ['week', 'month', 'quarter'] } }),
    },
    {
      name: 'search_knowledge',
      description:
        'Busca exclusivamente conocimiento corporativo publicado y autorizado; devuelve evidencia y citas.',
      parameters: objectSchema({ query: { type: 'string' }, historicalAt: { type: 'string' } }, [
        'query',
      ]),
    },
    {
      name: 'get_knowledge_document',
      description: 'Consulta metadata y versiones de un documento autorizado.',
      parameters: objectSchema({ documentId: { type: 'string' } }, ['documentId']),
    },
    {
      name: 'get_training_progress',
      description: 'Consulta programas y progreso formativo del usuario actual.',
      parameters: objectSchema({}),
    },
    {
      name: 'start_roleplay',
      description: 'Inicia una simulación de entrenamiento separada de CRM.',
      parameters: objectSchema(
        {
          scenarioKey: {
            type: 'string',
            enum: ['objection_price', 'think_about_it', 'already_insured', 'no_budget'],
          },
        },
        ['scenarioKey'],
      ),
    },
    {
      name: 'evaluate_roleplay',
      description: 'Evalúa una simulación mediante rúbrica explicable.',
      parameters: objectSchema(
        {
          roleplayId: { type: 'string' },
          transcript: { type: 'array', items: { type: 'object' } },
        },
        ['roleplayId', 'transcript'],
      ),
    },
    {
      name: 'get_memory',
      description: 'Consulta memoria persistente autorizada del usuario actual.',
      parameters: objectSchema({}),
    },
    {
      name: 'save_memory',
      description:
        'Guarda una preferencia gobernada por MemoryPolicy; puede requerir confirmación.',
      parameters: objectSchema(
        { key: { type: 'string' }, value: {}, confirmedByUser: { type: 'boolean' } },
        ['key', 'value'],
      ),
    },
    {
      name: 'forget_memory',
      description: 'Elimina realmente una memoria propia después de confirmación explícita.',
      parameters: objectSchema(
        { memoryId: { type: 'string' }, confirmedByUser: { type: 'boolean', const: true } },
        ['memoryId', 'confirmedByUser'],
      ),
    },
    {
      name: 'get_knowledge_gaps',
      description: 'Consulta gaps agregados; solo administración autorizada.',
      parameters: objectSchema({}),
    },
    {
      name: 'list_email_templates',
      description: 'Encuentra plantillas autorizadas por intención, categoría y propósito.',
      parameters: objectSchema({ search: { type: 'string' }, category: { type: 'string' } }),
    },
    {
      name: 'get_email_template',
      description: 'Consulta una plantilla corporativa o personal autorizada.',
      parameters: objectSchema({ templateId: { type: 'string' } }, ['templateId']),
    },
    {
      name: 'create_email_draft',
      description: 'Crea un borrador persistente sin enviarlo y resuelve el contacto server-side.',
      parameters: objectSchema(
        {
          templateId: { type: 'string' },
          recipientProspectId: { type: 'string' },
          companyId: { type: 'string' },
          opportunityId: { type: 'string' },
          communicationThreadId: { type: 'string' },
          calendarEventId: { type: 'string' },
          meetingId: { type: 'string' },
        },
        ['templateId', 'recipientProspectId'],
      ),
    },
    {
      name: 'personalize_email_draft',
      description: 'Personaliza exclusivamente secciones editables de un borrador propio.',
      parameters: objectSchema(
        {
          draftId: { type: 'string' },
          subjectOverride: { type: 'string' },
          editableBlockOverrides: { type: 'object' },
        },
        ['draftId'],
      ),
    },
    {
      name: 'preview_email_draft',
      description: 'Renderiza preview determinista, informa faltantes y nunca envía.',
      parameters: objectSchema({ draftId: { type: 'string' } }, ['draftId']),
    },
  ];

  constructor(
    private readonly db: PrismaService,
    private readonly prospects: ProspectsService,
    private readonly auditService: AuditService,
    private readonly calendar: CalendarService,
    private readonly meetings: MeetingService,
    private readonly communications: CommunicationsService,
    private readonly analytics: AnalyticsService,
    private readonly knowledge: KnowledgeService,
    private readonly rag: RagOrchestratorService,
    private readonly memory: HenryMemoryService,
    private readonly training: TrainingService,
    private readonly emailTemplates: EmailTemplateService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  isAllowed(name: string): name is ToolName {
    return Object.prototype.hasOwnProperty.call(schemas, name);
  }

  async execute(
    name: string,
    rawInput: unknown,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    if (!this.isAllowed(name)) throw new BadRequestException('Herramienta no autorizada');
    const parsed = schemas[name].safeParse(rawInput);
    if (!parsed.success) throw new BadRequestException('Entrada de herramienta inválida');
    const input = parsed.data as any;
    switch (name) {
      case 'get_prospect_context':
        return this.getProspectContext(context.conversationId);
      case 'create_or_update_prospect':
        return this.createProspect(input, context);
      case 'register_interaction':
        return this.registerInteraction(input.summary, context);
      case 'create_crm_activity':
        return this.createActivity(input.summary, context);
      case 'create_task':
        return this.createTask(input, context);
      case 'qualify_prospect':
        return this.qualify(input.intention, context);
      case 'request_human_escalation':
        return this.escalate(input.reason, input.summary, context);
      case 'get_available_consultants':
        return this.availableConsultants(context.conversationId);
      case 'request_appointment_intent':
        return this.appointmentIntent(input.summary, context);
      case 'get_calendar_availability':
        return this.calendar.availability(this.requireActor(context), input);
      case 'list_calendar_events':
        return this.calendar.listEvents(this.requireActor(context), input);
      case 'get_calendar_event':
        return this.calendar.getLinkedEvent(this.requireActor(context), input.eventLinkId);
      case 'create_calendar_event':
        return (await this.calendar.createEvent(
          this.requireActor(context),
          input,
          input.idempotencyKey,
          context.audit,
        )) as Record<string, unknown>;
      case 'reschedule_calendar_event':
        return (await this.calendar.updateEvent(
          this.requireActor(context),
          input.eventLinkId,
          input,
          input.idempotencyKey,
          context.audit,
        )) as Record<string, unknown>;
      case 'cancel_calendar_event':
        return (await this.calendar.cancelEvent(
          this.requireActor(context),
          input.eventLinkId,
          input,
          input.idempotencyKey,
          context.audit,
        )) as Record<string, unknown>;
      case 'get_meeting':
        return (await this.meetings.get(this.requireActor(context), input.meetingId)) as Record<
          string,
          unknown
        >;
      case 'create_meeting_for_calendar_event':
        return (await this.meetings.create(
          this.requireActor(context),
          { ...input, calendarEventLinkId: input.calendarEventLinkId },
          input.idempotencyKey,
          context.audit,
        )) as Record<string, unknown>;
      case 'get_meeting_join_info':
        return (await this.meetings.join(
          this.requireActor(context),
          input.meetingId,
          context.audit,
        )) as Record<string, unknown>;
      case 'cancel_meeting':
        return (await this.meetings.cancel(
          this.requireActor(context),
          input.meetingId,
          input.reason,
          context.audit,
        )) as Record<string, unknown>;
      case 'get_communication_thread':
      case 'get_recent_messages':
        return (await this.communications.get(
          this.requireActor(context),
          input.threadId,
        )) as unknown as Record<string, unknown>;
      case 'send_communication_message':
        return (await this.communications.send(
          this.requireActor(context),
          input.threadId,
          { text: input.text, idempotencyKey: input.idempotencyKey, generatedByHenry: true },
          context.audit,
        )) as unknown as Record<string, unknown>;
      case 'assign_communication_thread':
        return (await this.communications.assign(
          this.requireActor(context),
          input.threadId,
          input.assigneeId,
          context.audit,
        )) as unknown as Record<string, unknown>;
      case 'request_human_takeover':
        return (await this.communications.setMode(
          this.requireActor(context),
          input.threadId,
          'HUMAN',
          context.audit,
        )) as unknown as Record<string, unknown>;
      case 'return_thread_to_henry':
        return (await this.communications.setMode(
          this.requireActor(context),
          input.threadId,
          'HENRY',
          context.audit,
        )) as unknown as Record<string, unknown>;
      case 'link_thread_to_crm':
        return (await this.communications.linkCrm(
          this.requireActor(context),
          input.threadId,
          {
            prospectId: input.prospectId,
            companyId: input.companyId,
            opportunityId: input.opportunityId,
          },
          context.audit,
        )) as unknown as Record<string, unknown>;
      case 'close_communication_thread':
        return (await this.communications.close(
          this.requireActor(context),
          input.threadId,
          context.audit,
        )) as unknown as Record<string, unknown>;
      case 'get_automation_workflow':
        return (await this.automation().get(
          this.requireActor(context),
          input.workflowId,
        )) as Record<string, unknown>;
      case 'list_active_automation_workflows':
        return (await this.automation().list(this.requireActor(context), {
          page: 1,
          pageSize: 25,
          status: 'ACTIVE',
        })) as Record<string, unknown>;
      case 'get_automation_execution':
        return (await this.automation().getExecution(
          this.requireActor(context),
          input.executionId,
        )) as Record<string, unknown>;
      case 'pause_automation_for_entity':
        return (await this.automation().pauseEntity(
          this.requireActor(context),
          input.entityType,
          input.entityId,
          input.reason,
          context.audit,
        )) as Record<string, unknown>;
      case 'get_commercial_summary':
        return (await this.analytics.summary(input, this.requireActor(context))) as Record<
          string,
          unknown
        >;
      case 'get_analytics_metric':
        return (await this.analytics.compareMetric(
          input.metricKey,
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'get_commercial_funnel':
        return (await this.analytics.funnel(
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'get_pipeline_health':
        return (await this.analytics.pipeline(
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'get_priority_actions':
        return { data: await this.analytics.priorities(input, this.requireActor(context)) };
      case 'get_team_scorecard':
        return { data: await this.analytics.team(input, this.requireActor(context)) };
      case 'get_goal_progress':
        return { data: await this.analytics.goals(input, this.requireActor(context)) };
      case 'get_analytics_data_quality':
        return (await this.analytics.dataQuality(
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'get_analytics_anomalies':
        return (await this.analytics.anomalies(
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'get_communications_performance':
        return (await this.analytics.communications(
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'get_automations_performance':
        return (await this.analytics.automations(
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'search_knowledge':
        return (await this.rag.retrieve(
          input.query,
          this.requireKnowledgeActor(context),
          input,
        )) as unknown as Record<string, unknown>;
      case 'get_knowledge_document':
        return (await this.knowledge.getDocument(
          input.documentId,
          this.requireKnowledgeActor(context),
        )) as unknown as Record<string, unknown>;
      case 'get_training_progress':
        return { data: await this.training.listPrograms(this.requireActor(context).id, false) };
      case 'start_roleplay':
        return (await this.training.startRoleplay(
          input.scenarioKey,
          this.requireActor(context).id,
        )) as unknown as Record<string, unknown>;
      case 'evaluate_roleplay':
        return (await this.training.evaluateRoleplay(
          input.roleplayId,
          input.transcript,
          this.requireActor(context).id,
        )) as unknown as Record<string, unknown>;
      case 'get_memory':
        return { data: await this.memory.list(this.requireActor(context).id) };
      case 'save_memory':
        return (await this.memory.save(this.requireActor(context).id, {
          key: input.key,
          value: input.value,
          confirmed: input.confirmedByUser,
          source: 'HENRY_TOOL',
        })) as unknown as Record<string, unknown>;
      case 'forget_memory':
        return (await this.memory.forget(this.requireActor(context).id, input.memoryId)) as Record<
          string,
          unknown
        >;
      case 'get_knowledge_gaps':
        return { data: await this.knowledge.gaps(this.requireKnowledgeActor(context)) };
      case 'list_email_templates':
        return { data: await this.emailTemplates.list(this.requireActor(context), input) };
      case 'get_email_template':
        return (await this.emailTemplates.get(
          input.templateId,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'create_email_draft':
        return (await this.emailTemplates.createDraft(
          { ...input, generatedByHenry: true },
          this.requireActor(context),
          context.audit,
        )) as unknown as Record<string, unknown>;
      case 'personalize_email_draft':
        return (await this.emailTemplates.updateDraft(
          input.draftId,
          input,
          this.requireActor(context),
        )) as unknown as Record<string, unknown>;
      case 'preview_email_draft':
        return (await this.emailTemplates.preview(
          input.draftId,
          this.requireActor(context),
          context.audit,
        )) as unknown as Record<string, unknown>;
    }
  }

  private automation() {
    if (!this.moduleRef) throw new BadRequestException('Automations Core no disponible');
    return this.moduleRef.get(AutomationService, { strict: false });
  }

  private requireKnowledgeActor(context: ToolContext) {
    const actor = this.requireActor(context);
    return { id: actor.id, roles: actor.roles ?? [], permissions: actor.permissions };
  }

  async escalate(reason: keyof typeof EscalationReason, summary: string, context: ToolContext) {
    const conversation = await this.db.conversation.findUniqueOrThrow({
      where: { id: context.conversationId },
      select: { id: true, prospectId: true },
    });
    const assignment = conversation.prospectId
      ? await this.db.assignment.findFirst({
          where: { prospectId: conversation.prospectId, endedAt: null },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const existing = await this.db.escalation.findFirst({
      where: { conversationId: conversation.id, status: { in: ['OPEN', 'ASSIGNED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing)
      return { escalationId: existing.id, status: existing.status, humanFollowUpRequested: true };
    return this.db.$transaction(async (tx) => {
      let taskId: string | undefined;
      if (conversation.prospectId && assignment) {
        const task = await tx.task.create({
          data: {
            prospectId: conversation.prospectId,
            assigneeId: assignment.assigneeId,
            createdById: assignment.assignedById,
            title: 'Atender escalamiento de Henry',
            description: summary,
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            priority:
              reason === 'HIGH_VALUE_CASE' || reason === 'SENSITIVE_CONTEXT' ? 'HIGH' : 'MEDIUM',
          },
        });
        taskId = task.id;
        await tx.activity.create({
          data: {
            prospectId: conversation.prospectId,
            type: ActivityType.HENRY_ESCALATION_REQUESTED,
            summary: 'Henry solicitó intervención humana',
            metadata: { reason },
          },
        });
      }
      const escalation = await tx.escalation.create({
        data: {
          conversationId: conversation.id,
          reason: reason as EscalationReason,
          summary,
          assignedToId: assignment?.assigneeId,
          status: assignment ? 'ASSIGNED' : 'OPEN',
          taskId,
          policyId: context.decision?.policyId,
          ruleId: context.decision?.ruleId,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { status: 'WAITING_HUMAN' },
      });
      await this.auditService.record(
        'HENRY_ESCALATED',
        'Conversation',
        conversation.id,
        context.audit,
        { reason, taskId, ...context.decision },
        tx,
      );
      return {
        escalationId: escalation.id,
        status: escalation.status,
        humanFollowUpRequested: true,
      };
    });
  }

  private async conversationProspect(conversationId: string) {
    const conversation = await this.db.conversation.findUnique({
      where: { id: conversationId },
      select: { prospectId: true },
    });
    if (!conversation?.prospectId)
      throw new BadRequestException('La conversación aún no está asociada a un prospecto');
    return conversation.prospectId;
  }

  private async getProspectContext(conversationId: string) {
    const prospectId = await this.conversationProspect(conversationId);
    const prospect = await this.db.prospect.findUniqueOrThrow({
      where: { id: prospectId },
      select: {
        id: true,
        name: true,
        city: true,
        interest: true,
        status: true,
        assignments: {
          where: { endedAt: null },
          select: { assignee: { select: { name: true } } },
          take: 1,
        },
        opportunities: {
          where: { status: 'OPEN' },
          select: { stage: { select: { name: true } }, priority: true },
          take: 1,
        },
      },
    });
    return { prospect };
  }

  private async createProspect(input: z.infer<typeof optionalContact>, context: ToolContext) {
    const conversation = await this.db.conversation.findUniqueOrThrow({
      where: { id: context.conversationId },
      select: { privacyVersion: true },
    });
    const captured = await this.prospects.capture(
      {
        submissionId: randomUUID(),
        name: input.name,
        city: input.city,
        email: input.email,
        phone: input.phone,
        source: 'henry-entry',
        landing: 'henry',
        interest: this.slug(input.interest),
        message: input.message,
        consent: { accepted: true, privacyVersion: conversation.privacyVersion },
        website: '',
      },
      context.audit,
    );
    await this.db.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: context.conversationId },
        data: { prospectId: captured.id },
      });
      const participant = await tx.conversationParticipant.findFirst({
        where: { conversationId: context.conversationId, type: 'VISITOR' },
      });
      if (participant)
        await tx.conversationParticipant.update({
          where: { id: participant.id },
          data: { type: 'PROSPECT', prospectId: captured.id, displayName: input.name },
        });
      const currentState = await tx.conversationState.findUnique({
        where: { conversationId: context.conversationId },
      });
      const state =
        currentState?.state &&
        typeof currentState.state === 'object' &&
        !Array.isArray(currentState.state)
          ? (currentState.state as Record<string, Prisma.JsonValue>)
          : {};
      await tx.conversationState.update({
        where: { conversationId: context.conversationId },
        data: {
          version: { increment: 1 },
          state: {
            ...state,
            prospectAssociated: true,
            confirmedFields: [
              'name',
              'city',
              ...(input.email ? ['email'] : []),
              ...(input.phone ? ['phone'] : []),
              'interest',
            ],
          },
        },
      });
      await tx.activity.create({
        data: {
          prospectId: captured.id,
          type: ActivityType.HENRY_CONVERSATION_STARTED,
          summary: 'Conversación iniciada con Henry',
        },
      });
    });
    return { prospectId: captured.id, associated: true };
  }

  private async registerInteraction(summary: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const interaction = await this.db.interaction.create({
      data: { prospectId, actorId: null, method: 'OTHER', summary, occurredAt: new Date() },
    });
    return { interactionId: interaction.id };
  }

  private async createActivity(summary: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const activity = await this.db.activity.create({
      data: { prospectId, type: ActivityType.HENRY_INTERACTION_RECORDED, summary },
    });
    return { activityId: activity.id };
  }

  private async createTask(
    input: { title: string; description?: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' },
    context: ToolContext,
  ) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const assignment = await this.db.assignment.findFirst({
      where: { prospectId, endedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!assignment)
      throw new BadRequestException('No existe responsable asignado; solicite escalamiento');
    const task = await this.db.task.create({
      data: {
        prospectId,
        assigneeId: assignment.assigneeId,
        createdById: assignment.assignedById,
        title: input.title,
        description: input.description,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        priority: input.priority,
      },
    });
    return { taskId: task.id, created: true };
  }

  private async qualify(intention: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const currentState = await this.db.conversationState.findUnique({
      where: { conversationId: context.conversationId },
    });
    const state =
      currentState?.state &&
      typeof currentState.state === 'object' &&
      !Array.isArray(currentState.state)
        ? (currentState.state as Record<string, Prisma.JsonValue>)
        : {};
    await this.db.$transaction([
      this.db.conversation.update({ where: { id: context.conversationId }, data: { intention } }),
      this.db.prospect.update({ where: { id: prospectId }, data: { interest: intention } }),
      this.db.activity.create({
        data: {
          prospectId,
          type: ActivityType.PROSPECT_UPDATED,
          summary: 'Intención confirmada por Henry',
          metadata: { intention },
        },
      }),
      this.db.conversationState.update({
        where: { conversationId: context.conversationId },
        data: {
          version: { increment: 1 },
          state: { ...state, intention, prospectAssociated: true, qualificationConfirmed: true },
        },
      }),
    ]);
    return { prospectId, intention, qualified: true };
  }

  private async availableConsultants(conversationId: string) {
    const conversation = await this.db.conversation.findUnique({
      where: { id: conversationId },
      select: { prospectId: true },
    });
    const assigned = conversation?.prospectId
      ? await this.db.assignment.findFirst({
          where: { prospectId: conversation.prospectId, endedAt: null },
          select: { assigneeId: true },
        })
      : null;
    const activeCount = await this.db.user.count({
      where: { isActive: true, roles: { some: { role: { name: 'CONSULTOR' } } } },
    });
    return { assigned: Boolean(assigned), consultantsAvailable: activeCount > 0 };
  }

  private async appointmentIntent(summary: string, context: ToolContext) {
    const prospectId = await this.conversationProspect(context.conversationId);
    const activity = await this.db.activity.create({
      data: { prospectId, type: ActivityType.HENRY_APPOINTMENT_INTENT, summary },
    });
    return { activityId: activity.id, appointmentCreated: false, status: 'INTENT_RECORDED' };
  }

  private slug(value: string) {
    return (
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'otra-consulta'
    );
  }
  private requireActor(context: ToolContext) {
    if (!context.actor)
      throw new BadRequestException('La herramienta de agenda requiere sesión autenticada');
    return context.actor;
  }
}
