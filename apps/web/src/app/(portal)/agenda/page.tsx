'use client';
import { FormEvent, InputHTMLAttributes, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  Settings2,
  Unplug,
} from 'lucide-react';
import { Alert, Button, Card, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { calendarApi, CalendarEvent, CalendarStatus, AvailabilityRule } from '@/lib/calendar';
import { messageOf } from '@/lib/api';
const zone = 'America/Bogota';
const initialRule: AvailabilityRule = {
  timezone: zone,
  workingDays: [1, 2, 3, 4, 5],
  workStart: '08:00',
  workEnd: '18:00',
  minimumNoticeMinutes: 120,
  defaultMeetingDuration: 45,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  maximumFutureBookingDays: 90,
};
function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${props.className ?? ''}`} />;
}
export default function AgendaPage() {
  const [status, setStatus] = useState<CalendarStatus | null>(null),
    [events, setEvents] = useState<CalendarEvent[]>([]),
    [rules, setRules] = useState(initialRule),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [creating, setCreating] = useState(false),
    [settings, setSettings] = useState(false);
  const from = useMemo(() => new Date(), []),
    to = useMemo(() => new Date(Date.now() + 7 * 86400000), []);
  const load = useCallback(async () => {
    setError('');
    try {
      const current = await calendarApi.status();
      setStatus(current);
      if (current.status === 'ACTIVE') {
        const [e, r] = await Promise.all([
          calendarApi.events(from.toISOString(), to.toISOString()),
          calendarApi.rules(),
        ]);
        setEvents(e.data);
        setRules(r);
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    void load();
  }, [load]);
  async function connect() {
    try {
      const { authorizationUrl } = await calendarApi.connect();
      location.assign(authorizationUrl);
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function disconnect() {
    if (!confirm('¿Desconectar Google Calendar? Las referencias auditables se conservarán.'))
      return;
    try {
      await calendarApi.disconnect();
      setEvents([]);
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function sync() {
    try {
      await calendarApi.sync();
      setNotice('Sincronización completada.');
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function saveRules(e: FormEvent) {
    e.preventDefault();
    try {
      setRules(await calendarApi.updateRules(rules));
      setNotice('Reglas de disponibilidad guardadas.');
      setSettings(false);
    } catch (x) {
      setError(messageOf(x));
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      const start = new Date(String(data.get('start'))),
        end = new Date(start.getTime() + Number(data.get('duration')) * 60000);
      await calendarApi.create({
        title: String(data.get('title')),
        start: start.toISOString(),
        end: end.toISOString(),
        timezone: rules.timezone,
        attendees: String(data.get('attendee') || '').trim()
          ? [{ email: String(data.get('attendee')) }]
          : [],
        createConference: data.get('meet') === 'on',
        sendUpdates: 'all',
      });
      setCreating(false);
      setNotice('Cita creada y registrada en Google Calendar.');
      await load();
    } catch (x) {
      setError(messageOf(x));
    }
  }
  const tz = status?.timezone ?? zone,
    grouped = events.reduce<Record<string, CalendarEvent[]>>((all, event) => {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(event.start));
      (all[key] ??= []).push(event);
      return all;
    }, {});
  return (
    <>
      <PageHeader
        title="Agenda inteligente"
        description="Disponibilidad y citas reales, conectadas con Google Calendar y el contexto autorizado de Henry."
      />
      {error && <Alert>{error}</Alert>}
      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <Check className="size-4" />
          {notice}
        </div>
      )}
      {loading ? (
        <Skeleton className="h-80" />
      ) : status?.status !== 'ACTIVE' ? (
        <Card className="overflow-hidden p-0">
          <div className="grid gap-8 p-7 lg:grid-cols-[1fr_.8fr] lg:p-10">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.24em] text-brand-600">
                Conexión protegida
              </p>
              <h2 className="font-display text-3xl text-slate-950">
                Conecte su agenda, mantenga el control.
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-slate-600">
                HAVONA solicita acceso limitado a eventos, disponibilidad y lista de calendarios.
                Los tokens permanecen cifrados en el servidor.
              </p>
              <Button onClick={() => void connect()} className="mt-6">
                <Link2 className="size-4" />
                Conectar Google Calendar
              </Button>
            </div>
            <div className="agenda-orbit" aria-hidden="true">
              <CalendarDays />
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="agenda-status">
            <div>
              <span className="agenda-status-dot" />
              Google Calendar conectado
              <p>
                {status.accountEmail} · {status.calendarName ?? 'Calendario principal'} · {tz}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button className="bg-white text-brand-800 ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => void sync()}>
                <RefreshCw className="size-4" />
                Sincronizar
              </Button>
                <Button className="bg-white text-brand-800 ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setSettings(!settings)}>
                <Settings2 className="size-4" />
                Disponibilidad
              </Button>
                <Button className="bg-white text-brand-800 ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => void disconnect()}>
                <Unplug className="size-4" />
                Desconectar
              </Button>
            </div>
          </section>
          {settings && (
            <Card>
              <form onSubmit={saveRules} className="grid gap-4 md:grid-cols-4">
                <label className="text-sm font-medium">
                  Zona horaria
                  <Input
                    value={rules.timezone}
                    onChange={(e) => setRules({ ...rules, timezone: e.target.value })}
                  />
                </label>
                <label className="text-sm font-medium">
                  Inicio
                  <Input
                    type="time"
                    value={rules.workStart}
                    onChange={(e) => setRules({ ...rules, workStart: e.target.value })}
                  />
                </label>
                <label className="text-sm font-medium">
                  Fin
                  <Input
                    type="time"
                    value={rules.workEnd}
                    onChange={(e) => setRules({ ...rules, workEnd: e.target.value })}
                  />
                </label>
                <label className="text-sm font-medium">
                  Duración habitual
                  <Input
                    type="number"
                    min="15"
                    max="480"
                    value={rules.defaultMeetingDuration}
                    onChange={(e) =>
                      setRules({ ...rules, defaultMeetingDuration: Number(e.target.value) })
                    }
                  />
                </label>
                <div className="md:col-span-4">
                  <Button type="submit">Guardar reglas</Button>
                </div>
              </form>
            </Card>
          )}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.24em] text-brand-600">
                Próximos siete días
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-950">
                Su semana, con contexto.
              </h2>
            </div>
            <Button onClick={() => setCreating(!creating)}>
              <Plus className="size-4" />
              Nueva cita
            </Button>
          </div>
          {creating && (
            <Card>
              <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">
                  Título
                  <Input name="title" required maxLength={240} />
                </label>
                <label className="text-sm font-medium">
                  Inicio
                  <Input name="start" type="datetime-local" required />
                </label>
                <label className="text-sm font-medium">
                  Duración (minutos)
                  <Input
                    name="duration"
                    type="number"
                    defaultValue={rules.defaultMeetingDuration}
                    min="15"
                    max="480"
                    required
                  />
                </label>
                <label className="text-sm font-medium">
                  Invitado (opcional)
                  <Input name="attendee" type="email" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input name="meet" type="checkbox" />
                  Crear enlace de Google Meet
                </label>
                <div className="md:col-span-2 flex gap-2">
                  <Button type="submit">Confirmar y crear</Button>
                    <Button type="button" className="bg-white text-brand-800 ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setCreating(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}
          {events.length === 0 ? (
            <EmptyState
              title="Su agenda está disponible"
              description="No hay citas reales en los próximos siete días. Puede crear una cuando tenga un horario confirmado."
            />
          ) : (
            <div className="agenda-week">
              {Object.entries(grouped)
                .sort()
                .map(([day, items]) => (
                  <section key={day} className="agenda-day">
                    <header>
                      <span>
                        {new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: tz }).format(
                          new Date(items[0]!.start),
                        )}
                      </span>
                      <strong>
                        {new Intl.DateTimeFormat('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          timeZone: tz,
                        }).format(new Date(items[0]!.start))}
                      </strong>
                    </header>
                    <div>
                      {items.map((item) => (
                        <article key={item.id} className="agenda-event">
                          <Clock3 className="size-4" />
                          <div>
                            <strong>{item.title}</strong>
                            <p>
                              {new Intl.DateTimeFormat('es-CO', {
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: tz,
                              }).format(new Date(item.start))}{' '}
                              –{' '}
                              {new Intl.DateTimeFormat('es-CO', {
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: tz,
                              }).format(new Date(item.end))}
                            </p>
                            {item.conferenceLink && (
                              <a href={item.conferenceLink} target="_blank" rel="noreferrer">
                                Unirse con Google Meet <ExternalLink className="size-3" />
                              </a>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
