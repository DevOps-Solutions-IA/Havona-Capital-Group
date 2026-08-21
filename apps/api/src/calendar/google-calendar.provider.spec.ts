import { CalendarConfig } from './calendar-config';
import { GoogleCalendarProvider } from './google-calendar.provider';

describe('GoogleCalendarProvider', () => {
  const config = { baseUrl: 'https://www.googleapis.com/calendar/v3', timeoutMs: 1000 } as CalendarConfig;
  const provider = new GoogleCalendarProvider(config);
  const credentials = { accessToken: 'secret-token-never-log' };
  afterEach(() => jest.restoreAllMocks());

  it('consulta FreeBusy con timezone y calendarios explícitos', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: '2026-08-03T14:00:00Z', end: '2026-08-03T15:00:00Z' }] } } }), { status: 200 }));
    const result = await provider.getAvailability(credentials, { calendarIds: ['primary'], timeMin: '2026-08-03T00:00:00Z', timeMax: '2026-08-04T00:00:00Z', timezone: 'America/Bogota' });
    expect(result.primary).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('https://www.googleapis.com/calendar/v3/freeBusy', expect.objectContaining({ method: 'POST' }));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ timeZone: 'America/Bogota', items: [{ id: 'primary' }] });
  });

  it('crea eventos con conferenceDataVersion y payload compatible', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'event1', status: 'confirmed', summary: 'Revisión', start: { dateTime: '2026-08-04T10:00:00-05:00', timeZone: 'America/Bogota' }, end: { dateTime: '2026-08-04T10:45:00-05:00', timeZone: 'America/Bogota' } }), { status: 200 }));
    await provider.createEvent(credentials, 'primary', { title: 'Revisión', start: '2026-08-04T10:00:00-05:00', end: '2026-08-04T10:45:00-05:00', timezone: 'America/Bogota', attendees: [], createConference: true }, 'all');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('conferenceDataVersion=1');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ summary: 'Revisión', start: { timeZone: 'America/Bogota' }, conferenceData: { createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } } } });
  });

  it.each([[401, 'CALENDAR_AUTH_EXPIRED'], [403, 'CALENDAR_PERMISSION_DENIED'], [410, 'CALENDAR_SYNC_TOKEN_EXPIRED'], [429, 'CALENDAR_RATE_LIMITED']])('mapea HTTP %s a %s sin exponer token', async (status, code) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { status: 'SAFE_PROVIDER_CODE' } }), { status }));
    await expect(provider.getCalendars(credentials)).rejects.toMatchObject({ code });
    await expect(provider.getCalendars(credentials)).rejects.not.toThrow('secret-token-never-log');
  });

  it('cancela el timeout y tipa fallos de red', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('socket failed'));
    await expect(provider.getCalendars(credentials)).rejects.toMatchObject({ code: 'CALENDAR_PROVIDER_UNAVAILABLE' });
  });
});
