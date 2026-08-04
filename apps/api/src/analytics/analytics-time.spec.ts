import { DateTime } from 'luxon';
import { analyticsPeriod, previousPeriod } from './analytics-time';

describe('analytics time model', () => {
  it('construye rangos inclusivo/exclusivo en timezone IANA', () => {
    const period = analyticsPeriod({ preset: 'today', timezone: 'America/Bogota' }, DateTime.fromISO('2026-08-03T16:00:00-05:00'));
    expect(period.start.toISOString()).toBe('2026-08-03T05:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-04T05:00:00.000Z');
  });
  it('crea periodo anterior equivalente sin solapamiento', () => {
    const period = analyticsPeriod({ preset: 'week' }, DateTime.fromISO('2026-08-03T12:00:00-05:00'));
    const previous = previousPeriod(period);
    expect(previous.end).toEqual(period.start);
    expect(previous.end.getTime() - previous.start.getTime()).toBe(period.end.getTime() - period.start.getTime());
  });
});

