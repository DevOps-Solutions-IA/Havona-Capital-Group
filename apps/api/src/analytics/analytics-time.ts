import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AnalyticsPeriod } from './analytics.types';

export function analyticsPeriod(input: { preset?: string; start?: string; end?: string; timezone?: string }, now = DateTime.now()): AnalyticsPeriod {
  const timezone = input.timezone ?? 'America/Bogota';
  if (!DateTime.local().setZone(timezone).isValid) throw new BadRequestException('Timezone IANA inválido');
  const localNow = now.setZone(timezone);
  let start: DateTime;
  let end: DateTime;
  const preset = input.preset ?? (input.start && input.end ? 'custom' : 'month');
  if (preset === 'custom') {
    start = DateTime.fromISO(input.start ?? '', { zone: timezone }).startOf('day');
    end = DateTime.fromISO(input.end ?? '', { zone: timezone }).plus({ days: 1 }).startOf('day');
  } else if (preset === 'today') {
    start = localNow.startOf('day'); end = start.plus({ days: 1 });
  } else if (preset === 'yesterday') {
    end = localNow.startOf('day'); start = end.minus({ days: 1 });
  } else if (preset === 'week') {
    start = localNow.startOf('week'); end = start.plus({ weeks: 1 });
  } else if (preset === 'quarter') {
    const month = Math.floor((localNow.month - 1) / 3) * 3 + 1;
    start = localNow.set({ month, day: 1 }).startOf('day'); end = start.plus({ months: 3 });
  } else if (preset === 'year') {
    start = localNow.startOf('year'); end = start.plus({ years: 1 });
  } else {
    start = localNow.startOf('month'); end = start.plus({ months: 1 });
  }
  if (!start.isValid || !end.isValid || start >= end) throw new BadRequestException('Rango temporal inválido');
  return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate(), timezone, preset };
}

export function previousPeriod(period: AnalyticsPeriod): AnalyticsPeriod {
  const duration = period.end.getTime() - period.start.getTime();
  return { ...period, start: new Date(period.start.getTime() - duration), end: new Date(period.start), preset: 'previous' };
}
