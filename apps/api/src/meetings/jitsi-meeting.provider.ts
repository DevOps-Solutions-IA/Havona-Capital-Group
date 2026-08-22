import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { MeetingConfig } from './meeting-config';
import {
  JoinConfiguration,
  JoinIdentity,
  MeetingDescriptor,
  MeetingError,
  MeetingProvider,
} from './meeting.types';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
@Injectable()
export class JitsiMeetingProvider implements MeetingProvider {
  constructor(private readonly config: MeetingConfig) {}
  async createMeeting(input: { roomName: string; title: string }) {
    this.config.assertConfigured();
    return { providerMeetingId: input.roomName };
  }
  async getMeeting(m: MeetingDescriptor) {
    return { providerMeetingId: m.roomName, status: m.status };
  }
  async updateMeetingMetadata(_m: MeetingDescriptor) {}
  async cancelMeeting(_m: MeetingDescriptor) {}
  validateMeetingAccess(m: MeetingDescriptor, at = new Date()) {
    if (m.status === 'CANCELLED')
      throw new MeetingError('MEETING_CANCELLED', 'La reunión fue cancelada', 410);
    const open = m.scheduledStartAt.getTime() - m.joinEarlyMinutes * 60000,
      close = m.scheduledEndAt.getTime() + m.joinLateMinutes * 60000;
    if (at.getTime() < open)
      throw new MeetingError('MEETING_NOT_STARTED', 'La reunión aún no está disponible', 409);
    if (at.getTime() > close)
      throw new MeetingError('MEETING_EXPIRED', 'La ventana de acceso terminó', 410);
  }
  async getJoinConfiguration(m: MeetingDescriptor, i: JoinIdentity): Promise<JoinConfiguration> {
    this.config.assertConfigured();
    const now = Math.floor(Date.now() / 1000),
      exp = now + (i.role === 'GUEST' ? this.config.guestTokenTtl : this.config.tokenTtl);
    const jwt = this.config.jwtEnabled
      ? this.sign({
          aud: this.config.appId,
          iss: this.config.appId,
          sub: this.config.domain,
          room: m.roomName,
          iat: now,
          nbf: now - 5,
          exp,
          context: {
            user: {
              id: i.id,
              name: i.name,
              email: i.email,
              moderator: i.role === 'HOST' || i.role === 'MODERATOR',
            },
          },
        })
      : undefined;
    return {
      url: `${this.config.baseUrl}/${encodeURIComponent(m.roomName)}`,
      domain: this.config.domain,
      roomName: m.roomName,
      jwt,
      role: i.role,
      displayName: i.name,
    };
  }
  async getMeetingStatus(m: MeetingDescriptor) {
    return m.status;
  }
  private sign(payload: unknown) {
    const header = b64({ alg: 'HS256', typ: 'JWT' }),
      body = b64(payload),
      signature = createHmac('sha256', this.config.appSecret)
        .update(`${header}.${body}`)
        .digest('base64url');
    return `${header}.${body}.${signature}`;
  }
}
