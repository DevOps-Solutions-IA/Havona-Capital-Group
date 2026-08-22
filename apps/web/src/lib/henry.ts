import { api, ApiError, API_URL } from './api';

export type HenryMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  status: string;
  createdAt: string;
};

export type HenrySession = { id: string; accessToken: string };
export type HenryExperienceRole =
  'PUBLIC' | 'CLIENT' | 'CONSULTANT' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
export type HenryActivityStatus = 'online' | 'thinking' | 'action' | 'escalating' | 'error';
export type HenryPageContext = {
  pageType:
    | 'public-home'
    | 'public-solution'
    | 'henry-full'
    | 'dashboard'
    | 'prospect-list'
    | 'prospect-detail'
    | 'company-detail'
    | 'pipeline'
    | 'tasks'
    | 'agenda'
    | 'communications'
    | 'automations'
    | 'analytics'
    | 'knowledge'
    | 'training'
    | 'clients'
    | 'companies'
    | 'consultants'
    | 'meetings'
    | 'administration'
    | 'henry-admin'
    | 'other';
  section?: string;
  intentHint?: string;
  entityType?: 'prospect' | 'company' | 'opportunity';
  entityId?: string;
  selectedStage?: string;
};
export type HenryConversation = {
  id: string;
  status: string;
  intention?: string;
  prospectAssociated: boolean;
  messages: HenryMessage[];
};
export type HenryMessagingOperation = {
  draft: null | {
    id: string;
    preview: {
      subject: string;
      text: string;
      messageClassification: string;
      attachmentReferences?: unknown[];
      missingVariables: string[];
    };
  };
  operation: null | {
    id: string;
    intent: 'EMAIL_SEND' | 'EMAIL_SCHEDULE';
    status: string;
    confirmationExpiresAt?: string;
    scheduledAt?: string;
    timezone?: string;
    communicationMessageId?: string;
  };
};

const tokenHeader = (token: string) => ({ 'X-Henry-Token': token });
const errorMessage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as { error?: unknown }).error;
  return error &&
    typeof error === 'object' &&
    typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : undefined;
};

export function createHenryConversation(
  entryPoint = 'henry',
  pageContext?: HenryPageContext,
  internal = false,
) {
  return api<{
    data: HenrySession & { status: string; providerConfigured: boolean; messages: HenryMessage[] };
  }>(`/henry/${internal ? 'internal/' : ''}conversations`, {
    method: 'POST',
    body: JSON.stringify({
      channel: 'WEB',
      consent: { accepted: true, privacyVersion: 'privacy-v1' },
      entryPoint,
      pageContext,
    }),
  });
}

export function getHenryConversation(session: HenrySession, internal = false) {
  return api<{ data: HenryConversation }>(
    `/henry/${internal ? 'internal/' : ''}conversations/${session.id}`,
    { headers: tokenHeader(session.accessToken) },
  );
}

export function sendHenryMessage(
  session: HenrySession,
  content: string,
  messageId: string,
  pageContext?: HenryPageContext,
  internal = false,
) {
  return api<{ data: { status: string; message: HenryMessage | null } }>(
    `/henry/${internal ? 'internal/' : ''}conversations/${session.id}/messages`,
    {
      method: 'POST',
      headers: tokenHeader(session.accessToken),
      body: JSON.stringify({ messageId, content, pageContext }),
    },
  );
}

export function getHenryMessagingOperation(session: HenrySession) {
  return api<HenryMessagingOperation>(
    `/henry/internal/conversations/${session.id}/messaging-operation`,
  );
}

export function requestHenryEmailConfirmation(session: HenrySession, draftId: string) {
  return api<{ operationId: string }>(
    `/henry/internal/conversations/${session.id}/email-confirmations`,
    {
      method: 'POST',
      body: JSON.stringify({ draftId, intent: 'EMAIL_SEND' }),
    },
  );
}

export function confirmHenryEmail(operationId: string) {
  return api<{ operationId: string; messageId?: string; status: string }>(
    `/henry/internal/messaging-operations/${operationId}/confirm`,
    { method: 'POST' },
  );
}

export function cancelHenryScheduledEmail(operationId: string) {
  return api<{ operationId: string; status: string }>(
    `/henry/internal/messaging-operations/${operationId}/schedule`,
    { method: 'DELETE' },
  );
}

export function pageContextFromPath(pathname: string): HenryPageContext {
  const parts = pathname.split('/').filter(Boolean);
  if (pathname === '/') return { pageType: 'public-home', section: 'home' };
  if (pathname === '/henry') return { pageType: 'henry-full', section: 'henry' };
  if (pathname.startsWith('/agenda')) return { pageType: 'agenda', section: 'calendar' };
  const publicSolutions = new Set([
    'pension',
    'educacion',
    'patrimonio',
    'proteccion',
    'accidentes',
    'empresarios',
    'socios',
    'socio-unico',
    'consultores',
  ]);
  if (parts.length === 1 && publicSolutions.has(parts[0]))
    return {
      pageType: 'public-solution',
      section: parts[0],
      intentHint: parts[0] === 'proteccion' ? 'proteccion-familiar' : parts[0],
    };
  if (pathname === '/crm/pipeline') return { pageType: 'pipeline' };
  if (pathname === '/crm/tareas') return { pageType: 'tasks' };
  if (pathname === '/crm/prospectos') return { pageType: 'prospect-list' };
  if (parts[0] === 'crm' && parts[1] === 'prospectos' && parts[2])
    return { pageType: 'prospect-detail', entityType: 'prospect', entityId: parts[2] };
  if (pathname === '/crm/clientes') return { pageType: 'clients', section: 'crm-clients' };
  if (pathname === '/crm/empresas') return { pageType: 'companies', section: 'crm-companies' };
  if (pathname === '/crm/consultores')
    return { pageType: 'consultants', section: 'crm-consultants' };
  if (parts[0] === 'comunicaciones')
    return { pageType: 'communications', section: parts[1] ?? 'inbox' };
  if (parts[0] === 'automatizaciones')
    return { pageType: 'automations', section: parts[1] ?? 'workflows' };
  if (parts[0] === 'analitica')
    return { pageType: 'analytics', section: 'commercial-intelligence' };
  if (parts[0] === 'conocimiento') return { pageType: 'knowledge', section: 'knowledge-core' };
  if (parts[0] === 'formacion')
    return { pageType: 'training', section: parts[1] === 'roleplay' ? 'roleplay' : 'academy' };
  if (parts[0] === 'reuniones' || parts[0] === 'meet')
    return { pageType: 'meetings', section: 'havona-meet' };
  if (parts[0] === 'administracion-henry') return { pageType: 'henry-admin', section: 'oversight' };
  if (['usuarios', 'roles', 'auditoria', 'configuracion'].includes(parts[0]))
    return { pageType: 'administration', section: parts[0] };
  if (parts[0] === 'dashboard') return { pageType: 'dashboard', section: 'summary' };
  if (parts[0] === 'crm' || parts[0] === 'prospectos')
    return { pageType: 'dashboard', section: 'crm' };
  return { pageType: 'other', section: parts[0] ?? 'unknown' };
}

const PUBLIC_STARTERS: Record<string, string[]> = {
  pension: [
    'Quiero revisar mi pensión',
    '¿Cómo preparo mi futuro pensional?',
    'Prefiero hablar con un consultor',
  ],
  educacion: [
    'Quiero planear la educación de mi familia',
    '¿Por dónde empiezo este objetivo?',
    'Prefiero hablar con un consultor',
  ],
  patrimonio: [
    'Quiero construir patrimonio',
    'Ayúdame a ordenar mis objetivos financieros',
    'Prefiero hablar con un consultor',
  ],
  proteccion: [
    'Quiero proteger a mi familia',
    '¿Qué riesgos debería revisar primero?',
    'Prefiero hablar con un consultor',
  ],
  accidentes: [
    'Quiero entender la protección ante accidentes',
    '¿Qué información necesito para orientarme?',
    'Prefiero hablar con un consultor',
  ],
  empresarios: [
    'Quiero proteger la continuidad de mi empresa',
    '¿Qué riesgos empresariales debería revisar?',
    'Prefiero hablar con un consultor',
  ],
  socios: [
    'Quiero revisar la protección entre socios',
    '¿Cómo preparo una conversación con mis socios?',
    'Prefiero hablar con un consultor',
  ],
  'socio-unico': [
    'Quiero proteger una empresa con socio único',
    '¿Qué riesgos de continuidad debería revisar?',
    'Prefiero hablar con un consultor',
  ],
  consultores: [
    'Quiero conocer la carrera de consultor',
    '¿Cómo es el proceso para consultores?',
    'Prefiero hablar con una persona',
  ],
};

const INTERNAL_STARTERS: Record<HenryPageContext['pageType'], string[]> = {
  'public-home': [],
  'public-solution': [],
  'henry-full': [],
  dashboard: [
    'Dame un resumen de mis prioridades',
    '¿Qué requiere atención hoy?',
    'Ayúdame a organizar mi siguiente paso',
  ],
  'prospect-list': [
    '¿Qué prospectos requieren atención?',
    'Ayúdame a priorizar seguimientos',
    '¿Qué información falta por completar?',
  ],
  'prospect-detail': [
    'Ayúdame a preparar el siguiente contacto con este prospecto',
    'Resume el contexto disponible',
    '¿Qué información me falta validar?',
  ],
  'company-detail': [
    'Resume el contexto autorizado de esta empresa',
    '¿Qué relaciones requieren seguimiento?',
    'Ayúdame a preparar el próximo contacto',
  ],
  pipeline: [
    '¿Qué oportunidades requieren atención?',
    '¿Dónde hay riesgo de estancamiento?',
    'Ayúdame a priorizar el pipeline',
  ],
  tasks: [
    '¿Qué tareas debería priorizar?',
    '¿Qué está vencido en mi ámbito?',
    'Ayúdame a organizar el día',
  ],
  agenda: [
    '¿Qué tengo pendiente esta semana?',
    'Revisa mi disponibilidad autorizada',
    'Ayúdame a preparar mi próxima cita',
  ],
  communications: [
    'Resume los hilos que requieren atención',
    'Ayúdame a preparar una respuesta',
    '¿Qué conversaciones necesitan seguimiento?',
  ],
  automations: [
    'Explica el estado de las automatizaciones',
    '¿Qué ejecuciones requieren revisión?',
    'Ayúdame a revisar una cadencia',
  ],
  analytics: [
    '¿Dónde se está cayendo mi funnel?',
    'Resume los indicadores de mi ámbito',
    '¿Qué anomalías requieren atención?',
  ],
  knowledge: [
    'Ayúdame a encontrar información autorizada',
    '¿Qué vacíos de conocimiento están registrados?',
    'Resume la evidencia disponible',
  ],
  training: [
    'Quiero practicar una objeción',
    '¿Qué formación tengo pendiente?',
    'Ayúdame a mejorar esta conversación',
  ],
  clients: [
    '¿Qué clientes requieren seguimiento?',
    'Ayúdame a preparar una revisión de cliente',
    '¿Qué tareas están pendientes?',
  ],
  companies: [
    '¿Qué empresas requieren atención?',
    'Ayúdame a preparar una conversación empresarial',
    'Resume el contexto autorizado',
  ],
  consultants: [
    '¿Qué consultores requieren acompañamiento?',
    'Resume el desempeño autorizado del equipo',
    'Ayúdame a preparar una sesión de seguimiento',
  ],
  meetings: [
    'Ayúdame a preparar mi próxima reunión',
    '¿Qué reuniones tengo pendientes?',
    'Resume el contexto autorizado de la cita',
  ],
  administration: [
    '¿Qué requiere revisión administrativa?',
    'Explícame el estado visible de este módulo',
    'Ayúdame a identificar el siguiente paso seguro',
  ],
  'henry-admin': [
    '¿Qué conversaciones requieren supervisión?',
    '¿Dónde hubo escalamiento humano?',
    'Resume el desempeño autorizado de Henry',
  ],
  other: [
    '¿Qué puedes hacer en esta página?',
    'Ayúdame con el contexto disponible',
    'Quiero escalar esta consulta',
  ],
};

export function henryStarters(context: HenryPageContext, role: HenryExperienceRole) {
  if (role === 'PUBLIC')
    return (
      PUBLIC_STARTERS[context.section ?? ''] ?? [
        'Quiero revisar mi pensión',
        'Quiero proteger a mi familia',
        'Quiero construir patrimonio',
        'Quiero proteger mi empresa',
      ]
    );
  if (role === 'CLIENT')
    return [
      'Necesito orientación sobre mi solicitud',
      'Quiero entender mi próximo paso',
      'Prefiero hablar con una persona',
    ];
  const starters = [...INTERNAL_STARTERS[context.pageType]];
  if (['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role) && context.pageType === 'dashboard')
    starters[0] = 'Resume las prioridades de mi ámbito autorizado';
  return starters;
}

export function henryContextLabel(context: HenryPageContext) {
  const labels: Partial<Record<HenryPageContext['pageType'], string>> = {
    dashboard: 'Resumen',
    'prospect-list': 'Prospectos',
    'prospect-detail': 'Detalle de prospecto',
    pipeline: 'Pipeline',
    tasks: 'Tareas',
    agenda: 'Agenda',
    communications: 'Comunicaciones',
    automations: 'Automatizaciones',
    analytics: 'Analítica',
    knowledge: 'Conocimiento',
    training: 'Formación',
    clients: 'Clientes',
    companies: 'Empresas',
    consultants: 'Consultores',
    meetings: 'HAVONA Meet',
    administration: 'Administración',
    'henry-admin': 'Administración Henry',
    'public-home': 'Inicio',
    'public-solution': 'Solución',
    'henry-full': 'Henry',
    other: 'Página actual',
  };
  return labels[context.pageType] ?? 'Página actual';
}

export function escalateHenry(session: HenrySession) {
  return api<{ data: { escalationId: string; status: string } }>(
    `/henry/conversations/${session.id}/escalations`,
    {
      method: 'POST',
      headers: tokenHeader(session.accessToken),
      body: JSON.stringify({
        reason: 'USER_REQUEST',
        summary: 'La persona solicitó continuar con un asesor humano desde Henry Web.',
      }),
    },
  );
}

export async function sendHenryVoice(
  session: HenrySession,
  audio: Blob,
  durationMs: number,
  pageContext?: HenryPageContext,
  internal = false,
) {
  const form = new FormData();
  form.append('audio', audio, `henry-${Date.now()}.webm`);
  form.append('durationMs', String(durationMs));
  if (pageContext) form.append('pageContext', JSON.stringify(pageContext));
  const response = await fetch(
    `${API_URL}/henry/${internal ? 'internal/' : ''}conversations/${session.id}/voice/turns`,
    {
      method: 'POST',
      credentials: 'include',
      headers: tokenHeader(session.accessToken),
      body: form,
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      errorMessage(payload) ?? 'No fue posible procesar el audio.',
      payload,
    );
  return payload as {
    data: {
      voiceSessionId: string;
      transcript: { transcript: string; language?: string };
      status: string;
      message: HenryMessage | null;
    };
  };
}

export async function getHenrySpeech(
  session: HenrySession,
  messageId: string,
  voiceSessionId: string,
  internal = false,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${API_URL}/henry/${internal ? 'internal/' : ''}conversations/${session.id}/voice/speech`,
    {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: { ...tokenHeader(session.accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, voiceSessionId, detail: 'VOICE_STANDARD' }),
    },
  );
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      errorMessage(payload) ?? 'No fue posible generar la voz de Henry.',
      payload,
    );
  }
  return response.blob();
}
