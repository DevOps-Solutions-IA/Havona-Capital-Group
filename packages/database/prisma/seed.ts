import { PrismaClient } from '@prisma/client';
import { CORPORATE_EMAIL_LIBRARY } from '../../contracts/src/email-library';
import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
const db = new PrismaClient();
const permissions = [
  ['users.read', 'Consultar usuarios'],
  ['users.create', 'Crear usuarios'],
  ['users.update', 'Editar usuarios'],
  ['users.status', 'Activar o desactivar usuarios'],
  ['users.roles', 'Asignar roles'],
  ['users.reset_password', 'Restablecer contraseñas'],
  ['roles.read', 'Consultar roles y permisos'],
  ['settings.read', 'Consultar configuración'],
  ['settings.update', 'Modificar configuración'],
  ['audit.read', 'Consultar auditoría'],
  ['prospects.read', 'Consultar prospectos captados'],
  ['crm.read_all', 'Consultar todos los registros comerciales'],
  ['crm.read_assigned', 'Consultar registros comerciales asignados'],
  ['crm.assign', 'Asignar y reasignar responsables'],
  ['crm.update', 'Editar información comercial'],
  ['crm.opportunities', 'Crear y mover oportunidades'],
  ['crm.tasks.manage', 'Gestionar tareas de otros usuarios'],
  ['crm.tasks.own', 'Gestionar tareas propias'],
  ['crm.notes', 'Gestionar notas e interacciones internas'],
  ['crm.close', 'Cerrar oportunidades'],
  ['crm.dashboard', 'Consultar métricas comerciales globales'],
  ['henry.read_all', 'Consultar todas las conversaciones de Henry'],
  ['henry.read_assigned', 'Consultar conversaciones de Henry asignadas'],
  ['henry.dashboard', 'Consultar métricas reales de Henry'],
  ['henry.escalations.manage', 'Gestionar escalamientos de Henry'],
  ['calendar.connect', 'Conectar y seleccionar Google Calendar'],
  ['calendar.read', 'Consultar agenda y disponibilidad propias'],
  ['calendar.manage_own', 'Crear, reprogramar y cancelar citas propias'],
  ['calendar.manage_team', 'Gestionar agenda del equipo autorizado'],
  ['meeting.read', 'Consultar reuniones autorizadas'],
  ['meeting.create', 'Crear reuniones corporativas'],
  ['meeting.manage_own', 'Gestionar reuniones propias'],
  ['meeting.manage_team', 'Gestionar reuniones del equipo autorizado'],
  ['meeting.join', 'Ingresar a reuniones autorizadas'],
  ['meeting.admin', 'Administrar configuración de reuniones'],
  ['communications.read', 'Consultar comunicaciones autorizadas'],
  ['communications.send', 'Enviar comunicaciones autorizadas'],
  ['communications.manage_own', 'Gestionar comunicaciones propias o asignadas'],
  ['communications.manage_team', 'Gestionar comunicaciones del equipo autorizado'],
  ['communications.assign', 'Asignar comunicaciones a responsables autorizados'],
  ['communications.takeover', 'Transferir atención entre humano y Henry'],
  ['communications.link_crm', 'Vincular comunicaciones con CRM autorizado'],
  ['communications.admin', 'Administrar Communications Core'],
  ['automations.read', 'Consultar workflows y ejecuciones autorizadas'],
  ['automations.create', 'Crear workflows estructurados'],
  ['automations.manage_own', 'Gestionar automatizaciones propias'],
  ['automations.manage_team', 'Gestionar automatizaciones del equipo autorizado'],
  ['automations.activate', 'Activar, pausar y archivar workflows'],
  ['automations.approve', 'Resolver aprobaciones de automatización asignadas'],
  ['automations.admin', 'Administrar HAVONA Automations Core'],
  ['analytics.read', 'Consultar analítica comercial autorizada'],
  ['analytics.read_team', 'Consultar analítica del equipo autorizado'],
  ['analytics.read_all', 'Consultar analítica comercial global'],
  ['analytics.goals.manage', 'Crear y actualizar objetivos comerciales'],
  ['analytics.export', 'Exportar datasets analíticos autorizados'],
  ['analytics.admin', 'Administrar HAVONA Analytics Core'],
  ['knowledge.read', 'Consultar conocimiento corporativo autorizado'],
  ['knowledge.upload', 'Crear documentos y versiones de conocimiento'],
  ['knowledge.review', 'Revisar conocimiento procesado'],
  ['knowledge.publish', 'Aprobar, publicar y deprecar conocimiento'],
  ['knowledge.admin', 'Administrar colecciones y permisos de conocimiento'],
  ['training.read', 'Consultar formación asignada'],
  ['training.manage', 'Administrar programas y evaluaciones'],
  ['training.read_team', 'Consultar progreso formativo del equipo autorizado'],
  ['memory.manage_own', 'Consultar y gobernar memoria propia de Henry'],
  ['email_templates.read', 'Consultar catálogo y plantillas de correo autorizadas'],
  ['email_templates.create_personal', 'Crear variantes personales de plantillas corporativas'],
  ['email_templates.edit_personal', 'Editar plantillas y variantes personales propias'],
  ['email_templates.manage_corporate', 'Crear, versionar y activar plantillas corporativas'],
  ['email_templates.approve', 'Aprobar versiones corporativas de correo'],
  [
    'email_templates.legal_approve',
    'Registrar revisión jurídica humana de plantillas corporativas',
  ],
  ['email_templates.preview', 'Crear, editar y previsualizar borradores autorizados'],
] as const;
const grants: Record<string, string[]> = {
  SUPER_ADMIN: permissions.map(([key]) => key),
  ADMIN: permissions.map(([key]) => key).filter((key) => !['settings.update'].includes(key)),
  GERENTE: [
    'users.read',
    'roles.read',
    'settings.read',
    'prospects.read',
    'crm.read_all',
    'crm.read_assigned',
    'crm.assign',
    'crm.update',
    'crm.opportunities',
    'crm.tasks.manage',
    'crm.tasks.own',
    'crm.notes',
    'crm.close',
    'crm.dashboard',
    'henry.read_all',
    'henry.read_assigned',
    'henry.dashboard',
    'henry.escalations.manage',
    'calendar.connect',
    'calendar.read',
    'calendar.manage_own',
    'calendar.manage_team',
    'meeting.read',
    'meeting.create',
    'meeting.manage_own',
    'meeting.manage_team',
    'meeting.join',
    'communications.read',
    'communications.send',
    'communications.manage_own',
    'communications.manage_team',
    'communications.assign',
    'communications.takeover',
    'communications.link_crm',
    'automations.read',
    'automations.create',
    'automations.manage_own',
    'automations.manage_team',
    'automations.activate',
    'automations.approve',
    'analytics.read',
    'analytics.read_team',
    'analytics.goals.manage',
    'analytics.export',
    'knowledge.read',
    'knowledge.upload',
    'knowledge.review',
    'training.read',
    'training.manage',
    'training.read_team',
    'memory.manage_own',
    'email_templates.read',
    'email_templates.create_personal',
    'email_templates.edit_personal',
    'email_templates.preview',
  ],
  CONSULTOR: [
    'settings.read',
    'crm.read_assigned',
    'crm.update',
    'crm.opportunities',
    'crm.tasks.own',
    'crm.notes',
    'crm.close',
    'henry.read_assigned',
    'calendar.connect',
    'calendar.read',
    'calendar.manage_own',
    'meeting.read',
    'meeting.create',
    'meeting.manage_own',
    'meeting.join',
    'communications.read',
    'communications.send',
    'communications.manage_own',
    'communications.takeover',
    'communications.link_crm',
    'automations.read',
    'automations.manage_own',
    'automations.approve',
    'analytics.read',
    'knowledge.read',
    'training.read',
    'memory.manage_own',
    'email_templates.read',
    'email_templates.create_personal',
    'email_templates.edit_personal',
    'email_templates.preview',
  ],
};
async function main() {
  for (const [key, description] of permissions)
    await db.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  for (const name of Object.keys(grants)) {
    const role = await db.role.upsert({
      where: { name },
      update: { description: `Rol ${name}` },
      create: { name, description: `Rol ${name}` },
    });
    const granted = await db.permission.findMany({ where: { key: { in: grants[name] } } });
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: granted.map((p) => p.id) } },
    });
    for (const permission of granted)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
  }
  await db.systemSetting.upsert({
    where: { key: 'security.session_ttl_hours' },
    update: {},
    create: {
      key: 'security.session_ttl_hours',
      value: 12,
      description: 'Duración de sesiones en horas',
    },
  });
  await db.systemSetting.upsert({
    where: { key: 'calendar.availability_defaults' },
    update: {},
    create: {
      key: 'calendar.availability_defaults',
      value: {
        timezone: 'America/Bogota',
        workingDays: [1, 2, 3, 4, 5],
        workStart: '08:00',
        workEnd: '18:00',
        minimumNoticeMinutes: 120,
        defaultMeetingDuration: 45,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        maximumFutureBookingDays: 90,
      },
      description: 'Reglas corporativas predeterminadas de disponibilidad',
    },
  });
  for (const [key, name] of [
    ['direct', 'Directo'],
    ['organic', 'Orgánico'],
    ['campaign', 'Campaña'],
    ['referral', 'Referido'],
    ['henry-entry', 'Entrada Henry'],
  ] as const) {
    await db.leadSource.upsert({
      where: { key },
      update: { name, isActive: true },
      create: { key, name },
    });
  }
  const stages = [
    ['new', 'Nuevo'],
    ['contacted', 'Contactado'],
    ['conversing', 'Conversando'],
    ['qualified', 'Calificado'],
    ['appointment-scheduled', 'Cita agendada'],
    ['appointment-completed', 'Cita realizada'],
    ['proposal', 'Propuesta'],
    ['follow-up', 'Seguimiento'],
    ['closed', 'Cerrado'],
    ['client', 'Cliente'],
  ] as const;
  for (const [index, [key, name]] of stages.entries())
    await db.pipelineStage.upsert({
      where: { key },
      update: { name, position: index + 1, isActive: true },
      create: { key, name, position: index + 1 },
    });
  const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
  const name = process.env.INITIAL_SUPER_ADMIN_NAME?.trim() || 'Super Administrador';
  if (!email || !password)
    throw new Error('INITIAL_SUPER_ADMIN_EMAIL y INITIAL_SUPER_ADMIN_PASSWORD son obligatorias');
  if (password.length < 12)
    throw new Error('INITIAL_SUPER_ADMIN_PASSWORD debe tener al menos 12 caracteres');
  const role = await db.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
  const existing = await db.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await db.user.create({
      data: {
        email,
        name,
        passwordHash: await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
      },
    }));
  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  for (const definition of CORPORATE_EMAIL_LIBRARY) {
    let emailTemplate = await db.emailTemplate.findFirst({
      where: { key: definition.key, locale: definition.locale, isCorporate: true },
      include: { versions: { where: { version: definition.version }, take: 1 } },
    });
    const governance = {
      allowedRoles: definition.allowedRoles,
      automationPolicy: definition.automationPolicy,
      automationEligible: definition.automationEligible,
      autoSendPolicy: definition.autoSendPolicy,
      approvalPolicy: definition.approvalPolicy,
      requiredEvidence: definition.requiredEvidence,
      triggerEvents: definition.triggerEvents,
      stopEvents: definition.stopEvents,
      followUpAction: definition.followUpAction,
      cta: definition.cta,
      allowedAttachments: definition.allowedAttachments,
      attachmentRequired: definition.attachmentRequired,
      calendarAware: definition.calendarAware,
      meetingAware: definition.meetingAware,
      knowledgeAware: definition.knowledgeAware,
      editableSections: definition.editableSections,
      lockedSections: definition.lockedSections,
      legalPolicyReference: definition.legalPolicyReference,
      consentPolicyReference: definition.consentPolicyReference,
    };
    if (!emailTemplate)
      emailTemplate = await db.emailTemplate.create({
        data: {
          key: definition.key,
          name: definition.name,
          description: definition.description,
          category: definition.category,
          purpose: definition.purpose,
          lifecycleStage: definition.lifecycleStage,
          scope: 'CORPORATE',
          locale: definition.locale,
          status: 'REVIEW',
          isCorporate: true,
          tags: [definition.lifecycleStage.toLowerCase(), definition.cta.type.toLowerCase()],
          governance,
          contentOwner: definition.contentOwner,
          createdById: user.id,
          updatedById: user.id,
        },
        include: { versions: { where: { version: definition.version }, take: 1 } },
      });
    else
      await db.emailTemplate.update({
        where: { id: emailTemplate.id },
        data: {
          name: definition.name,
          description: definition.description,
          category: definition.category,
          purpose: definition.purpose,
          lifecycleStage: definition.lifecycleStage,
          governance,
          contentOwner: definition.contentOwner,
          updatedById: user.id,
        },
      });
    if (!emailTemplate.versions.length) {
      const blocks = [
        {
          id: 'introduction',
          type: 'INTRODUCTION',
          mode: 'STRUCTURED_EDITABLE',
          content: definition.introduction,
        },
        { id: 'body', type: 'BODY', mode: 'LOCKED', content: definition.body },
        { id: 'personal-note', type: 'BODY', mode: 'FREE_EDITABLE', content: '<p></p>' },
        {
          id: 'cta',
          type: 'CTA',
          mode: 'STRUCTURED_EDITABLE',
          content: `<p>${definition.cta.label}</p>`,
        },
        {
          id: 'identity',
          type: 'FOOTER',
          mode: 'LOCKED',
          content: '<p>HAVONA CAPITAL GROUP<br>{{consultant.fullName}}</p>',
        },
        ...(definition.classification === 'COMMERCIAL' || definition.classification === 'MARKETING'
          ? [
              {
                id: 'unsubscribe',
                type: 'UNSUBSCRIBE',
                mode: 'LOCKED',
                content: '<p>LEGAL_REVIEW_REQUIRED: commercial.unsubscribe</p>',
              },
            ]
          : []),
      ];
      await db.emailTemplateVersion.create({
        data: {
          templateId: emailTemplate.id,
          version: definition.version,
          locale: definition.locale,
          status: 'REVIEW',
          subject: definition.subject,
          preheader: definition.preheader,
          blocks,
          variableContract: {
            required: definition.requiredVariables,
            optional: definition.optionalVariables,
          },
          messageClassification: definition.classification,
          subjectAlternatives: definition.subjectAlternatives,
          contentPolicy: governance,
          legalStatus: definition.legalStatus,
          checksum: createHash('sha256')
            .update(JSON.stringify({ definition, blocks }))
            .digest('hex'),
          createdById: user.id,
        },
      });
    }
  }
  const templates = [
    ['Seguimiento prospecto nuevo', 'PROSPECT_CREATED', 'Prospect'],
    ['Recordatorio de cita', 'CALENDAR_EVENT_SCHEDULED', 'CalendarEventLink'],
    ['Seguimiento post-cita', 'CALENDAR_AFTER_APPOINTMENT', 'CalendarEventLink'],
    ['Reactivación de prospecto inactivo', 'PROSPECT_INACTIVE', 'Prospect'],
    ['Escalamiento por cliente sin respuesta', 'COMMUNICATION_NO_REPLY', 'CommunicationThread'],
    ['Notificación de entrega fallida', 'COMMUNICATION_DELIVERY_FAILED', 'CommunicationThread'],
  ] as const;
  for (const [workflowName, triggerType, entityType] of templates)
    await db.automationWorkflow.upsert({
      where: { name_version: { name: workflowName, version: 1 } },
      update: {},
      create: {
        name: workflowName,
        description: `Plantilla corporativa desactivada para ${workflowName.toLowerCase()}`,
        status: 'DRAFT',
        scope: 'TEAM',
        version: 1,
        createdById: user.id,
        ownerUserId: user.id,
        triggers: { create: { type: triggerType, definition: { entityType } } },
        actions: {
          create: {
            stepOrder: 1,
            type: 'CREATE_CRM_TASK',
            definition: { title: workflowName, assignee: 'ENTITY_OWNER' },
            approvalMode: 'AUTO',
          },
        },
      },
    });
  const cadenceLibrary = [
    [
      'prospecting.followup_basic',
      'Seguimiento básico de prospección',
      'Seguimiento respetuoso después del primer contacto',
    ],
    [
      'proposal.followup_basic',
      'Seguimiento básico de propuesta',
      'Seguimiento de una propuesta con evidencia de envío',
    ],
    [
      'meeting.post_meeting',
      'Seguimiento posterior a reunión',
      'Continuidad posterior a una reunión confirmada',
    ],
    [
      'documents.pending',
      'Documentos pendientes',
      'Solicitud controlada de documentación pendiente',
    ],
    ['service.review', 'Revisión de servicio', 'Seguimiento periódico de servicio autorizado'],
    [
      'reactivation.basic',
      'Reactivación conservadora',
      'Reactivación limitada de prospectos inactivos con consentimiento',
    ],
  ] as const;
  for (const [key, cadenceName, purpose] of cadenceLibrary) {
    const cadence = await db.communicationCadence.upsert({
      where: { key },
      update: { name: cadenceName, purpose },
      create: { key, name: cadenceName, purpose, status: 'DRAFT', createdById: user.id },
    });
    const version = await db.cadenceVersion.findUnique({
      where: { cadenceId_version: { cadenceId: cadence.id, version: 1 } },
    });
    if (!version)
      await db.cadenceVersion.create({
        data: {
          cadenceId: cadence.id,
          version: 1,
          status: 'DRAFT',
          allowedRoles: ['CONSULTOR', 'GERENTE', 'ADMIN', 'SUPER_ADMIN'],
          channelPolicy: { channels: ['EMAIL'] },
          enrollmentConditions: { consentRequired: true, duplicateActiveEnrollment: false },
          stopConditions: [
            'CUSTOMER_REPLIED',
            'OPT_OUT',
            'SUPPRESSED',
            'HUMAN_TAKEOVER',
            'THREAD_PAUSED',
            'THREAD_CLOSED',
            'OPPORTUNITY_CLOSED',
            'MANUAL_STOP',
          ],
          approvalPolicy: 'APPROVAL_REQUIRED',
          frequencyPolicy: { maxPerDay: 1, maxPerSevenDays: 3, minimumIntervalMinutes: 1440 },
          sendingWindow: {
            days: [1, 2, 3, 4, 5],
            start: '08:00',
            end: '18:00',
            timezone: 'America/Bogota',
          },
          maxLifetimeDays: 30,
          steps: {
            create: {
              stepOrder: 1,
              type: 'END',
              delayMinutes: 0,
              approvalMode: 'HUMAN_ONLY',
              requiredEvidence: [],
              definition: { structuralOnly: true },
            },
          },
        },
      });
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
