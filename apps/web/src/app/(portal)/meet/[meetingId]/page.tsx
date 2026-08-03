'use client';
import Script from 'next/script';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card } from '@havona/ui';
import { Meeting, MeetingJoin, meetingsApi } from '@/lib/meetings';
import { messageOf } from '@/lib/api';
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: Record<string, unknown>,
    ) => { dispose(): void };
  }
}
export default function MeetRoom() {
  const { meetingId } = useParams<{ meetingId: string }>(),
    host = useRef<HTMLDivElement>(null),
    api = useRef<{ dispose(): void } | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null),
    [join, setJoin] = useState<MeetingJoin | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    meetingsApi
      .get(meetingId)
      .then(setMeeting)
      .catch((e) => setError(messageOf(e)));
    return () => api.current?.dispose();
  }, [meetingId]);
  function mount() {
    if (!join || !ready || !host.current || !window.JitsiMeetExternalAPI) return;
    api.current?.dispose();
    api.current = new window.JitsiMeetExternalAPI(join.domain, {
      roomName: join.roomName,
      jwt: join.jwt,
      parentNode: host.current,
      userInfo: { displayName: join.displayName },
      configOverwrite: { prejoinPageEnabled: true, disableDeepLinking: true },
    });
  }
  async function enter() {
    try {
      const value = await meetingsApi.join(meetingId);
      setJoin(value);
      setTimeout(mount, 0);
    } catch (e) {
      setError(messageOf(e));
    }
  }
  useEffect(mount, [join, ready]);
  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      {join && (
        <Script src={`https://${join.domain}/external_api.js`} onLoad={() => setReady(true)} />
      )}
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[.22em] text-sky-300">HAVONA CAPITAL GROUP</p>
            <h1 className="font-display text-2xl">{meeting?.title ?? 'Reunión segura'}</h1>
          </div>
          {!join && <Button onClick={() => void enter()}>Validar e ingresar</Button>}
        </header>
        {error && <Alert>{error}</Alert>}
        <Card className="overflow-hidden border-white/10 bg-slate-900 p-0">
          <div ref={host} className="min-h-[72vh]" aria-label="Sala de videoreunión">
            {!join && (
              <div className="grid min-h-[72vh] place-items-center p-8 text-center text-slate-300">
                El acceso se habilita únicamente dentro de la ventana autorizada.
              </div>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
