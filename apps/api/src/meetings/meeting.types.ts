export const MEETING_PROVIDER = Symbol('MEETING_PROVIDER');
export type MeetingRole = 'HOST' | 'MODERATOR' | 'PARTICIPANT' | 'GUEST';
export type MeetingDescriptor = {
  roomName: string;
  title: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  status: string;
  lobbyRequired: boolean;
  allowGuestBeforeHost: boolean;
  joinEarlyMinutes: number;
  joinLateMinutes: number;
};
export type JoinIdentity = { id: string; name: string; email?: string; role: MeetingRole };
export type JoinConfiguration = {
  url: string;
  domain: string;
  roomName: string;
  jwt?: string;
  role: MeetingRole;
  displayName: string;
};
export interface MeetingProvider {
  createMeeting(input: { roomName: string; title: string }): Promise<{ providerMeetingId: string }>;
  getMeeting(meeting: MeetingDescriptor): Promise<{ providerMeetingId: string; status: string }>;
  updateMeetingMetadata(meeting: MeetingDescriptor): Promise<void>;
  cancelMeeting(meeting: MeetingDescriptor): Promise<void>;
  getJoinConfiguration(
    meeting: MeetingDescriptor,
    identity: JoinIdentity,
  ): Promise<JoinConfiguration>;
  validateMeetingAccess(meeting: MeetingDescriptor, at?: Date): void;
  getMeetingStatus(meeting: MeetingDescriptor): Promise<string>;
}
export class MeetingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
