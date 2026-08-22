import { Injectable } from '@nestjs/common';
import { CalendarConfig } from './calendar-config';
import { CalendarCredentials, CalendarError, CalendarEvent, CalendarProvider, CalendarSyncPage, CreateCalendarEvent } from './calendar.types';

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly config: CalendarConfig) {}

  async getCalendars(c: CalendarCredentials) {
    const data = await this.request<any>(c, '/users/me/calendarList?minAccessRole=freeBusyReader');
    return (data.items ?? []).map((x: any) => ({ id: x.id, name: x.summary, timezone: x.timeZone, primary: x.primary, accessRole: x.accessRole }));
  }
  async getAvailability(c: CalendarCredentials, input: { calendarIds: string[]; timeMin: string; timeMax: string; timezone: string }) {
    const data = await this.request<any>(c, '/freeBusy', { method: 'POST', body: JSON.stringify({ timeMin: input.timeMin, timeMax: input.timeMax, timeZone: input.timezone, items: input.calendarIds.map((id) => ({ id })) }) });
    return Object.fromEntries(Object.entries(data.calendars ?? {}).map(([id, value]: [string, any]) => [id, value.busy ?? []]));
  }
  async listEvents(c: CalendarCredentials, input: { calendarId: string; timeMin?: string; timeMax?: string; pageToken?: string; syncToken?: string }): Promise<CalendarSyncPage> {
    const params = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '2500' });
    if (input.timeMin) params.set('timeMin', input.timeMin); if (input.timeMax) params.set('timeMax', input.timeMax);
    if (input.pageToken) params.set('pageToken', input.pageToken); if (input.syncToken) params.set('syncToken', input.syncToken);
    const data = await this.request<any>(c, `/calendars/${encodeURIComponent(input.calendarId)}/events?${params}`);
    return { events: (data.items ?? []).map(mapEvent), nextPageToken: data.nextPageToken, nextSyncToken: data.nextSyncToken };
  }
  async getEvent(c: CalendarCredentials, calendarId: string, eventId: string) { return mapEvent(await this.request<any>(c, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)); }
  async createEvent(c: CalendarCredentials, calendarId: string, event: CreateCalendarEvent, sendUpdates: 'all' | 'externalOnly' | 'none') {
    const query = new URLSearchParams({ sendUpdates, conferenceDataVersion: event.createConference ? '1' : '0' });
    return mapEvent(await this.request<any>(c, `/calendars/${encodeURIComponent(calendarId)}/events?${query}`, { method: 'POST', body: JSON.stringify(toGoogleEvent(event)) }));
  }
  async updateEvent(c: CalendarCredentials, calendarId: string, eventId: string, event: Partial<CreateCalendarEvent>, sendUpdates: 'all' | 'externalOnly' | 'none') {
    const query = new URLSearchParams({ sendUpdates, conferenceDataVersion: event.createConference ? '1' : '0' });
    return mapEvent(await this.request<any>(c, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${query}`, { method: 'PATCH', body: JSON.stringify(toGoogleEvent(event)) }));
  }
  async cancelEvent(c: CalendarCredentials, calendarId: string, eventId: string, sendUpdates: 'all' | 'externalOnly' | 'none') {
    await this.request(c, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`, { method: 'DELETE' });
  }
  async watchEvents(c: CalendarCredentials, input: { calendarId: string; channelId: string; token: string; address: string; expiration: string }) {
    const data = await this.request<any>(c, `/calendars/${encodeURIComponent(input.calendarId)}/events/watch`, { method: 'POST', body: JSON.stringify({ id: input.channelId, type: 'web_hook', address: input.address, token: input.token, expiration: String(new Date(input.expiration).getTime()) }) });
    return { channelId: data.id, resourceId: data.resourceId, expiration: new Date(Number(data.expiration)).toISOString() };
  }
  async stopWatch(c: CalendarCredentials, channelId: string, resourceId: string) { await this.request(c, '/channels/stop', { method: 'POST', body: JSON.stringify({ id: channelId, resourceId }) }); }

  private async request<T>(credentials: CalendarCredentials, path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, { ...init, signal: controller.signal, headers: { accept: 'application/json', authorization: `Bearer ${credentials.accessToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
      if (!response.ok) {
        const safe = await response.json().catch(() => ({})) as any; const providerCode = safe?.error?.status || safe?.error?.errors?.[0]?.reason;
        if (response.status === 401) throw new CalendarError('CALENDAR_AUTH_EXPIRED', 'La autorización de Google Calendar expiró', 401);
        if (response.status === 403) throw new CalendarError('CALENDAR_PERMISSION_DENIED', providerCode || 'Google Calendar rechazó la operación', 403);
        if (response.status === 404) throw new CalendarError('CALENDAR_EVENT_NOT_FOUND', 'El evento no existe', 404);
        if (response.status === 410) throw new CalendarError('CALENDAR_SYNC_TOKEN_EXPIRED', 'El token de sincronización expiró', 410);
        if (response.status === 429) throw new CalendarError('CALENDAR_RATE_LIMITED', 'Google Calendar limitó temporalmente las solicitudes', 429);
        throw new CalendarError('CALENDAR_PROVIDER_UNAVAILABLE', providerCode || 'Google Calendar no está disponible', 502);
      }
      return (response.status === 204 ? undefined : await response.json()) as T;
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      if ((error as Error).name === 'AbortError') throw new CalendarError('CALENDAR_PROVIDER_UNAVAILABLE', 'Google Calendar excedió el tiempo de respuesta', 504);
      throw new CalendarError('CALENDAR_PROVIDER_UNAVAILABLE', 'No fue posible conectar con Google Calendar', 502);
    } finally { clearTimeout(timer); }
  }
}

function mapEvent(x: any): CalendarEvent {
  return { id: x.id, etag: x.etag, status: x.status ?? 'confirmed', title: x.summary ?? '(Sin título)', description: x.description,
    start: x.start?.dateTime ?? x.start?.date, end: x.end?.dateTime ?? x.end?.date, timezone: x.start?.timeZone ?? x.end?.timeZone ?? 'UTC',
    location: x.location, attendees: (x.attendees ?? []).map((a: any) => ({ email: a.email, displayName: a.displayName, responseStatus: a.responseStatus })),
    htmlLink: x.htmlLink, conferenceLink: x.hangoutLink ?? x.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri, updated: x.updated };
}
function toGoogleEvent(event: Partial<CreateCalendarEvent>) {
  const body: any = {};
  if (event.id) body.id = event.id; if (event.title) body.summary = event.title; if (event.description !== undefined) body.description = event.description;
  if (event.start) body.start = { dateTime: event.start, timeZone: event.timezone }; if (event.end) body.end = { dateTime: event.end, timeZone: event.timezone };
  if (event.location !== undefined) body.location = event.location; if (event.attendees) body.attendees = event.attendees.map(({ email }) => ({ email }));
  if (event.reminders) body.reminders = { useDefault: false, overrides: event.reminders };
  if (event.createConference) body.conferenceData = { createRequest: { requestId: event.id ?? crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  return body;
}
