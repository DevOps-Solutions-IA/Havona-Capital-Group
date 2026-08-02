'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Check, LoaderCircle, LockKeyhole, Send, Sparkles, UserRound } from 'lucide-react';
import { createHenryConversation, escalateHenry, getHenryConversation, HenryMessage, HenrySession, pageContextFromPath, sendHenryMessage } from '@/lib/henry';
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
      <form onSubmit={send}><label htmlFor={`henry-message-${variant}`} className="sr-only">Mensaje para Henry</label><textarea id={`henry-message-${variant}`} value={draft} onChange={(event) => { setDraft(event.target.value); localStorage.setItem(draftKey,event.target.value); }} maxLength={4000} rows={2} placeholder={internal ? 'Pregunte sobre el contexto actual…' : 'Cuénteme qué le gustaría resolver…'} disabled={sending}/><button aria-label="Enviar mensaje" disabled={!draft.trim() || sending}><Send/></button></form>
      <small>{internal ? 'El acceso a CRM se resuelve en servidor según su rol.' : 'No comparta contraseñas ni información financiera sensible.'}</small>
    </footer>}
  </section>;
  if (variant === 'global') return console;
  return <div className="henry-stage"><section className="henry-introduction" aria-labelledby="henry-main-title"><p className="henry-stage-index">03 — ASISTENCIA PATRIMONIAL</p><h1 id="henry-main-title">Una conversación que empieza por <em>comprender.</em></h1><p>Henry es el asistente virtual de HAVONA CAPITAL GROUP. Conserva el contexto autorizado y conecta cada conversación con nuestro equipo.</p><div className="henry-principles"><span><Check/> Claro</span><span><Check/> Confidencial</span><span><Check/> Consultivo</span></div><div className="henry-orbit" aria-hidden="true"><i/><i/><i/><span>H</span></div></section>{console}</div>;
}
