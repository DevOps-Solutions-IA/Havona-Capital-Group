'use client';

import Script from 'next/script';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from '@havona/ui';
import { meetingsApi, type MeetingJoin } from '@/lib/meetings';
import { messageOf } from '@/lib/api';

export default function GuestMeeting() {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<HavonaJitsiApi | null>(null);

  const [token, setToken] = useState('');
  const [join, setJoin] = useState<MeetingJoin | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  useEffect(() => {
    if (!join || !ready || !host.current || !window.JitsiMeetExternalAPI || instance.current) {
      return;
    }

    const jitsi = new window.JitsiMeetExternalAPI(join.domain, {
      roomName: join.roomName,
      jwt: join.jwt,
      parentNode: host.current,
      userInfo: {
        displayName: join.displayName,
      },
      configOverwrite: {
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        lobby: {
          autoKnock: true,
          enableChat: false,
        },
        securityUi: {
          hideLobbyButton: true,
          disableLobbyPassword: true,
        },
      },
    });

    instance.current = jitsi;

    const onJoined = () => {
      setConnected(true);
    };

    const onLeft = () => {
      setConnected(false);
    };

    const onPasswordRequired = () => {
      setError(
        'La sala solicitó credenciales adicionales. Cierra esta ventana y solicita una nueva invitación HAVONA Meet.',
      );
    };

    jitsi.addListener('videoConferenceJoined', onJoined);
    jitsi.addListener('videoConferenceLeft', onLeft);
    jitsi.addListener('passwordRequired', onPasswordRequired);

    return () => {
      jitsi.removeListener('videoConferenceJoined', onJoined);
      jitsi.removeListener('videoConferenceLeft', onLeft);
      jitsi.removeListener('passwordRequired', onPasswordRequired);
      jitsi.dispose();

      if (instance.current === jitsi) {
        instance.current = null;
      }
    };
  }, [join, ready]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();

    if (!token) {
      setError('La invitación no contiene un token válido.');
      return;
    }

    try {
      setJoin(await meetingsApi.guestJoin(token, name));
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

        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Este acceso utiliza una invitación firmada. No necesitas usuario ni contraseña de HAVONA
          Capital Group.
        </p>

        {error && (
          <div className="mt-5">
            <Alert>{error}</Alert>
          </div>
        )}

        {!join ? (
          <Card className="mt-8 max-w-lg bg-white p-7 text-slate-900">
            {!token && <Alert>La invitación no es válida o está incompleta.</Alert>}

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
                autoComplete="name"
                placeholder="Tu nombre"
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3"
              />

              <Button className="mt-5" type="submit" disabled={!token}>
                Validar invitación e ingresar
              </Button>
            </form>
          </Card>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              {connected
                ? 'Conectado a HAVONA Meet.'
                : 'Conectando de forma segura. Si la sala tiene lobby, espera la autorización del anfitrión.'}
            </div>

            <div
              ref={host}
              className="mt-6 min-h-[78vh] overflow-hidden rounded-2xl bg-slate-900"
              aria-label="Sala de videoreunión"
            />
          </>
        )}
      </div>
    </main>
  );
}
