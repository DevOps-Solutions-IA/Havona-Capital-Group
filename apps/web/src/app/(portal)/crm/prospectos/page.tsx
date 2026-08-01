'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { Alert, EmptyState, Field, SelectField, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import type { ApiPage, CrmProspect, Stage } from '@/lib/crm';
import { formatDate, priorityLabel } from '@/lib/crm';
export default function CrmProspectsPage() {
  const [items, setItems] = useState<CrmProspect[]>([]),
    [stages, setStages] = useState<Stage[]>([]),
    [search, setSearch] = useState(''),
    [stage, setStage] = useState(''),
    [priority, setPriority] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search) params.set('search', search);
      if (stage) params.set('stage', stage);
      if (priority) params.set('priority', priority);
      const [result, catalog] = await Promise.all([
        api<ApiPage<CrmProspect>>(`/crm/prospects?${params}`),
        api<Stage[]>('/crm/stages'),
      ]);
      setItems(result.data);
      setTotal(result.meta.total);
      setStages(catalog);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [page, priority, search, stage]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      <PageHeader
        title="Relaciones"
        description="Contexto, responsabilidad y siguiente movimiento en una sola bandeja."
      />
      <section className="crm-filterline">
        <label>
          <Search />
          <Field
            label="Buscar"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nombre, correo, teléfono o ciudad"
          />
        </label>
        <SelectField
          label="Etapa"
          value={stage}
          onChange={(event) => {
            setStage(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {stages.map((item) => (
            <option key={item.id} value={item.key}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Prioridad"
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((item) => (
            <option key={item} value={item}>
              {priorityLabel[item]}
            </option>
          ))}
        </SelectField>
      </section>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="h-96" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No hay relaciones para estos filtros"
          description="La bandeja muestra únicamente información real y accesible para su ámbito."
        />
      ) : (
        <div className="crm-relations">
          <div className="crm-relations-head">
            <span>Relación</span>
            <span>Contexto</span>
            <span>Responsable</span>
            <span>Movimiento</span>
          </div>
          {items.map((item) => {
            const opportunity = item.opportunities[0],
              owner = item.assignments[0]?.assignee;
            return (
              <Link href={`/crm/prospectos/${item.id}`} key={item.id} className="crm-relation-row">
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.email || item.phone || 'Contacto no disponible'}</small>
                </div>
                <div>
                  <span>{item.interest.replaceAll('-', ' ')}</span>
                  <small>
                    {item.source.name} · {item.city}
                  </small>
                </div>
                <div>
                  <span>{owner?.name || 'Sin asignar'}</span>
                  <small>
                    {item.tags.map((tag) => tag.tag.name).join(' · ') || 'Sin etiquetas'}
                  </small>
                </div>
                <div>
                  <span>{opportunity?.stage.name || 'Sin oportunidad'}</span>
                  <small>{formatDate(item.lastCapturedAt)}</small>
                </div>
                <ArrowUpRight />
              </Link>
            );
          })}
        </div>
      )}
      <nav className="crm-pagination" aria-label="Paginación">
        <button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
          Anterior
        </button>
        <span>
          Página {page} · {total} relaciones
        </span>
        <button disabled={page * 25 >= total} onClick={() => setPage((value) => value + 1)}>
          Siguiente
        </button>
      </nav>
    </>
  );
}
