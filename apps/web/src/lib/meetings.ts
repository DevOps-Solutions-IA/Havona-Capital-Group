import { api } from './api';
export type Meeting = {
  id: string;
  title: string;
  description?: string;
  status: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  timezone: string;
  ownerUserId: string;
  assignedConsultantId?: string;
  calendarEventLinkId?: string;
};
export type MeetingJoin = {
  url: string;
  domain: string;
  roomName: string;
  jwt?: string;
  role: string;
  displayName: string;
};
export const meetingsApi = {
  list: () => api<Meeting[]>('/meetings'),
  get: (id: string) => api<Meeting>(`/meetings/${id}`),
  join: (id: string) => api<MeetingJoin>(`/meetings/${id}/join`, { method: 'POST' }),
  create: (body: Record<string, unknown>) =>
    api<Meeting>('/meetings', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ ...body, confirmedByUser: true }),
    }),
  cancel: (id: string, reason: string) =>
    api<Meeting>(`/meetings/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason, confirmedByUser: true }),
    }),
};
