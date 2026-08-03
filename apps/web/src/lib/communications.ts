import { api } from './api';
export type CommunicationMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  status: string;
  createdAt: string;
  generatedByHenry: boolean;
  attachments: Array<{ id: string; fileName?: string | null; mimeType: string }>;
};
export type CommunicationThread = {
  id: string;
  channel: 'WHATSAPP' | 'EMAIL';
  provider: 'META' | 'RESEND';
  status: 'OPEN' | 'PENDING' | 'CLOSED' | 'BLOCKED';
  handlingMode: 'HENRY' | 'HUMAN' | 'PAUSED' | 'CLOSED';
  subject?: string | null;
  contactIdentity: string;
  contactDisplayName?: string | null;
  unreadCount: number;
  lastMessageAt?: string | null;
  assignedUser?: { id: string; name: string } | null;
  prospect?: { id: string; name: string; email?: string | null; phone?: string | null } | null;
  company?: { id: string; name: string } | null;
  opportunity?: { id: string; title: string } | null;
  consent?: { commercialStatus: string; serviceStatus: string } | null;
  messages: CommunicationMessage[];
};
export type ConfigStatus = {
  whatsapp: { enabled: boolean; configured: boolean; webhookReady: boolean };
  email: { enabled: boolean; configured: boolean; webhookReady: boolean; inboundEnabled: boolean };
};
export const communicationsApi = {
  list: (q = '') =>
    api<{ data: CommunicationThread[]; meta: { total: number } }>(
      `/communications${q ? `?${q}` : ''}`,
    ),
  get: (id: string) => api<CommunicationThread>(`/communications/${id}`),
  config: () => api<ConfigStatus>('/communications/config-status'),
  send: (id: string, text: string) =>
    api<CommunicationMessage>(`/communications/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, idempotencyKey: crypto.randomUUID() }),
    }),
  mode: (id: string, mode: 'HENRY' | 'HUMAN' | 'PAUSED') =>
    api<CommunicationThread>(`/communications/${id}/mode`, {
      method: 'PATCH',
      body: JSON.stringify({ mode }),
    }),
  assign: (id: string, assigneeId: string) =>
    api(`/communications/${id}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId }),
    }),
  link: (id: string, relations: Record<string, string>) =>
    api(`/communications/${id}/crm`, { method: 'PATCH', body: JSON.stringify(relations) }),
  close: (id: string) => api(`/communications/${id}`, { method: 'DELETE' }),
};
