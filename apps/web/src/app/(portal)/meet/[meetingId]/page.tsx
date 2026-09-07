'use client';

import Script from 'next/script';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from '@havona/ui';
import { Meeting, MeetingJoin, meetingsApi } from '@/lib/meetings';
import { messageOf } from '@/lib/api';

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;

    try {
      copied = document.execCommand('copy');
    } finally {
      textarea.remove();
    }

    return copied;
  }
}

export default function MeetRoom() {
  const { meetingId } = useParams<{ meetingId: string }>();

  const host = useRef<HTMLDivElement>(null);
  const jitsi = useRef<HavonaJitsiApi | null>(null);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [join, setJoin] = useState<MeetingJoin | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const [connected, setConnected] = useState(false);
  const [lobbyReady, setLobbyReady] = useState(false);

  const [inviting, setInviting] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState('');
  const [invitationMessage, setInvitationMessage] = useState('');

  useEffect(() => {
    meetingsApi
      .get(meetingId)
      .then(setMeeting)
      .catch((e) => setError(messageOf(e)));
  }, [meetingId]);

  useEffect(() => {
    if (
      !join ||
      !meeting ||
      !ready ||
      !host.current ||
      !window.JitsiMeetExternalAPI ||
      jitsi.current
    ) {
      return;
    }

    const instance = new window.JitsiMeetExternalAPI(join.domain, {
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
          autoKnock: false,
          enableChat: false,
        },
        securityUi: {
          disableLobbyPassword: true,
        },
      },
    });

    jitsi.current = instance;

    const onConferenceJoined = () => {
      setConnected(true);
    };

    const onConferenceLeft = () => {
      setConnected(false);
      setLobbyReady(false);
    };

    const onRoleChanged = (event: Record<string, unknown>) => {
      if (
        event.role === 'moderator' &&
        meeting.lobbyRequired &&
        (join.role === 'HOST' || join.role === 'MODERATOR')
      ) {
        instance.executeCommand('toggleLobby', true);
        setLobbyReady(true);
      }
    };

    instance.addListener('videoConferenceJoined', onConferenceJoined);
    instance.addListener('videoConferenceLeft', onConferenceLeft);
    instance.addListener('participantRoleChanged', onRoleChanged);

    return () => {
      instance.removeListener('videoConferenceJoined', onConferenceJoined);
      instance.removeListener('videoConferenceLeft', onConferenceLeft);
      instance.removeListener('participantRoleChanged', onRoleChanged);
      instance.dispose();

      if (jitsi.current === instance) {
        jitsi.current = null;
      }
    };
  }, [join, meeting, ready]);

  async function enter() {
    setError('');

    try {
      const value = await meetingsApi.join(meetingId);
      setJoin(value);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  async function createInvitation() {
    if (!meeting) return;

    setError('');
    setInvitationMessage('');
    setInviting(true);

    try {
      if (meeting.guestAccessPolicy === 'DISABLED') {
        throw new Error('Los invitados están deshabilitados para esta reunión.');
      }

      const now = Date.now();
      const requestedExpiry = now + 30 * 60 * 1000;

      const meetingAccessLimit =
        new Date(meeting.scheduledEndAt).getTime() + meeting.joinLateMinutes * 60 * 1000;

      const expiresAtMs = Math.min(requestedExpiry, meetingAccessLimit - 5_000);

      if (expiresAtMs <= now + 30_000) {
        throw new Error(
          'La ventana de acceso de esta reunión está por terminar. No es posible crear otra invitación.',
        );
      }

      const invitation = await meetingsApi.invite(meetingId, {
        displayName: 'Invitado HAVONA',
        expiresAt: new Date(expiresAtMs).toISOString(),
      });

      setInvitationUrl(invitation.joinUrl);

      const copied = await copyText(invitation.joinUrl);

      setInvitationMessage(
        copied
          ? 'Invitación segura creada y copiada al portapapeles.'
          : 'Invitación creada. Usa el campo inferior para copiar el enlace.',
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setInviting(false);
    }
  }

  async function copyInvitation() {
    if (!invitationUrl) return;

    const copied = await copyText(invitationUrl);

    setInvitationMessage(
      copied
        ? 'Enlace copiado al portapapeles.'
        : 'No fue posible copiar automáticamente. Selecciona el enlace manualmente.',
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      {join && (
        <Script src={`https://${join.domain}/external_api.js`} onLoad={() => setReady(true)} />
      )}

      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.22em] text-sky-300">HAVONA CAPITAL GROUP</p>

            <h1 className="font-display text-2xl">{meeting?.title ?? 'Reunión segura'}</h1>

            {join && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/15 px-3 py-1 text-slate-200">
                  {connected ? 'Conectado' : 'Conectando'}
                </span>

                {meeting?.lobbyRequired && (
                  <span className="rounded-full border border-white/15 px-3 py-1 text-slate-200">
                    {lobbyReady ? 'Lobby protegido' : 'Preparando lobby'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!join && <Button onClick={() => void enter()}>Validar e ingresar</Button>}

            {meeting?.guestAccessPolicy === 'SIGNED_INVITATION' && (
              <Button onClick={() => void createInvitation()} disabled={inviting}>
                {inviting ? 'Creando invitación...' : 'Crear invitación'}
              </Button>
            )}
          </div>
        </header>

        {error && <Alert>{error}</Alert>}

        {invitationMessage && (
          <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">
            {invitationMessage}
          </div>
        )}

        {invitationUrl && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-2 text-sm font-semibold">Invitación HAVONA Meet</p>

            <p className="mb-3 text-xs text-slate-300">
              Comparte este enlace únicamente con la persona autorizada.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Enlace de invitación HAVONA Meet"
                readOnly
                value={invitationUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-11 flex-1 rounded-xl border border-white/15 bg-slate-900 px-3 text-sm text-white"
              />

              <Button onClick={() => void copyInvitation()}>Copiar enlace</Button>
            </div>
          </div>
        )}

        <Card className="overflow-hidden border-white/10 bg-slate-900 p-0">
          <div ref={host} className="min-h-[78vh]" aria-label="Sala de videoreunión">
            {!join && (
              <div className="grid min-h-[78vh] place-items-center p-8 text-center text-slate-300">
                El acceso se habilita únicamente dentro de la ventana autorizada.
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
