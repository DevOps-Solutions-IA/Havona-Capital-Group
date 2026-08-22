'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Bot, Search } from 'lucide-react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import { HenryAdminConversation, HenryDashboard } from '@/lib/henry-admin';
import type { ApiPage } from '@/lib/crm';

const statusLabel: Record<string, string> = { ACTIVE: 'Activa', WAITING_HUMAN: 'Esperando atención', CLOSED: 'Cerrada', BLOCKED: 'Bloqueada' };

export default function HenryAdminPage() {
  const [dashboard, setDashboard] = useState<HenryDashboard>();
  const [conversations, setConversations] = useState<ApiPage<HenryAdminConversation>>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    const query = new URLSearchParams({ page: '1', pageSize: '25' });
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    Promise.all([
      api<HenryDashboard>('/henry/admin/dashboard'),
      api<ApiPage<HenryAdminConversation>>(`/henry/admin/conversations?${query}`),
    ]).then(([summary, list]) => { setDashboard(summary); setConversations(list); }).catch((reason) => setError(messageOf(reason)));
  }, [search, status]);

  return <div className="henry-admin-workspace">
    <PageHeader title="Henry · Centro de conversaciones" description="Supervisión real de asistencia, herramientas, uso y escalamiento humano."/>
    {error && <Alert>{error}</Alert>}
    {!dashboard ? <Skeleton className="h-52"/> : <section className="henry-admin-pulse">
      <div><span>01 · CONVERSACIONES</span><strong>{dashboard.conversations}</strong><p>Iniciadas</p></div>
      <div><span>02 · ESCALAMIENTO</span><strong>{dashboard.escalated}</strong><p>Con intervención solicitada</p></div>
      <div><span>03 · CRM</span><strong>{dashboard.prospectLinked}</strong><p>Asociadas a prospecto</p></div>
      <div><span>04 · HERRAMIENTAS</span><strong>{dashboard.toolCalls}</strong><p>Ejecuciones controladas</p></div>
      <div className={dashboard.errors ? 'is-alert' : ''}><span>05 · ERRORES</span><strong>{dashboard.errors}</strong><p>Ejecuciones fallidas</p></div>
      <div><span>06 · TOKENS</span><strong>{dashboard.usage.totalTokens ?? 0}</strong><p>Uso reportado</p></div>
    </section>}
    <section className="henry-admin-list">
      <header><div><Bot/><div><span>Registro operativo</span><h2>Conversaciones persistidas</h2></div></div><p>Sin mensajes ficticios ni métricas proyectadas.</p></header>
      <div className="henry-admin-filters"><label><Search/><span className="sr-only">Buscar conversación</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, correo o intención"/></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="ACTIVE">Activa</option><option value="WAITING_HUMAN">Esperando atención</option><option value="CLOSED">Cerrada</option><option value="BLOCKED">Bloqueada</option></select></div>
      {!conversations ? <Skeleton className="h-64"/> : conversations.data.length === 0 ? <EmptyState title="Todavía no hay conversaciones" description="Las conversaciones reales de Henry aparecerán aquí cuando una persona autorice e inicie el canal web."/> : <div className="henry-admin-rows">
        <div className="henry-admin-row is-head"><span>Relación</span><span>Intención</span><span>Estado</span><span>Actividad</span><span aria-hidden="true"/></div>
        {conversations.data.map((item) => <Link className="henry-admin-row" href={`/administracion-henry/${item.id}`} key={item.id}><div><strong>{item.prospect?.name ?? 'Visitante aún no identificado'}</strong><small>{item.prospect?.email ?? `WEB · ${item.publicId.slice(0,8)}`}</small></div><span>{item.intention ?? 'Por identificar'}</span><span><i className={`henry-status is-${item.status.toLowerCase()}`}/>{statusLabel[item.status] ?? item.status}</span><span>{item._count.messages} mensajes · {item._count.executions} ejecuciones</span><ArrowUpRight/></Link>)}
      </div>}
    </section>
  </div>;
}
