'use client';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from '@havona/ui';
import { api, messageOf } from '@/lib/api';
import type { MeetingJoin } from '@/lib/meetings';
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: Record<string, unknown>,
    ) => { dispose(): void };
  }
}
export default function GuestMeeting() {
  const token = useSearchParams().get('token') ?? '',
    host = useRef<HTMLDivElement>(null),
    instance = useRef<{ dispose(): void } | null>(null);
  const [join, setJoin] = useState<MeetingJoin | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => () => instance.current?.dispose(), []);
  useEffect(() => {
    if (!join || !ready || !host.current || !window.JitsiMeetExternalAPI) return;
    instance.current = new window.JitsiMeetExternalAPI(join.domain, {
      roomName: join.roomName,
      jwt: join.jwt,
      parentNode: host.current,
      userInfo: { displayName: join.displayName },
      configOverwrite: { prejoinPageEnabled: true, disableDeepLinking: true },
    });
  }, [join, ready]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const name = String(new FormData(event.currentTarget).get('name') ?? '');
    try {
      setJoin(
        await api<MeetingJoin>('/public/meetings/join', {
          method: 'POST',
          body: JSON.stringify({ token, displayName: name }),
        }),
      );
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white">
      {join && (
        <Script src={`https://${join.domain}/external_api.js`} onLoad={() => setReady(true)} />
      )}
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[.24em] text-sky-300">
          HAVONA CAPITAL GROUP
        </p>
        <h1 className="mt-2 font-display text-3xl">Acceso seguro a HAVONA Meet</h1>
        {error && <Alert>{error}</Alert>}
        {!join ? (
          <Card className="mt-8 max-w-lg bg-white p-7 text-slate-900">
            <form onSubmit={submit}>
              <label htmlFor="guest-name" className="text-sm font-semibold">
                Nombre para la reunión
              </label>
              <input
                id="guest-name"
                name="name"
                required
                minLength={2}
                maxLength={120}
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              />
              <Button className="mt-5" type="submit" disabled={!token}>
                Validar invitación e ingresar
              </Button>
            </form>
          </Card>
        ) : (
          <div
            ref={host}
            className="mt-6 min-h-[72vh] overflow-hidden rounded-2xl bg-slate-900"
            aria-label="Sala de videoreunión"
          />
        )}
      </div>
    </main>
  );
}
