'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Check, LoaderCircle, LockKeyhole, Mic, Send, Sparkles, Square, UserRound, Volume2, VolumeX } from 'lucide-react';
import { createHenryConversation, escalateHenry, getHenryConversation, getHenrySpeech, HenryMessage, HenrySession, pageContextFromPath, sendHenryMessage, sendHenryVoice } from '@/lib/henry';
import { messageOf } from '@/lib/api';
import { HenryMessageContent } from './henry-message-content';

const intents = ['Quiero revisar mi pensión', 'Quiero proteger a mi familia', 'Quiero construir patrimonio', 'Quiero proteger mi empresa'];

export function HenryConversation({ variant, internal, storageScope, onActivity }: { variant: 'full' | 'global'; internal: boolean; storageScope: string; onActivity?: (state: 'online' | 'thinking' | 'action' | 'escalating') => void }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const context = pageContextFromPath(pathname);
  const sessionKey = `havona_henry_session_v2_${storageScope}`;
  const draftKey = `havona_henry_draft_v2_${storageScope}`;
  const [session, setSession] = useState<HenrySession>();
  const [messages, setMessages] = useState<HenryMessage[]>([]);
  const [consent, setConsent] = useState(internal);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [escalated, setEscalated] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordingStarted = useRef(0);
  const playing = useRef<HTMLAudioElement | null>(null);
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');

  useEffect(() => {
    const storedDraft = localStorage.getItem(draftKey);
    if (storedDraft) setDraft(storedDraft);
    const raw = localStorage.getItem(sessionKey);
    if (!raw) { setLoading(false); return; }
    try {
      const restored = JSON.parse(raw) as HenrySession;
      getHenryConversation(restored, internal).then(({ data }) => {
        setSession(restored); setMessages(data.messages); setConsent(true); setEscalated(data.status === 'WAITING_HUMAN');
      }).catch(() => localStorage.removeItem(sessionKey)).finally(() => setLoading(false));
    } catch { localStorage.removeItem(sessionKey); setLoading(false); }
  }, [draftKey, internal, sessionKey]);

  useEffect(() => {
    const element = transcript.current;
    if (!element) return;
    element.scrollTo?.({ top: element.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, sending, reduced]);

  async function start(initial?: string) {
    if (!consent || sending) return;
    setSending(true); onActivity?.('thinking'); setError('');
    try {
      const { data } = await createHenryConversation(internal ? 'henry-copilot' : context.section ?? 'henry-web', context, internal);
      const next = { id: data.id, accessToken: data.accessToken };
      localStorage.setItem(sessionKey, JSON.stringify(next)); setSession(next); setMessages(data.messages);
      if (initial) await submitMessage(next, initial, data.messages);
    } catch (reason) { setError(messageOf(reason)); }
    finally { setSending(false); setLoading(false); onActivity?.('online'); }
  }

  async function submitMessage(active: HenrySession, content: string, current = messages) {
    const messageId = crypto.randomUUID();
    const optimistic: HenryMessage = { id: messageId, role: 'USER', content, status: 'PROCESSING', createdAt: new Date().toISOString() };
    setMessages([...current, optimistic]); setDraft(''); localStorage.removeItem(draftKey); setSending(true); onActivity?.('thinking'); setError('');
    try {
      const { data } = await sendHenryMessage(active, content, messageId, context, internal);
      setMessages((items) => [...items.map((item) => item.id === messageId ? { ...item, status: 'COMPLETED' } : item), ...(data.message ? [data.message] : [])]);
      if (data.status === 'ESCALATED') { setEscalated(true); onActivity?.('escalating'); }
    } catch (reason) {
      setMessages((items) => items.filter((item) => item.id !== messageId)); setDraft(content); localStorage.setItem(draftKey, content);
      setError(`${messageOf(reason)} Su mensaje quedó guardado en este dispositivo.`);
    } finally { setSending(false); onActivity?.('online'); }
  }

  async function send(event: FormEvent) {
    event.preventDefault(); const content = draft.trim(); if (!content || sending) return;
    if (!session) return start(content);
    return submitMessage(session, content);
  }

  async function requestHuman() {
    if (!session || escalated || sending) return;
    setSending(true); onActivity?.('escalating'); setError('');
    try { await escalateHenry(session); setEscalated(true); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setSending(false); onActivity?.('online'); }
  }

  async function toggleVoice() {
    if (voiceState === 'speaking') { playing.current?.pause(); playing.current = null; setVoiceState('idle'); return; }
    if (voiceState === 'listening') { recorder.current?.stop(); return; }
    if (!session || sending || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(session ? 'El navegador no permite usar el micrófono. Puede continuar por texto.' : 'Inicie la conversación antes de usar el micrófono.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunks.current = []; recordingStarted.current = Date.now(); recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunks.current, { type: next.mimeType || 'audio/webm' });
        setVoiceState('processing'); setSending(true); onActivity?.('thinking'); setError('');
        try {
          const { data } = await sendHenryVoice(session, audio, Date.now() - recordingStarted.current, context, internal);
          const voiceUser: HenryMessage = { id: crypto.randomUUID(), role: 'USER', content: data.transcript.transcript, status: 'COMPLETED', createdAt: new Date().toISOString() };
          setMessages((items) => [...items, voiceUser, ...(data.message ? [data.message] : [])]);
          if (data.message) {
            const spoken = await getHenrySpeech(session, data.message.id, data.voiceSessionId, internal);
            const url = URL.createObjectURL(spoken); const player = new Audio(url); playing.current = player; setVoiceState('speaking');
            player.onended = () => { URL.revokeObjectURL(url); playing.current = null; setVoiceState('idle'); };
            player.onerror = () => { URL.revokeObjectURL(url); playing.current = null; setVoiceState('idle'); setError('La respuesta textual está disponible, pero el audio no pudo reproducirse.'); };
            await player.play();
          } else setVoiceState('idle');
        } catch (reason) { setVoiceState('idle'); setError(`${messageOf(reason)} Puede continuar por texto.`); }
        finally { setSending(false); onActivity?.('online'); }
      };
      next.start(250); setVoiceState('listening');
    } catch { setError('No fue posible acceder al micrófono. Revise el permiso del navegador o continúe por texto.'); setVoiceState('idle'); }
  }

  if (loading) return <div className="henry-loading"><LoaderCircle className="animate-spin"/><span>Recuperando conversación segura…</span></div>;
  const console = <section className={`henry-console ${variant === 'global' ? 'is-global' : ''}`} aria-label={internal ? 'Copiloto Henry' : 'Conversación con Henry'}>
    <header><div className="henry-presence"><span>H</span><div><strong>Henry</strong><small>{internal ? 'Copiloto comercial · contexto autorizado' : 'Asistente virtual · Canal web'}</small></div></div><i className={session ? 'is-online' : ''}>{session ? 'Sesión activa' : 'Listo para conversar'}</i></header>
    {!session ? <div className="henry-consent">
      <div><LockKeyhole/><p><strong>{internal ? 'Copiloto contextual' : 'Antes de comenzar'}</strong><span>{internal ? 'Henry consulta únicamente información permitida por su rol y la página activa.' : 'La conversación será persistida para orientar su solicitud. Henry no reemplaza la asesoría humana.'}</span></p></div>
      {!internal && <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/><span>Autorizo el tratamiento de mis datos según la <Link href="/privacidad">política de privacidad</Link>.</span></label>}
      <p>{internal ? 'Puede comenzar con una solicitud:' : 'Puede iniciar por una intención:'}</p>
      <div className="henry-starters">{(internal ? ['¿Qué información me falta?', 'Prepárame para esta conversación', 'Sugiere mi siguiente pregunta'] : intents).map((intent) => <button type="button" key={intent} disabled={!consent || sending} onClick={() => void start(intent)}>{intent}<ArrowUpRight/></button>)}</div>
    </div> : <div className="henry-transcript" ref={transcript} role="log" aria-live="polite" aria-label="Mensajes de la conversación">
      <AnimatePresence initial={false}>{messages.filter((message) => ['USER','ASSISTANT'].includes(message.role)).map((message) => <motion.article key={message.id} className={`henry-message ${message.role === 'USER' ? 'is-user' : 'is-henry'}`} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><span>{message.role === 'USER' ? <UserRound/> : 'H'}</span><div><small>{message.role === 'USER' ? 'Usted' : 'Henry · asistente virtual'}</small><HenryMessageContent content={message.content}/></div></motion.article>)}</AnimatePresence>
      {sending && <div className="henry-thinking" role="status"><Sparkles/><span>Henry está procesando el contexto autorizado</span><i/><i/><i/></div>}
    </div>}
    {error && <p className="henry-error" role="alert">{error}</p>}
    {session && <footer>
      {escalated ? <p className="henry-escalated"><Check/> Solicitud humana registrada.</p> : !internal && <button type="button" className="henry-human" onClick={() => void requestHuman()} disabled={sending}>Prefiero hablar con una persona</button>}
      <form onSubmit={send}><label htmlFor={`henry-message-${variant}`} className="sr-only">Mensaje para Henry</label><textarea id={`henry-message-${variant}`} value={draft} onChange={(event) => { setDraft(event.target.value); localStorage.setItem(draftKey,event.target.value); }} maxLength={4000} rows={2} placeholder={internal ? 'Pregunte sobre el contexto actual…' : 'Cuénteme qué le gustaría resolver…'} disabled={sending}/><button type="button" className={`henry-microphone is-${voiceState}`} aria-label={voiceState === 'listening' ? 'Detener grabación' : voiceState === 'speaking' ? 'Detener voz de Henry' : 'Hablar con Henry'} aria-pressed={voiceState === 'listening'} onClick={() => void toggleVoice()} disabled={sending && voiceState !== 'listening'}>{voiceState === 'listening' ? <Square/> : voiceState === 'speaking' ? <VolumeX/> : voiceState === 'processing' ? <LoaderCircle className="animate-spin"/> : <Mic/>}</button><button aria-label="Enviar mensaje" disabled={!draft.trim() || sending}><Send/></button></form>
      {voiceState !== 'idle' && <p className="henry-voice-status" role="status"><Volume2/> {voiceState === 'listening' ? 'Escuchando. Pulse de nuevo para enviar.' : voiceState === 'processing' ? 'Transcribiendo y consultando a Henry…' : 'Henry está respondiendo por voz.'}</p>}
      <small>{internal ? 'El acceso a CRM se resuelve en servidor según su rol.' : 'No comparta contraseñas ni información financiera sensible.'}</small>
    </footer>}
  </section>;
  if (variant === 'global') return console;
  return <div className="henry-stage"><section className="henry-introduction" aria-labelledby="henry-main-title"><p className="henry-stage-index">03 — ASISTENCIA PATRIMONIAL</p><h1 id="henry-main-title">Una conversación que empieza por <em>comprender.</em></h1><p>Henry es el asistente virtual de HAVONA CAPITAL GROUP. Conserva el contexto autorizado y conecta cada conversación con nuestro equipo.</p><div className="henry-principles"><span><Check/> Claro</span><span><Check/> Confidencial</span><span><Check/> Consultivo</span></div><div className="henry-orbit" aria-hidden="true"><i/><i/><i/><span>H</span></div></section>{console}</div>;
}
