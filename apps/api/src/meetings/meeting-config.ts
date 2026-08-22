import { Injectable } from '@nestjs/common';
import { MeetingError } from './meeting.types';
@Injectable()
export class MeetingConfig {
  readonly provider = process.env.MEETING_PROVIDER ?? 'jitsi';
  readonly enabled = process.env.JITSI_ENABLED === 'true';
  readonly baseUrl = (process.env.JITSI_BASE_URL ?? '').replace(/\/$/, '');
  readonly domain = process.env.JITSI_DOMAIN ?? '';
  readonly appId = process.env.JITSI_APP_ID ?? '';
  readonly appSecret = process.env.JITSI_APP_SECRET ?? '';
  readonly jwtEnabled = process.env.JITSI_JWT_ENABLED !== 'false';
  readonly tokenTtl = Number(process.env.JITSI_TOKEN_TTL_SECONDS ?? 3600);
  readonly guestTokenTtl = Number(process.env.JITSI_GUEST_TOKEN_TTL_SECONDS ?? 1800);
  readonly prefix = (process.env.JITSI_MEETING_PREFIX ?? 'havona')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
  readonly timeout = Number(process.env.JITSI_REQUEST_TIMEOUT_MS ?? 10000);
  readonly webhookSecret = process.env.JITSI_WEBHOOK_SECRET ?? '';
  assertConfigured() {
    if (!this.enabled || !this.baseUrl || !this.domain || this.provider !== 'jitsi')
      throw new MeetingError(
        'MEETING_CONFIGURATION_REQUIRED',
        'HAVONA Meet requiere configuración de Jitsi',
        503,
      );
    if (this.jwtEnabled && (!this.appId || !this.appSecret))
      throw new MeetingError(
        'MEETING_CONFIGURATION_REQUIRED',
        'Jitsi JWT requiere credenciales server-side',
        503,
      );
  }
}
