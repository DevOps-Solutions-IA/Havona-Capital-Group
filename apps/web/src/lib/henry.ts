import { api, ApiError, API_URL } from './api';

export type HenryMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  status: string;
  createdAt: string;
};

export type HenrySession = { id: string; accessToken: string };
export type HenryPageContext = {
  pageType: 'public-home' | 'public-solution' | 'henry-full' | 'dashboard' | 'prospect-list' | 'prospect-detail' | 'company-detail' | 'pipeline' | 'tasks' | 'henry-admin' | 'other';
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

const tokenHeader = (token: string) => ({ 'X-Henry-Token': token });
const errorMessage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as { error?: unknown }).error;
  return error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message : undefined;
};

export function createHenryConversation(entryPoint = 'henry', pageContext?: HenryPageContext, internal = false) {
  return api<{ data: HenrySession & { status: string; providerConfigured: boolean; messages: HenryMessage[] } }>(`/henry/${internal ? 'internal/' : ''}conversations`, {
    method: 'POST',
    body: JSON.stringify({ channel: 'WEB', consent: { accepted: true, privacyVersion: 'privacy-v1' }, entryPoint, pageContext }),
  });
}

export function getHenryConversation(session: HenrySession, internal = false) {
  return api<{ data: HenryConversation }>(`/henry/${internal ? 'internal/' : ''}conversations/${session.id}`, { headers: tokenHeader(session.accessToken) });
}

export function sendHenryMessage(session: HenrySession, content: string, messageId: string, pageContext?: HenryPageContext, internal = false) {
  return api<{ data: { status: string; message: HenryMessage | null } }>(`/henry/${internal ? 'internal/' : ''}conversations/${session.id}/messages`, {
    method: 'POST', headers: tokenHeader(session.accessToken), body: JSON.stringify({ messageId, content, pageContext }),
  });
}

export function pageContextFromPath(pathname: string): HenryPageContext {
  const parts = pathname.split('/').filter(Boolean);
  if (pathname === '/') return { pageType: 'public-home', section: 'home' };
  if (pathname === '/henry') return { pageType: 'henry-full', section: 'henry' };
  const publicSolutions = new Set(['pension','educacion','patrimonio','proteccion','accidentes','empresarios','socios','socio-unico','consultores']);
  if (parts.length === 1 && publicSolutions.has(parts[0])) return { pageType: 'public-solution', section: parts[0], intentHint: parts[0] === 'proteccion' ? 'proteccion-familiar' : parts[0] };
  if (pathname === '/crm/pipeline') return { pageType: 'pipeline' };
  if (pathname === '/crm/tareas') return { pageType: 'tasks' };
  if (pathname === '/crm/prospectos') return { pageType: 'prospect-list' };
  if (parts[0] === 'crm' && parts[1] === 'prospectos' && parts[2]) return { pageType: 'prospect-detail', entityType: 'prospect', entityId: parts[2] };
  if (parts[0] === 'administracion-henry') return { pageType: 'henry-admin' };
  if (parts[0] === 'dashboard' || parts[0] === 'crm') return { pageType: 'dashboard' };
  return { pageType: 'other' };
}

export function escalateHenry(session: HenrySession) {
  return api<{ data: { escalationId: string; status: string } }>(`/henry/conversations/${session.id}/escalations`, {
    method: 'POST', headers: tokenHeader(session.accessToken),
    body: JSON.stringify({ reason: 'USER_REQUEST', summary: 'La persona solicitó continuar con un asesor humano desde Henry Web.' }),
  });
}

export async function sendHenryVoice(session: HenrySession, audio: Blob, durationMs: number, pageContext?: HenryPageContext, internal = false) {
  const form = new FormData();
  form.append('audio', audio, `henry-${Date.now()}.webm`);
  form.append('durationMs', String(durationMs));
  if (pageContext) form.append('pageContext', JSON.stringify(pageContext));
  const response = await fetch(`${API_URL}/henry/${internal ? 'internal/' : ''}conversations/${session.id}/voice/turns`, {
    method: 'POST', credentials: 'include', headers: tokenHeader(session.accessToken), body: form,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(payload) ?? 'No fue posible procesar el audio.', payload);
  return payload as { data: { voiceSessionId: string; transcript: { transcript: string; language?: string }; status: string; message: HenryMessage | null } };
}

export async function getHenrySpeech(session: HenrySession, messageId: string, voiceSessionId: string, internal = false, signal?: AbortSignal) {
  const response = await fetch(`${API_URL}/henry/${internal ? 'internal/' : ''}conversations/${session.id}/voice/speech`, {
    method: 'POST', credentials: 'include', signal,
    headers: { ...tokenHeader(session.accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, voiceSessionId, detail: 'VOICE_STANDARD' }),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiError(response.status, errorMessage(payload) ?? 'No fue posible generar la voz de Henry.', payload);
  }
  return response.blob();
}
