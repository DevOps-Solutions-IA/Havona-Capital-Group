'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Clock3, Wrench } from 'lucide-react';
import { Alert, Skeleton } from '@havona/ui';
import { api, messageOf } from '@/lib/api';
import { HenryAdminDetail } from '@/lib/henry-admin';
import { formatDate } from '@/lib/crm';

export default function HenryConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<HenryAdminDetail>();
  const [error, setError] = useState('');
  useEffect(() => { api<HenryAdminDetail>(`/henry/admin/conversations/${id}`).then(setData).catch((reason) => setError(messageOf(reason))); }, [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Skeleton className="h-[70vh]"/>;
  return <div className="henry-detail">
    <Link href="/administracion-henry" className="henry-detail-back"><ArrowLeft/> Conversaciones</Link>
    <header><div><p>Henry · {data.channel}</p><h1>{data.prospect?.name ?? 'Conversación sin identificar'}</h1><span>{data.intention ?? 'Intención por identificar'} · {data.status}</span></div><aside><strong>{data.messages.length}</strong><span>mensajes registrados</span></aside></header>
    <div className="henry-detail-grid">
      <section className="henry-detail-transcript"><div className="henry-detail-title"><Bot/><div><span>Transcripción append-only</span><h2>Conversación</h2></div></div>{data.messages.filter((message) => ['USER','ASSISTANT'].includes(message.role)).map((message) => <article key={message.id} className={message.role === 'USER' ? 'is-user' : ''}><div><strong>{message.role === 'USER' ? 'Persona' : 'Henry · asistente virtual'}</strong><time>{formatDate(message.createdAt)}</time></div><p>{message.content}</p><small>{message.origin} · {message.status}</small></article>)}</section>
      <aside className="henry-detail-observability">
        <section><span>Relación CRM</span>{data.prospect ? <><strong>{data.prospect.name}</strong><p>{data.prospect.city} · {data.prospect.interest}</p><Link href={`/crm/prospectos/${data.prospect.id}`}>Abrir ficha 360</Link></> : <p>Aún no existe un prospecto asociado.</p>}</section>
        <section><span>Ejecuciones AI</span>{data.executions.length ? data.executions.map((execution) => <div className="henry-execution" key={execution.id}><strong>{execution.provider} · {execution.model}</strong><p><Clock3/> {execution.latencyMs ?? 0} ms · {execution.status}</p><p>{execution.usage?.totalTokens ?? 0} tokens · {execution.iterations} iteraciones</p>{execution.toolCalls.map((tool) => <small key={tool.id}><Wrench/> {tool.name} · {tool.status}</small>)}</div>) : <p>No hay ejecuciones AI registradas.</p>}</section>
        <section><span>Escalamientos</span>{data.escalations.length ? data.escalations.map((item) => <div key={item.id}><strong>{item.reason}</strong><p>{item.summary}</p><small>{item.status} · {formatDate(item.createdAt)}</small></div>) : <p>No se ha solicitado intervención humana.</p>}</section>
      </aside>
    </div>
  </div>;
}
