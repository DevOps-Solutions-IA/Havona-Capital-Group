export type EmailAutomationPolicy =
  | 'MANUAL_ONLY'
  | 'HENRY_DRAFT_ONLY'
  | 'HENRY_CONFIRM_SEND'
  | 'AUTOMATION_WITH_APPROVAL'
  | 'AUTOMATION_ALLOWED';
export type EmailCtaType =
  | 'REPLY'
  | 'SCHEDULE'
  | 'JOIN_MEETING'
  | 'VIEW_DOCUMENT'
  | 'SEND_DOCUMENTS'
  | 'CONFIRM'
  | 'CONTACT_CONSULTANT';
export type EmailClassification =
  'TRANSACTIONAL' | 'RELATIONSHIP' | 'SERVICE' | 'COMMERCIAL' | 'MARKETING';

export type CorporateEmailDefinition = {
  key: string;
  name: string;
  category: string;
  purpose: string;
  lifecycleStage: string;
  classification: EmailClassification;
  locale: 'es-CO';
  description: string;
  allowedRoles: Array<'CONSULTOR' | 'GERENTE' | 'ADMIN' | 'SUPER_ADMIN'>;
  automationPolicy: EmailAutomationPolicy;
  automationEligible: boolean;
  autoSendPolicy: 'NEVER' | 'ONLY_WITH_EVIDENCE_AND_CONTROLS';
  approvalPolicy: 'HUMAN_REQUIRED' | 'POLICY_CONTROLLED';
  requiredVariables: string[];
  optionalVariables: string[];
  allowedAttachments: Array<'NONE' | 'AUTHORIZED_KNOWLEDGE' | 'AUTHORIZED_COMMUNICATION'>;
  attachmentRequired: boolean;
  calendarAware: boolean;
  meetingAware: boolean;
  knowledgeAware: boolean;
  triggerEvents: string[];
  stopEvents: string[];
  followUpAction: string;
  requiredEvidence: string[];
  editableSections: string[];
  lockedSections: string[];
  subject: string;
  subjectAlternatives: string[];
  preheader: string;
  introduction: string;
  body: string;
  cta: { type: EmailCtaType; label: string };
  tonePolicy: 'SERENE_CONSULTATIVE';
  lengthPolicy: 'SHORT' | 'STANDARD';
  legalPolicyReference: string;
  consentPolicyReference: string;
  contentOwner: 'COMMERCIAL' | 'OPERATIONS' | 'SERVICE' | 'COMPLIANCE';
  legalStatus: 'LEGAL_REVIEW_REQUIRED';
  version: 1;
};

type DefinitionInput = Omit<
  CorporateEmailDefinition,
  | 'locale'
  | 'allowedRoles'
  | 'automationEligible'
  | 'autoSendPolicy'
  | 'approvalPolicy'
  | 'optionalVariables'
  | 'allowedAttachments'
  | 'attachmentRequired'
  | 'calendarAware'
  | 'meetingAware'
  | 'knowledgeAware'
  | 'editableSections'
  | 'lockedSections'
  | 'tonePolicy'
  | 'lengthPolicy'
  | 'legalPolicyReference'
  | 'consentPolicyReference'
  | 'legalStatus'
  | 'version'
> &
  Partial<CorporateEmailDefinition>;

const define = (input: DefinitionInput): CorporateEmailDefinition => ({
  locale: 'es-CO',
  allowedRoles: ['CONSULTOR', 'GERENTE', 'ADMIN', 'SUPER_ADMIN'],
  automationEligible: ['AUTOMATION_ALLOWED', 'AUTOMATION_WITH_APPROVAL'].includes(
    input.automationPolicy,
  ),
  autoSendPolicy:
    input.automationPolicy === 'AUTOMATION_ALLOWED' ? 'ONLY_WITH_EVIDENCE_AND_CONTROLS' : 'NEVER',
  approvalPolicy:
    input.automationPolicy === 'AUTOMATION_ALLOWED' ? 'POLICY_CONTROLLED' : 'HUMAN_REQUIRED',
  optionalVariables: ['consultant.phone', 'company.name', 'opportunity.name', 'product.name'],
  allowedAttachments: ['NONE'],
  attachmentRequired: false,
  calendarAware: false,
  meetingAware: false,
  knowledgeAware: false,
  editableSections: ['personal-note', 'cta'],
  lockedSections: ['identity', 'legal', 'unsubscribe', 'footer'],
  tonePolicy: 'SERENE_CONSULTATIVE',
  lengthPolicy: 'SHORT',
  legalPolicyReference: 'corporate.footer.default:LEGAL_REVIEW_REQUIRED',
  legalStatus: 'LEGAL_REVIEW_REQUIRED',
  version: 1,
  ...input,
  consentPolicyReference: ['COMMERCIAL', 'MARKETING'].includes(input.classification)
    ? 'commercial.unsubscribe'
    : 'communications.consent.by-classification',
});

const commonStops = [
  'COMMUNICATION_REPLY_RECEIVED',
  'CONTACT_OPTED_OUT',
  'HUMAN_TAKEOVER_STARTED',
  'THREAD_PAUSED',
  'OPPORTUNITY_CLOSED',
  'WORKFLOW_CANCELLED',
];
const clientConsultant = ['client.firstName', 'consultant.fullName'];
const copy = (
  key: string,
  name: string,
  category: string,
  purpose: string,
  lifecycleStage: string,
  subject: string,
  preheader: string,
  body: string,
  cta: CorporateEmailDefinition['cta'],
  automationPolicy: EmailAutomationPolicy,
  triggerEvents: string[],
  followUpAction: string,
  extra: Partial<CorporateEmailDefinition> = {},
) =>
  define({
    key,
    name,
    category,
    purpose,
    lifecycleStage,
    classification: 'RELATIONSHIP',
    description: purpose,
    automationPolicy,
    requiredVariables: clientConsultant,
    triggerEvents,
    stopEvents: commonStops,
    followUpAction,
    requiredEvidence: [],
    subject,
    subjectAlternatives: [],
    preheader,
    introduction: '<p>Hola {{client.firstName}},</p>',
    body,
    cta,
    contentOwner: 'COMMERCIAL',
    ...extra,
  });

export const CORPORATE_EMAIL_LIBRARY: readonly CorporateEmailDefinition[] = [
  copy(
    'prospecting.introduction',
    'Presentación inicial',
    'PROSPECTING',
    'Iniciar una conversación consultiva',
    'NEW',
    'Una conversación para conocer sus prioridades',
    'Un primer contacto claro y sin presión.',
    '<p>Quisiera conocer sus prioridades y entender si podemos orientarle de manera útil.</p>',
    { type: 'REPLY', label: 'Responder este correo' },
    'HENRY_CONFIRM_SEND',
    ['PROSPECT_ASSIGNED'],
    'WAIT_FOR_REPLY',
    { classification: 'COMMERCIAL' },
  ),
  copy(
    'prospecting.referral',
    'Contacto por referido',
    'PROSPECTING',
    'Presentarse con una referencia autorizada',
    'NEW',
    'Contacto por recomendación',
    'Contexto breve para iniciar la conversación.',
    '<p>Recibimos una referencia autorizada para contactarle. Me gustaría confirmar si es un buen momento para conversar.</p>',
    { type: 'REPLY', label: 'Confirmar disponibilidad' },
    'HENRY_CONFIRM_SEND',
    ['REFERRAL_RECORDED'],
    'WAIT_FOR_REPLY',
    { requiredEvidence: ['AUTHORIZED_REFERRAL_SOURCE'], classification: 'COMMERCIAL' },
  ),
  copy(
    'prospecting.inbound',
    'Respuesta a solicitud recibida',
    'PROSPECTING',
    'Atender una solicitud entrante',
    'NEW',
    'Recibimos su solicitud',
    'Siguiente paso para atender su consulta.',
    '<p>Gracias por comunicarse con HAVONA CAPITAL GROUP. Revisaremos el contexto compartido para orientarle en el siguiente paso.</p>',
    { type: 'REPLY', label: 'Completar contexto' },
    'AUTOMATION_WITH_APPROVAL',
    ['INBOUND_LEAD_RECEIVED'],
    'CREATE_TASK',
    { requiredEvidence: ['INBOUND_REQUEST'] },
  ),
  copy(
    'prospecting.corporate',
    'Primer contacto empresarial',
    'PROSPECTING',
    'Abrir conversación con una empresa',
    'NEW',
    'Conversación sobre prioridades de {{company.name}}',
    'Un contacto ejecutivo para entender el contexto de la empresa.',
    '<p>Me gustaría comprender las prioridades actuales de {{company.name}} y acordar si tiene sentido una conversación inicial.</p>',
    { type: 'SCHEDULE', label: 'Coordinar conversación' },
    'MANUAL_ONLY',
    ['COMPANY_CONTACT_AUTHORIZED'],
    'SUGGEST_MEETING',
    {
      requiredVariables: [...clientConsultant, 'company.name'],
      classification: 'COMMERCIAL',
    },
  ),
  copy(
    'prospecting.reactivation',
    'Reactivación respetuosa',
    'PROSPECTING',
    'Retomar una conversación inactiva',
    'REACTIVATION',
    '¿Tiene sentido retomar nuestra conversación?',
    'Una invitación breve para confirmar interés actual.',
    '<p>Ha pasado un tiempo desde nuestro último contacto. Quisiera confirmar si desea retomar la conversación o prefiere que la dejemos en pausa.</p>',
    { type: 'REPLY', label: 'Indicar preferencia' },
    'AUTOMATION_WITH_APPROVAL',
    ['PROSPECT_INACTIVE'],
    'WAIT_FOR_REPLY',
    { requiredEvidence: ['INACTIVITY_PERIOD_MET'], classification: 'COMMERCIAL' },
  ),
  copy(
    'prospecting.no_response_followup',
    'Seguimiento sin respuesta',
    'PROSPECTING',
    'Realizar un único seguimiento después de un contacto sin respuesta',
    'CONTACTED',
    'Seguimiento a mi mensaje anterior',
    'Una confirmación breve antes de cerrar el pendiente.',
    '<p>Quería confirmar si pudo revisar mi mensaje anterior. Si no es el momento adecuado, puedo dejar el contacto en pausa.</p>',
    { type: 'REPLY', label: 'Responder o pausar' },
    'AUTOMATION_WITH_APPROVAL',
    ['COMMUNICATION_NO_REPLY'],
    'WAIT_FOR_REPLY',
    {
      requiredEvidence: ['PRIOR_OUTBOUND_MESSAGE', 'NO_REPLY_WINDOW_MET'],
      classification: 'COMMERCIAL',
    },
  ),

  copy(
    'meeting.confirmation',
    'Confirmación de reunión',
    'MEETINGS',
    'Confirmar una cita real',
    'APPOINTMENT_SCHEDULED',
    'Confirmación de nuestra reunión',
    'Fecha, hora y zona horaria de la cita.',
    '<p>Nuestra reunión está programada para el {{appointment.date}} a las {{appointment.time}} ({{appointment.timezone}}).</p>',
    { type: 'CONFIRM', label: 'Confirmar asistencia' },
    'AUTOMATION_ALLOWED',
    ['CALENDAR_EVENT_SCHEDULED'],
    'NO_ACTION',
    {
      classification: 'TRANSACTIONAL',
      requiredVariables: [
        ...clientConsultant,
        'appointment.date',
        'appointment.time',
        'appointment.timezone',
      ],
      calendarAware: true,
      requiredEvidence: ['CALENDAR_EVENT_CONFIRMED'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'meeting.reminder',
    'Recordatorio de reunión',
    'MEETINGS',
    'Recordar una cita confirmada',
    'APPOINTMENT_SCHEDULED',
    'Recordatorio de nuestra reunión',
    'Información práctica para la cita programada.',
    '<p>Le recordamos nuestra reunión del {{appointment.date}} a las {{appointment.time}} ({{appointment.timezone}}).</p>',
    { type: 'JOIN_MEETING', label: 'Entrar a la reunión' },
    'AUTOMATION_ALLOWED',
    ['CALENDAR_BEFORE_APPOINTMENT'],
    'NO_ACTION',
    {
      classification: 'TRANSACTIONAL',
      requiredVariables: [
        ...clientConsultant,
        'appointment.date',
        'appointment.time',
        'appointment.timezone',
      ],
      calendarAware: true,
      meetingAware: true,
      requiredEvidence: ['CALENDAR_EVENT_CONFIRMED'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'meeting.reschedule',
    'Reprogramación de reunión',
    'MEETINGS',
    'Comunicar una reprogramación confirmada',
    'APPOINTMENT_RESCHEDULED',
    'Nueva fecha para nuestra reunión',
    'Detalle actualizado de la cita.',
    '<p>La reunión quedó reprogramada para el {{appointment.date}} a las {{appointment.time}} ({{appointment.timezone}}).</p>',
    { type: 'CONFIRM', label: 'Confirmar nueva fecha' },
    'AUTOMATION_ALLOWED',
    ['CALENDAR_EVENT_RESCHEDULED'],
    'NO_ACTION',
    {
      classification: 'TRANSACTIONAL',
      requiredVariables: [
        ...clientConsultant,
        'appointment.date',
        'appointment.time',
        'appointment.timezone',
      ],
      calendarAware: true,
      requiredEvidence: ['CALENDAR_RESCHEDULE_CONFIRMED'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'meeting.cancellation',
    'Cancelación de reunión',
    'MEETINGS',
    'Confirmar una cancelación real',
    'APPOINTMENT_CANCELLED',
    'Confirmación de cancelación de reunión',
    'Registro claro de la cancelación.',
    '<p>Confirmamos la cancelación de la reunión programada. Si desea retomarla más adelante, puede responder este correo.</p>',
    { type: 'REPLY', label: 'Solicitar nueva fecha' },
    'AUTOMATION_WITH_APPROVAL',
    ['CALENDAR_EVENT_CANCELLED'],
    'NO_ACTION',
    {
      classification: 'TRANSACTIONAL',
      requiredEvidence: ['CALENDAR_CANCELLATION_CONFIRMED'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'meeting.no_show_followup',
    'Seguimiento de inasistencia',
    'MEETINGS',
    'Retomar una cita con inasistencia comprobada',
    'APPOINTMENT_NO_SHOW',
    'Sobre la reunión que teníamos programada',
    'Una opción respetuosa para reprogramar.',
    '<p>No logramos encontrarnos en la reunión programada. Si desea, podemos buscar una nueva fecha.</p>',
    { type: 'SCHEDULE', label: 'Reprogramar reunión' },
    'HENRY_DRAFT_ONLY',
    ['MEETING_NO_SHOW_EVIDENCE_RECORDED'],
    'CREATE_TASK',
    {
      requiredEvidence: ['ATTENDANCE_PROVIDER_EVENT_OR_EXPLICIT_MARK'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'meeting.post_meeting_summary',
    'Resumen posterior a reunión',
    'MEETINGS',
    'Confirmar acuerdos reales posteriores a una cita',
    'APPOINTMENT_COMPLETED',
    'Resumen y próximos pasos de nuestra reunión',
    'Acuerdos confirmados para continuar.',
    '<p>Gracias por la conversación. He preparado un resumen de los puntos confirmados y los próximos pasos para su revisión.</p>',
    { type: 'REPLY', label: 'Confirmar el resumen' },
    'HENRY_DRAFT_ONLY',
    ['MEETING_COMPLETED_EVIDENCE'],
    'CREATE_TASK',
    {
      requiredEvidence: ['MEETING_COMPLETED_EVIDENCE', 'HUMAN_CONFIRMED_SUMMARY'],
      contentOwner: 'OPERATIONS',
    },
  ),

  copy(
    'proposal.thank_you',
    'Agradecimiento posterior',
    'PROPOSAL',
    'Agradecer una conversación previa a propuesta',
    'PROPOSAL',
    'Gracias por la conversación',
    'Continuidad clara después de revisar sus prioridades.',
    '<p>Gracias por el tiempo y el contexto compartido. Continuaremos con la información confirmada durante la conversación.</p>',
    { type: 'REPLY', label: 'Agregar información' },
    'HENRY_DRAFT_ONLY',
    ['MEETING_COMPLETED_EVIDENCE'],
    'CREATE_TASK',
  ),
  copy(
    'proposal.information_request',
    'Solicitud de información',
    'PROPOSAL',
    'Solicitar información necesaria y conocida',
    'PROPOSAL',
    'Información pendiente para continuar',
    'Detalle de los elementos necesarios para el siguiente paso.',
    '<p>Para continuar con el análisis necesitamos completar la información indicada en este correo.</p>',
    { type: 'SEND_DOCUMENTS', label: 'Enviar información' },
    'HENRY_DRAFT_ONLY',
    ['MISSING_INFORMATION_CONFIRMED'],
    'WAIT_FOR_REPLY',
    { requiredEvidence: ['CONFIRMED_MISSING_FIELDS'] },
  ),
  copy(
    'proposal.delivery',
    'Entrega de propuesta',
    'PROPOSAL',
    'Entregar una propuesta realmente preparada',
    'PROPOSAL',
    'Propuesta preparada para su revisión',
    'Documento y contexto para revisar con calma.',
    '<p>Adjunto encontrará la propuesta preparada con base en la información revisada. Podemos conversar sobre cualquier inquietud antes de avanzar.</p>',
    { type: 'VIEW_DOCUMENT', label: 'Revisar propuesta' },
    'MANUAL_ONLY',
    ['PROPOSAL_PREPARED'],
    'SCHEDULE_FOLLOW_UP',
    {
      allowedAttachments: ['AUTHORIZED_KNOWLEDGE', 'AUTHORIZED_COMMUNICATION'],
      attachmentRequired: true,
      requiredEvidence: ['AUTHORIZED_PROPOSAL_ATTACHMENT'],
      knowledgeAware: true,
    },
  ),
  copy(
    'proposal.followup',
    'Seguimiento de propuesta',
    'PROPOSAL',
    'Dar seguimiento a una propuesta entregada',
    'FOLLOW_UP',
    'Seguimiento a la propuesta compartida',
    'Espacio para resolver preguntas y acordar el siguiente paso.',
    '<p>Quisiera confirmar si pudo revisar la propuesta y si existe algún punto que debamos aclarar.</p>',
    { type: 'REPLY', label: 'Compartir comentarios' },
    'HENRY_CONFIRM_SEND',
    ['PROPOSAL_DELIVERED'],
    'WAIT_FOR_REPLY',
    { requiredEvidence: ['PROPOSAL_DELIVERY_RECORDED'] },
  ),
  copy(
    'proposal.thinking',
    'Cliente en consideración',
    'PROPOSAL',
    'Acompañar una decisión sin presión',
    'FOLLOW_UP',
    'Información para continuar cuando lo considere oportuno',
    'Un canal abierto para resolver dudas pendientes.',
    '<p>Entiendo que desea tomarse un tiempo para revisar la información. Quedo disponible para aclarar dudas cuando lo considere oportuno.</p>',
    { type: 'REPLY', label: 'Enviar una pregunta' },
    'HENRY_DRAFT_ONLY',
    ['DECISION_DEFERRED_RECORDED'],
    'SCHEDULE_FOLLOW_UP',
    { requiredEvidence: ['EXPLICIT_DECISION_DEFERRED'] },
  ),
  copy(
    'proposal.decision_pending',
    'Decisión pendiente',
    'PROPOSAL',
    'Confirmar el estado de una decisión pendiente',
    'FOLLOW_UP',
    'Confirmación del siguiente paso',
    'Una consulta breve para mantener el proceso actualizado.',
    '<p>Quisiera confirmar si necesita información adicional o si debemos acordar un siguiente paso.</p>',
    { type: 'REPLY', label: 'Indicar siguiente paso' },
    'MANUAL_ONLY',
    ['DECISION_PENDING_CONFIRMED'],
    'CREATE_TASK',
  ),

  copy(
    'onboarding.documents_request',
    'Solicitud inicial de documentos',
    'ONBOARDING_ISSUANCE',
    'Solicitar documentos autorizados',
    'ONBOARDING',
    'Documentos necesarios para continuar',
    'Lista confirmada para avanzar con el proceso.',
    '<p>Para continuar necesitamos los documentos indicados en esta comunicación. Envíelos únicamente por el canal autorizado.</p>',
    { type: 'SEND_DOCUMENTS', label: 'Enviar documentos' },
    'HENRY_DRAFT_ONLY',
    ['DOCUMENTS_REQUESTED'],
    'WAIT_FOR_REPLY',
    { requiredEvidence: ['AUTHORIZED_DOCUMENT_CHECKLIST'], contentOwner: 'OPERATIONS' },
  ),
  copy(
    'onboarding.missing_documents',
    'Documentos pendientes',
    'ONBOARDING_ISSUANCE',
    'Informar documentos faltantes comprobados',
    'ONBOARDING',
    'Documentos pendientes en su proceso',
    'Detalle de los elementos que aún hacen falta.',
    '<p>Al revisar el proceso identificamos documentos pendientes. El detalle debe corresponder al registro operativo vigente.</p>',
    { type: 'SEND_DOCUMENTS', label: 'Completar documentos' },
    'HENRY_DRAFT_ONLY',
    ['DOCUMENTS_MISSING_CONFIRMED'],
    'WAIT_FOR_REPLY',
    { requiredEvidence: ['CONFIRMED_MISSING_DOCUMENTS'], contentOwner: 'OPERATIONS' },
  ),
  copy(
    'documents.received_confirmation',
    'Confirmación de documentos recibidos',
    'ONBOARDING_ISSUANCE',
    'Confirmar recepción real de documentos',
    'ONBOARDING',
    'Confirmación de documentos recibidos',
    'Registro de recepción y próximo paso.',
    '<p>Confirmamos la recepción de los documentos registrados. Nuestro equipo continuará con la revisión correspondiente.</p>',
    { type: 'REPLY', label: 'Informar una novedad' },
    'AUTOMATION_ALLOWED',
    ['DOCUMENTS_RECEIVED_CONFIRMED'],
    'CREATE_TASK',
    {
      classification: 'TRANSACTIONAL',
      requiredEvidence: ['DOCUMENT_STORAGE_RECEIPT'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'onboarding.application_received',
    'Solicitud recibida',
    'ONBOARDING_ISSUANCE',
    'Confirmar recepción de solicitud',
    'ONBOARDING',
    'Confirmación de solicitud recibida',
    'Su solicitud quedó registrada para revisión.',
    '<p>Confirmamos que la solicitud fue recibida y quedó registrada para la revisión correspondiente.</p>',
    { type: 'REPLY', label: 'Reportar una corrección' },
    'AUTOMATION_ALLOWED',
    ['APPLICATION_RECEIVED_CONFIRMED'],
    'NO_ACTION',
    {
      classification: 'TRANSACTIONAL',
      requiredEvidence: ['APPLICATION_RECEIPT'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'onboarding.status_update',
    'Actualización de proceso',
    'ONBOARDING_ISSUANCE',
    'Comunicar un estado operativo verificado',
    'ONBOARDING',
    'Actualización sobre su proceso',
    'Estado confirmado y próximos pasos disponibles.',
    '<p>Tenemos una actualización confirmada sobre su proceso. El detalle incluido debe corresponder al registro operativo vigente.</p>',
    { type: 'CONTACT_CONSULTANT', label: 'Consultar el estado' },
    'HENRY_DRAFT_ONLY',
    ['APPLICATION_STATUS_CHANGED'],
    'NO_ACTION',
    { requiredEvidence: ['AUTHORITATIVE_PROCESS_STATUS'], contentOwner: 'OPERATIONS' },
  ),
  copy(
    'onboarding.policy_issued',
    'Confirmación de emisión',
    'ONBOARDING_ISSUANCE',
    'Comunicar emisión comprobada',
    'ISSUED',
    'Confirmación de emisión',
    'Información disponible después de una emisión verificada.',
    '<p>Confirmamos que el proceso registra una emisión. Revise la documentación oficial antes de considerar cualquier condición como definitiva.</p>',
    { type: 'VIEW_DOCUMENT', label: 'Revisar documentación' },
    'MANUAL_ONLY',
    ['POLICY_ISSUED_EVIDENCE'],
    'CREATE_TASK',
    {
      classification: 'TRANSACTIONAL',
      requiredEvidence: ['AUTHORITATIVE_POLICY_ISSUED_EVIDENCE'],
      allowedAttachments: ['AUTHORIZED_KNOWLEDGE', 'AUTHORIZED_COMMUNICATION'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'onboarding.welcome',
    'Bienvenida',
    'ONBOARDING_ISSUANCE',
    'Dar bienvenida después de confirmación operativa',
    'CLIENT',
    'Bienvenido a HAVONA CAPITAL GROUP',
    'Canales y acompañamiento para esta nueva etapa.',
    '<p>Gracias por confiar en HAVONA CAPITAL GROUP. Su consultor será el punto de contacto para acompañar las próximas gestiones.</p>',
    { type: 'CONTACT_CONSULTANT', label: 'Contactar al consultor' },
    'HENRY_CONFIRM_SEND',
    ['CLIENT_STATUS_CONFIRMED'],
    'NO_ACTION',
    {
      classification: 'SERVICE',
      requiredEvidence: ['CLIENT_STATUS_CONFIRMED'],
      contentOwner: 'SERVICE',
    },
  ),

  copy(
    'service.periodic_review',
    'Revisión periódica',
    'SERVICE_RETENTION',
    'Invitar a una revisión de servicio',
    'CLIENT',
    'Revisión periódica de su información',
    'Un espacio para revisar cambios y próximos pasos.',
    '<p>Es un buen momento para revisar si su información y prioridades continúan vigentes.</p>',
    { type: 'SCHEDULE', label: 'Coordinar revisión' },
    'AUTOMATION_WITH_APPROVAL',
    ['SERVICE_REVIEW_DUE'],
    'SUGGEST_MEETING',
    {
      classification: 'SERVICE',
      requiredEvidence: ['SERVICE_REVIEW_DUE'],
      contentOwner: 'SERVICE',
    },
  ),
  copy(
    'service.data_update',
    'Actualización de datos',
    'SERVICE_RETENTION',
    'Solicitar actualización de datos autorizados',
    'CLIENT',
    'Actualización de información de contacto',
    'Mantengamos sus datos operativos al día.',
    '<p>Quisiéramos confirmar si sus datos de contacto requieren alguna actualización.</p>',
    { type: 'REPLY', label: 'Actualizar información' },
    'AUTOMATION_WITH_APPROVAL',
    ['DATA_REVIEW_DUE'],
    'WAIT_FOR_REPLY',
    { classification: 'SERVICE', contentOwner: 'SERVICE' },
  ),
  copy(
    'service.coverage_review',
    'Revisión de información vigente',
    'SERVICE_RETENTION',
    'Proponer revisión sustentada en documentos vigentes',
    'CLIENT',
    'Revisión de la información vigente',
    'Un espacio para revisar documentación autorizada.',
    '<p>Podemos revisar juntos la información vigente y resolver preguntas con base en la documentación autorizada.</p>',
    { type: 'SCHEDULE', label: 'Coordinar revisión' },
    'HENRY_DRAFT_ONLY',
    ['SERVICE_REVIEW_DUE'],
    'SUGGEST_MEETING',
    {
      classification: 'SERVICE',
      knowledgeAware: true,
      requiredEvidence: ['PUBLISHED_KNOWLEDGE_SOURCE'],
      contentOwner: 'SERVICE',
    },
  ),
  copy(
    'service.anniversary',
    'Aniversario de relación',
    'SERVICE_RETENTION',
    'Reconocer una fecha real de relación',
    'CLIENT',
    'Un año más acompañando su proceso',
    'Agradecimiento sobrio por la relación.',
    '<p>Queremos agradecerle por permitirnos acompañar su proceso durante este periodo.</p>',
    { type: 'REPLY', label: 'Continuar la conversación' },
    'HENRY_DRAFT_ONLY',
    ['RELATIONSHIP_ANNIVERSARY_CONFIRMED'],
    'NO_ACTION',
    {
      classification: 'RELATIONSHIP',
      requiredEvidence: ['RELATIONSHIP_START_DATE'],
      contentOwner: 'SERVICE',
    },
  ),
  copy(
    'service.post_sale',
    'Seguimiento posterior',
    'SERVICE_RETENTION',
    'Verificar acompañamiento después del cierre',
    'CLIENT',
    'Seguimiento a su proceso',
    'Un espacio para confirmar que cuenta con la información necesaria.',
    '<p>Quisiera confirmar que cuenta con la información necesaria y conocer si existe algún pendiente operativo.</p>',
    { type: 'REPLY', label: 'Informar un pendiente' },
    'HENRY_CONFIRM_SEND',
    ['POST_SALE_REVIEW_DUE'],
    'CREATE_TASK',
    { classification: 'SERVICE', contentOwner: 'SERVICE' },
  ),

  copy(
    'payment.pending',
    'Pago pendiente informado',
    'PAYMENT_CONTINUITY',
    'Comunicar un estado pendiente proveniente de fuente autorizada',
    'PAYMENT',
    'Información pendiente sobre su proceso de pago',
    'Consulte el estado confirmado antes de realizar una acción.',
    '<p>Existe un estado pendiente registrado por la fuente operativa autorizada. Su consultor puede ayudarle a revisar el siguiente paso.</p>',
    { type: 'CONTACT_CONSULTANT', label: 'Consultar con el consultor' },
    'MANUAL_ONLY',
    ['FUTURE_PAYMENT_STATUS_EVENT'],
    'CREATE_TASK',
    {
      classification: 'TRANSACTIONAL',
      requiredEvidence: ['AUTHORITATIVE_PAYMENT_STATUS'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'payment.failed',
    'Fallo de pago confirmado',
    'PAYMENT_CONTINUITY',
    'Comunicar un fallo confirmado por proveedor autorizado',
    'PAYMENT',
    'Novedad confirmada en el proceso de pago',
    'Orientación para revisar una novedad operativa.',
    '<p>La fuente operativa autorizada reportó una novedad en el proceso. No realice pagos por enlaces distintos de los canales oficiales.</p>',
    { type: 'CONTACT_CONSULTANT', label: 'Solicitar orientación' },
    'MANUAL_ONLY',
    ['FUTURE_PAYMENT_FAILURE_EVENT'],
    'CREATE_TASK',
    {
      classification: 'TRANSACTIONAL',
      requiredEvidence: ['AUTHORITATIVE_PAYMENT_FAILURE'],
      contentOwner: 'OPERATIONS',
    },
  ),
  copy(
    'payment.continuity_reminder',
    'Recordatorio de continuidad',
    'PAYMENT_CONTINUITY',
    'Recordar una gestión de continuidad comprobada',
    'PAYMENT',
    'Recordatorio sobre una gestión pendiente',
    'Revise una gestión operativa confirmada.',
    '<p>Le recordamos una gestión pendiente registrada por una fuente operativa autorizada.</p>',
    { type: 'CONTACT_CONSULTANT', label: 'Revisar con el consultor' },
    'MANUAL_ONLY',
    ['FUTURE_PAYMENT_CONTINUITY_EVENT'],
    'CREATE_TASK',
    {
      classification: 'SERVICE',
      requiredEvidence: ['AUTHORITATIVE_PAYMENT_STATUS'],
      contentOwner: 'OPERATIONS',
    },
  ),

  copy(
    'cancellation.retention',
    'Conversación previa a cancelación',
    'CANCELLATION_RECOVERY',
    'Comprender una solicitud de cancelación sin presión',
    'CANCELLATION',
    'Sobre su solicitud',
    'Confirmemos el contexto y el siguiente paso adecuado.',
    '<p>Recibimos su solicitud. Antes de continuar, queremos confirmar que comprendemos correctamente el contexto y sus instrucciones.</p>',
    { type: 'CONTACT_CONSULTANT', label: 'Hablar con el consultor' },
    'MANUAL_ONLY',
    ['CANCELLATION_REQUEST_RECEIVED'],
    'CREATE_TASK',
    {
      classification: 'SERVICE',
      requiredEvidence: ['EXPLICIT_CANCELLATION_REQUEST'],
      contentOwner: 'SERVICE',
    },
  ),
  copy(
    'cancellation.confirmation',
    'Confirmación de cancelación',
    'CANCELLATION_RECOVERY',
    'Confirmar una cancelación ejecutada por fuente autorizada',
    'CANCELLED',
    'Confirmación sobre su solicitud de cancelación',
    'Registro de una operación confirmada.',
    '<p>Confirmamos que la solicitud registra el estado informado por la fuente operativa autorizada. Conserve la documentación oficial relacionada.</p>',
    { type: 'CONTACT_CONSULTANT', label: 'Solicitar soporte' },
    'MANUAL_ONLY',
    ['CANCELLATION_COMPLETED_EVIDENCE'],
    'NO_ACTION',
    {
      classification: 'TRANSACTIONAL',
      requiredEvidence: ['AUTHORITATIVE_CANCELLATION_COMPLETED'],
      contentOwner: 'OPERATIONS',
    },
  ),
];

export const CORPORATE_EMAIL_LIBRARY_BY_KEY = new Map(
  CORPORATE_EMAIL_LIBRARY.map((definition) => [definition.key, definition]),
);
