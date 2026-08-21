export type CalendarCredentials = { accessToken: string };
export type CalendarBusyRange = { start: string; end: string };
export type CalendarInfo = { id: string; name: string; timezone?: string; primary?: boolean; accessRole?: string };
export type CalendarAttendee = { email: string; displayName?: string; responseStatus?: string };
export type CalendarEvent = {
  id: string; etag?: string; status: 'confirmed' | 'tentative' | 'cancelled'; title: string;
  description?: string; start: string; end: string; timezone: string; location?: string;
  attendees: CalendarAttendee[]; htmlLink?: string; conferenceLink?: string; updated?: string;
};
export type CreateCalendarEvent = Omit<CalendarEvent, 'id' | 'etag' | 'status' | 'htmlLink' | 'conferenceLink' | 'updated'> & {
  id?: string; reminders?: Array<{ method: 'email' | 'popup'; minutes: number }>; createConference?: boolean;
};
export type CalendarWatch = { channelId: string; resourceId: string; expiration: string };
export type CalendarSyncPage = { events: CalendarEvent[]; nextPageToken?: string; nextSyncToken?: string };

export interface CalendarProvider {
  getCalendars(credentials: CalendarCredentials): Promise<CalendarInfo[]>;
  getAvailability(credentials: CalendarCredentials, input: { calendarIds: string[]; timeMin: string; timeMax: string; timezone: string }): Promise<Record<string, CalendarBusyRange[]>>;
  listEvents(credentials: CalendarCredentials, input: { calendarId: string; timeMin?: string; timeMax?: string; pageToken?: string; syncToken?: string }): Promise<CalendarSyncPage>;
  getEvent(credentials: CalendarCredentials, calendarId: string, eventId: string): Promise<CalendarEvent>;
  createEvent(credentials: CalendarCredentials, calendarId: string, event: CreateCalendarEvent, sendUpdates: 'all' | 'externalOnly' | 'none'): Promise<CalendarEvent>;
  updateEvent(credentials: CalendarCredentials, calendarId: string, eventId: string, event: Partial<CreateCalendarEvent>, sendUpdates: 'all' | 'externalOnly' | 'none'): Promise<CalendarEvent>;
  cancelEvent(credentials: CalendarCredentials, calendarId: string, eventId: string, sendUpdates: 'all' | 'externalOnly' | 'none'): Promise<void>;
  watchEvents(credentials: CalendarCredentials, input: { calendarId: string; channelId: string; token: string; address: string; expiration: string }): Promise<CalendarWatch>;
  stopWatch(credentials: CalendarCredentials, channelId: string, resourceId: string): Promise<void>;
}

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');

import { HttpException } from '@nestjs/common';

export class CalendarError extends HttpException {
  constructor(public readonly code: string, message: string, httpStatus = 400) { super({ statusCode: httpStatus, code, message }, httpStatus); }
}
