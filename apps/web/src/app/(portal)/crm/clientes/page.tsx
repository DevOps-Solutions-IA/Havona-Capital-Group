'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, EmptyState, Field, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import { formatDate } from '@/lib/crm';
import type { ApiPage, CrmClient } from '@/lib/crm';
export default function ClientsPage() {
  const [items, setItems] = useState<CrmClient[]>([]),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search) query.set('search', search);
      const result = await api<ApiPage<CrmClient>>(`/crm/clients?${query}`);
      setItems(result.data);
      setTotal(result.meta.total);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [page, search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Relaciones convertidas mediante una oportunidad ganada y trazable."
      />
      <div className="max-w-md">
        <Field
          label="Buscar cliente"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="mt-5 h-80" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Aún no hay clientes"
          description="Una relación aparecerá aquí únicamente al avanzar una oportunidad ganada a Cliente."
        />
      ) : (
        <div className="crm-relations">
          {items.map((item) => (
            <Link
              className="crm-relation-row"
              href={`/crm/prospectos/${item.prospect.id}`}
              key={item.id}
            >
              <div>
                <strong>{item.prospect.name}</strong>
                <small>{item.prospect.email || item.prospect.phone}</small>
              </div>
              <div>
                <span>{item.prospect.interest}</span>
                <small>{item.prospect.city}</small>
              </div>
              <div>
                <span>{item.prospect.assignments?.[0]?.assignee?.name || 'Sin responsable'}</span>
                <small>Convertido por {item.convertedBy.name}</small>
              </div>
              <div>
                <span>{item.status}</span>
                <small>{formatDate(item.convertedAt)}</small>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </>
  );
}
function Pagination({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (value: number) => void;
}) {
  return (
    <nav className="crm-pagination" aria-label="Paginación">
      <button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page} · {total} clientes
      </span>
      <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>
        Siguiente
      </button>
    </nav>
  );
}
