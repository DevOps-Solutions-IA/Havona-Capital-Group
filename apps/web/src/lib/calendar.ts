import { api } from './api';
export type CalendarStatus={id?:string;status:'DISCONNECTED'|'ACTIVE'|'NEEDS_REAUTHORIZATION'|'ERROR';enabled:boolean;accountEmail?:string;calendarId?:string;calendarName?:string;timezone?:string;lastSyncedAt?:string};
export type CalendarEvent={id:string;title:string;start:string;end:string;timezone:string;status:string;attendees?:Array<{email:string;responseStatus?:string}>;htmlLink?:string;conferenceLink?:string};
export type AvailabilityRule={timezone:string;workingDays:number[];workStart:string;workEnd:string;minimumNoticeMinutes:number;defaultMeetingDuration:number;bufferBeforeMinutes:number;bufferAfterMinutes:number;maximumFutureBookingDays:number};
export const calendarApi={
 status:()=>api<CalendarStatus>('/calendar/status'), connect:()=>api<{authorizationUrl:string}>('/integrations/google/calendar/oauth/connect'),
 disconnect:()=>api<{status:string}>('/calendar/connection',{method:'DELETE'}), rules:()=>api<AvailabilityRule>('/calendar/rules'),
 updateRules:(value:AvailabilityRule)=>api<AvailabilityRule>('/calendar/rules',{method:'PUT',body:JSON.stringify(value)}),
 events:(timeMin:string,timeMax:string)=>api<{data:CalendarEvent[];timezone:string}>(`/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`),
 create:(value:Record<string,unknown>)=>api<CalendarEvent>('/calendar/events',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({...value,confirmedByUser:true})}),
 sync:()=>api<{synced:boolean}>('/calendar/sync',{method:'POST'}),
};
