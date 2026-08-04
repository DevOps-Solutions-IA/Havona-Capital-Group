'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  MessageCircle,
  Search,
  Send,
  UserRoundCheck,
  Bot,
  Pause,
  XCircle,
  Link2,
} from 'lucide-react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { communicationsApi, CommunicationThread, ConfigStatus } from '@/lib/communications';
import { messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function CommunicationsPage() {
  const { can } = useAuth(),
    [threads, setThreads] = useState<CommunicationThread[]>([]),
    [selected, setSelected] = useState<CommunicationThread | null>(null),
    [config, setConfig] = useState<ConfigStatus | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [linkOpen, setLinkOpen] = useState(false),
    [prospectId, setProspectId] = useState('');
  const selectedId = selected?.id;
  const load = useCallback(async () => {
    setError('');
    try {
      const [list, status] = await Promise.all([
        communicationsApi.list(search ? `search=${encodeURIComponent(search)}` : ''),
        communicationsApi.config(),
      ]);
      setThreads(list.data);
      setConfig(status);
      if (selectedId) {
        const fresh = await communicationsApi.get(selectedId);
        setSelected(fresh);
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [search, selectedId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function choose(id: string) {
    setError('');
    try {
      setSelected(await communicationsApi.get(id));
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !text.trim()) return;
    const body = text.trim();
    await action(async () => {
      await communicationsApi.send(selected.id, body);
      setText('');
    });
  }
  const configured =
    selected?.channel === 'WHATSAPP' ? config?.whatsapp.configured : config?.email.configured;
  return (
    <>
      <PageHeader
        title="Comunicaciones"
        description="Atención omnicanal corporativa conectada con CRM, Henry y responsables autorizados."
      />
      {error && <Alert>{error}</Alert>}
      <div className="mb-5 flex flex-wrap gap-3 border-y border-slate-200 py-4 text-xs font-semibold uppercase tracking-[.14em] text-slate-600">
        <span className={config?.whatsapp.configured ? 'text-emerald-700' : 'text-amber-700'}>
          WhatsApp · {config?.whatsapp.configured ? 'Configurado' : 'Pendiente'}
        </span>
        <span className="text-slate-300">/</span>
        <span className={config?.email.configured ? 'text-emerald-700' : 'text-amber-700'}>
          Email · {config?.email.configured ? 'Configurado' : 'Pendiente'}
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-[620px]" />
      ) : (
        <div className="min-h-[620px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_25px_80px_-45px_rgba(7,26,51,.35)] lg:grid lg:grid-cols-[360px_1fr]">
          <section
            className="border-b border-slate-200 lg:border-b-0 lg:border-r"
            aria-label="Hilos"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
              className="flex gap-2 border-b border-slate-200 p-4"
            >
              <label className="relative flex-1">
                <span className="sr-only">Buscar comunicaciones</span>
                <Search className="absolute left-3 top-3 size-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-full bg-slate-100 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-brand-300"
                  placeholder="Buscar contacto o asunto"
                />
              </label>
            </form>
            <div className="max-h-[560px] overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="Sin conversaciones"
                    description="Los hilos aparecerán cuando un proveedor configurado reciba o envíe comunicaciones reales."
                  />
                </div>
              ) : (
                threads.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => void choose(t.id)}
                    className={`w-full border-b border-slate-100 p-4 text-left transition hover:bg-brand-50/60 ${selected?.id === t.id ? 'bg-brand-50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-semibold text-slate-900">
                        {t.channel === 'WHATSAPP' ? (
                          <MessageCircle className="size-4 text-emerald-600" />
                        ) : (
                          <Mail className="size-4 text-brand-600" />
                        )}
                        {t.contactDisplayName || t.contactIdentity}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">
                        {t.handlingMode}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-500">
                      {t.messages?.[0]?.bodyText || t.subject || 'Sin vista previa'}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {t.assignedUser?.name || 'Sin asignar'}{' '}
                      {t.unreadCount ? `· ${t.unreadCount} sin leer` : ''}
                    </p>
                  </button>
                ))
              )}
            </div>
          </section>
          {!selected ? (
            <div className="grid place-items-center p-8">
              <EmptyState
                title="Seleccione una conversación"
                description="Revise historial, entrega, consentimiento y responsable sin salir del contexto comercial."
              />
            </div>
          ) : (
            <section
              className="flex min-h-[620px] flex-col"
              aria-label={`Conversación con ${selected.contactDisplayName || selected.contactIdentity}`}
            >
              <header className="border-b border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-600">
                      {selected.channel} · {selected.provider}
                    </p>
                    <h2 className="mt-1 font-display text-2xl text-slate-950">
                      {selected.contactDisplayName || selected.contactIdentity}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {selected.prospect ? `CRM: ${selected.prospect.name}` : 'Sin vinculación CRM'}{' '}
                      · {selected.assignedUser?.name || 'Sin responsable'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.channel === 'EMAIL' && can('email_templates.preview') && (
                      <Link
                        href={`/comunicaciones/plantillas?threadId=${selected.id}${selected.prospect?.id ? `&prospectId=${selected.prospect.id}` : ''}`}
                        className="rounded-full border px-3 py-2 text-xs font-semibold"
                      >
                        Responder con plantilla
                      </Link>
                    )}
                    {can('communications.takeover') && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(() => communicationsApi.mode(selected.id, 'HUMAN'))
                          }
                          className="rounded-full border px-3 py-2 text-xs font-semibold"
                        >
                          <UserRoundCheck className="mr-1 inline size-4" />
                          Humano
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(() => communicationsApi.mode(selected.id, 'HENRY'))
                          }
                          className="rounded-full border px-3 py-2 text-xs font-semibold"
                        >
                          <Bot className="mr-1 inline size-4" />
                          Henry
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(() => communicationsApi.mode(selected.id, 'PAUSED'))
                          }
                          className="rounded-full border px-3 py-2 text-xs font-semibold"
                        >
                          <Pause className="mr-1 inline size-4" />
                          Pausar
                        </button>
                      </>
                    )}
                    {can('communications.link_crm') && (
                      <button
                        onClick={() => setLinkOpen((v) => !v)}
                        className="rounded-full border px-3 py-2 text-xs font-semibold"
                      >
                        <Link2 className="mr-1 inline size-4" />
                        CRM
                      </button>
                    )}
                    {can('communications.manage_own') && (
                      <button
                        disabled={busy}
                        onClick={() => void action(() => communicationsApi.close(selected.id))}
                        className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                      >
                        <XCircle className="mr-1 inline size-4" />
                        Cerrar
                      </button>
                    )}
                  </div>
                </div>
                {linkOpen && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (prospectId)
                        void action(() => communicationsApi.link(selected.id, { prospectId }));
                    }}
                    className="mt-4 flex gap-2 border-t pt-4"
                  >
                    <label className="flex-1 text-xs font-semibold text-slate-600">
                      ID de prospecto autorizado
                      <input
                        required
                        value={prospectId}
                        onChange={(e) => setProspectId(e.target.value)}
                        className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
                      />
                    </label>
                    <button className="self-end rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white">
                      Vincular
                    </button>
                  </form>
                )}
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">
                {selected.messages.map((m) => (
                  <article
                    key={m.id}
                    className={`max-w-[82%] ${m.direction === 'OUTBOUND' ? 'ml-auto' : ''}`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-6 ${m.direction === 'OUTBOUND' ? 'bg-brand-800 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}
                    >
                      {m.bodyText || 'Contenido no textual'}
                    </div>
                    <p
                      className={`mt-1 text-[11px] text-slate-400 ${m.direction === 'OUTBOUND' ? 'text-right' : ''}`}
                    >
                      {m.status} ·{' '}
                      {new Intl.DateTimeFormat('es-CO', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(m.createdAt))}
                      {m.generatedByHenry ? ' · Henry' : ''}
                    </p>
                  </article>
                ))}
              </div>
              <form onSubmit={submit} className="border-t border-slate-200 p-4">
                <div className="flex gap-3">
                  <label className="flex-1">
                    <span className="sr-only">Mensaje</span>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      disabled={!configured || selected.status !== 'OPEN'}
                      rows={2}
                      className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-300 disabled:bg-slate-100"
                      placeholder={
                        configured
                          ? 'Escriba una respuesta autorizada'
                          : 'Configure el proveedor para enviar'
                      }
                    />
                  </label>
                  <button
                    disabled={busy || !configured || !text.trim() || selected.status !== 'OPEN'}
                    className="self-end rounded-full bg-brand-700 p-3 text-white disabled:opacity-40"
                    aria-label="Enviar mensaje"
                  >
                    <Send className="size-5" />
                  </button>
                </div>
                {selected.consent?.commercialStatus === 'OPTED_OUT' && (
                  <p className="mt-2 text-xs font-semibold text-red-700">
                    Contacto excluido: no se permiten comunicaciones comerciales.
                  </p>
                )}
              </form>
            </section>
          )}
        </div>
      )}
    </>
  );
}
