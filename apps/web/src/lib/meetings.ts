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
  joinPolicy: 'AUTHENTICATED' | 'INVITED';
  guestAccessPolicy: 'DISABLED' | 'SIGNED_INVITATION';
  allowGuestBeforeHost: boolean;
  joinEarlyMinutes: number;
  joinLateMinutes: number;
  lobbyRequired: boolean;
};

export type MeetingJoin = {
  url: string;
  domain: string;
  roomName: string;
  jwt?: string;
  role: string;
  displayName: string;
};

export type MeetingInvitation = {
  id: string;
  token: string;
  joinUrl: string;
  expiresAt: string;
};

export type CreateMeetingInvitation = {
  expectedEmail?: string;
  displayName?: string;
  expiresAt: string;
};

export const meetingsApi = {
  list: () => api<Meeting[]>('/meetings'),

  get: (id: string) => api<Meeting>(`/meetings/${id}`),

  join: (id: string) =>
    api<MeetingJoin>(`/meetings/${id}/join`, {
      method: 'POST',
    }),

  create: (body: Record<string, unknown>) =>
    api<Meeting>('/meetings', {
      method: 'POST',
      headers: {
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        ...body,
        confirmedByUser: true,
      }),
    }),

  cancel: (id: string, reason: string) =>
    api<Meeting>(`/meetings/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({
        reason,
        confirmedByUser: true,
      }),
    }),

  invite: (id: string, body: CreateMeetingInvitation) =>
    api<MeetingInvitation>(`/meetings/${id}/invitations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revokeInvitation: (meetingId: string, invitationId: string) =>
    api<{ revoked: true }>(`/meetings/${meetingId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }),

  guestJoin: (token: string, displayName: string) =>
    api<MeetingJoin>('/public/meetings/join', {
      method: 'POST',
      body: JSON.stringify({
        token,
        displayName,
      }),
    }),
};
