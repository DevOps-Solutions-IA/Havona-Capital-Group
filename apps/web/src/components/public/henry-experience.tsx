'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Check, LoaderCircle, LockKeyhole, Send, Sparkles, UserRound } from 'lucide-react';
import { createHenryConversation, escalateHenry, getHenryConversation, HenryMessage, HenrySession, sendHenryMessage } from '@/lib/henry';
import { messageOf } from '@/lib/api';

const SESSION_KEY = 'havona_henry_session_v1';
const DRAFT_KEY = 'havona_henry_draft_v1';
const intents = ['Quiero revisar mi pensión', 'Quiero proteger a mi familia', 'Quiero construir patrimonio', 'Quiero proteger mi empresa'];

export function HenryExperience() {
  const reduced = useReducedMotion();
  const [session, setSession] = useState<HenrySession>();
  const [messages, setMessages] = useState<HenryMessage[]>([]);
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [escalated, setEscalated] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedDraft = localStorage.getItem(DRAFT_KEY);
    if (storedDraft) setDraft(storedDraft);
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) { setLoading(false); return; }
    try {
      const restored = JSON.parse(raw) as HenrySession;
      getHenryConversation(restored).then(({ data }) => {
        setSession(restored); setMessages(data.messages); setConsent(true); setEscalated(data.status === 'WAITING_HUMAN');
      }).catch(() => localStorage.removeItem(SESSION_KEY)).finally(() => setLoading(false));
    } catch { localStorage.removeItem(SESSION_KEY); setLoading(false); }
  }, []);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, sending, reduced]);

  async function start(initial?: string) {
    if (!consent || sending) return;
    setSending(true); setError('');
    try {
      const { data } = await createHenryConversation('henry-web');
      const next = { id: data.id, accessToken: data.accessToken };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next); setMessages(data.messages);
      if (initial) await submitMessage(next, initial, data.messages);
    } catch (reason) { setError(messageOf(reason)); }
    finally { setSending(false); setLoading(false); }
  }

  async function submitMessage(active: HenrySession, content: string, current = messages) {
    const messageId = crypto.randomUUID();
    const optimistic: HenryMessage = { id: messageId, role: 'USER', content, status: 'PROCESSING', createdAt: new Date().toISOString() };
    setMessages([...current, optimistic]); setDraft(''); localStorage.removeItem(DRAFT_KEY); setSending(true); setError('');
    try {
      const { data } = await sendHenryMessage(active, content, messageId);
      setMessages((items) => [...items.map((item) => item.id === messageId ? { ...item, status: 'COMPLETED' } : item), ...(data.message ? [data.message] : [])]);
      if (data.status === 'ESCALATED') setEscalated(true);
    } catch (reason) {
      setMessages((items) => items.filter((item) => item.id !== messageId));
      setDraft(content); localStorage.setItem(DRAFT_KEY, content); setError(`${messageOf(reason)} Su mensaje quedó guardado en este dispositivo.`);
    } finally { setSending(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault(); const content = draft.trim(); if (!content || sending) return;
    if (!session) return start(content);
    return submitMessage(session, content);
  }

  async function requestHuman() {
    if (!session || escalated || sending) return;
    setSending(true); setError('');
    try { await escalateHenry(session); setEscalated(true); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setSending(false); }
  }

  if (loading) return <div className="henry-loading"><LoaderCircle className="animate-spin"/><span>Recuperando conversación segura…</span></div>;

  return <div className="henry-stage">
    <section className="henry-introduction" aria-labelledby="henry-main-title">
      <p className="henry-stage-index">03 — ASISTENCIA PATRIMONIAL</p>
      <h1 id="henry-main-title">Una conversación que empieza por <em>comprender.</em></h1>
      <p>Henry es el asistente virtual de HAVONA CAPITAL GROUP. Identifica el contexto inicial, registra lo autorizado y conecta cada conversación con nuestro equipo.</p>
      <div className="henry-principles" aria-label="Principios de Henry">
        <span><Check/> Claro</span><span><Check/> Confidencial</span><span><Check/> Consultivo</span>
      </div>
      <div className="henry-orbit" aria-hidden="true"><i/><i/><i/><span>H</span></div>
    </section>

    <section className="henry-console" aria-label="Conversación con Henry">
      <header><div className="henry-presence"><span>H</span><div><strong>Henry</strong><small>Asistente virtual · Canal web</small></div></div><i className={session ? 'is-online' : ''}>{session ? 'Sesión activa' : 'Listo para conversar'}</i></header>
      {!session ? <div className="henry-consent">
        <div><LockKeyhole/><p><strong>Antes de comenzar</strong><span>La conversación será persistida para orientar su solicitud. Henry no reemplaza la asesoría humana ni solicita información financiera sensible.</span></p></div>
        <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/><span>Autorizo el tratamiento de mis datos para atender esta conversación según la <Link href="/privacidad">política de privacidad</Link>.</span></label>
        <p>Puede iniciar por una intención:</p>
        <div className="henry-starters">{intents.map((intent) => <button key={intent} disabled={!consent || sending} onClick={() => void start(intent)}>{intent}<ArrowUpRight/></button>)}</div>
      </div> : <div className="henry-transcript" ref={transcript} role="log" aria-live="polite" aria-label="Mensajes de la conversación">
        <AnimatePresence initial={false}>{messages.filter((message) => ['USER','ASSISTANT'].includes(message.role)).map((message) => <motion.article key={message.id} className={`henry-message ${message.role === 'USER' ? 'is-user' : 'is-henry'}`} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><span>{message.role === 'USER' ? <UserRound/> : 'H'}</span><div><small>{message.role === 'USER' ? 'Usted' : 'Henry · asistente virtual'}</small><p>{message.content}</p></div></motion.article>)}</AnimatePresence>
        {sending && <div className="henry-thinking" role="status"><Sparkles/><span>Henry está procesando el contexto</span><i/><i/><i/></div>}
      </div>}
      {error && <p className="henry-error" role="alert">{error}</p>}
      {session && <footer>
        {escalated ? <p className="henry-escalated"><Check/> Solicitud humana registrada. El equipo podrá continuar desde el CRM.</p> : <button type="button" className="henry-human" onClick={() => void requestHuman()} disabled={sending}>Prefiero hablar con una persona</button>}
        <form onSubmit={send}><label htmlFor="henry-message" className="sr-only">Escriba su mensaje para Henry</label><textarea id="henry-message" value={draft} onChange={(event) => { setDraft(event.target.value); localStorage.setItem(DRAFT_KEY,event.target.value); }} maxLength={4000} rows={2} placeholder="Cuénteme qué le gustaría resolver…" disabled={sending}/><button aria-label="Enviar mensaje" disabled={!draft.trim() || sending}><Send/></button></form>
        <small>No comparta contraseñas, números de cuenta ni información financiera sensible.</small>
      </footer>}
    </section>
  </div>;
}
