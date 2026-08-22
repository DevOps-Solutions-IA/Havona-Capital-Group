import { Injectable } from '@nestjs/common';

@Injectable()
export class CalendarConfig {
  readonly enabled = process.env.GOOGLE_CALENDAR_ENABLED === 'true';
  readonly clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
  readonly clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  readonly redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ??
    'http://localhost:3001/api/v1/integrations/google/calendar/oauth/callback';
  readonly baseUrl = (
    process.env.GOOGLE_CALENDAR_BASE_URL?.trim() || 'https://www.googleapis.com/calendar/v3'
  ).replace(/\/$/, '');
  readonly timezone = process.env.GOOGLE_CALENDAR_DEFAULT_TIMEZONE?.trim() || 'America/Bogota';
  readonly encryptionKey = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim() ?? '';
  readonly webhookSecret = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET?.trim() ?? '';
  readonly webhookUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL?.trim() ?? '';
  readonly allowMeet = process.env.GOOGLE_CALENDAR_ALLOW_GOOGLE_MEET === 'true';
  readonly timeoutMs = Number(process.env.GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS ?? 15_000);
  readonly scopes = (
    process.env.GOOGLE_CALENDAR_SCOPES?.trim() ||
    [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    ].join(' ')
  )
    .split(/[ ,]+/)
    .filter(Boolean);

  assertConfigured() {
    if (!this.enabled || !this.clientId || !this.clientSecret || !this.encryptionKey)
      throw new Error('CALENDAR_CONFIGURATION_REQUIRED');
  }
}
