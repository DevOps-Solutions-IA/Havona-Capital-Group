import { api } from './api';

export type HenryMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  status: string;
  createdAt: string;
};

export type HenrySession = { id: string; accessToken: string };
export type HenryConversation = {
  id: string;
  status: string;
  intention?: string;
  prospectAssociated: boolean;
  messages: HenryMessage[];
};

const tokenHeader = (token: string) => ({ 'X-Henry-Token': token });

export function createHenryConversation(entryPoint = 'henry') {
  return api<{ data: HenrySession & { status: string; providerConfigured: boolean; messages: HenryMessage[] } }>('/henry/conversations', {
    method: 'POST',
    body: JSON.stringify({ channel: 'WEB', consent: { accepted: true, privacyVersion: 'privacy-v1' }, entryPoint }),
  });
}

export function getHenryConversation(session: HenrySession) {
  return api<{ data: HenryConversation }>(`/henry/conversations/${session.id}`, { headers: tokenHeader(session.accessToken) });
}

export function sendHenryMessage(session: HenrySession, content: string, messageId: string) {
  return api<{ data: { status: string; message: HenryMessage | null } }>(`/henry/conversations/${session.id}/messages`, {
    method: 'POST', headers: tokenHeader(session.accessToken), body: JSON.stringify({ messageId, content }),
  });
}

export function escalateHenry(session: HenrySession) {
  return api<{ data: { escalationId: string; status: string } }>(`/henry/conversations/${session.id}/escalations`, {
    method: 'POST', headers: tokenHeader(session.accessToken),
    body: JSON.stringify({ reason: 'USER_REQUEST', summary: 'La persona solicitó continuar con un asesor humano desde Henry Web.' }),
  });
}
