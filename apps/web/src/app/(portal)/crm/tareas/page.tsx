'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, EmptyState, SelectField, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import type { ApiPage, CrmTask } from '@/lib/crm';
import { formatDate, priorityLabel } from '@/lib/crm';
export default function TasksPage() {
  const [items, setItems] = useState<CrmTask[]>([]),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '50' });
      if (status) query.set('status', status);
      setItems((await api<ApiPage<CrmTask>>(`/crm/tasks?${query}`)).data);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  async function update(id: string, value: string) {
    try {
      await api(`/crm/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: value }),
      });
      await load();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  return (
    <>
      <PageHeader
        title="Tareas"
        description="Compromisos reales ordenados por vencimiento y responsabilidad."
      />
      <div className="max-w-xs">
        <SelectField
          label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos</option>
          <option value="PENDING">Pendiente</option>
          <option value="IN_PROGRESS">En curso</option>
          <option value="COMPLETED">Completada</option>
          <option value="CANCELLED">Cancelada</option>
        </SelectField>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="mt-5 h-80" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No hay tareas en este estado"
          description="Las tareas se crean desde la ficha de una relación real."
        />
      ) : (
        <div className="crm-tasklist">
          {items.map((item) => (
            <article key={item.id}>
              <time>{formatDate(item.dueAt)}</time>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.prospect.name} · {priorityLabel[item.priority]}
                </span>
              </div>
              <SelectField
                label={`Estado de ${item.title}`}
                value={item.status}
                onChange={(event) => void update(item.id, event.target.value)}
              >
                <option value="PENDING">Pendiente</option>
                <option value="IN_PROGRESS">En curso</option>
                <option value="COMPLETED">Completada</option>
                <option value="CANCELLED">Cancelada</option>
              </SelectField>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
