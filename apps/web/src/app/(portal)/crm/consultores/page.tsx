'use client';
import { useEffect, useState } from 'react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import type { CrmConsultant } from '@/lib/crm';
export default function ConsultantsPage() {
  const [items, setItems] = useState<CrmConsultant[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api<CrmConsultant[]>('/crm/consultants')
      .then(setItems)
      .catch((reason) => setError(messageOf(reason)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <PageHeader
        title="Consultores"
        description="Carga comercial real, sin indicadores inventados ni comparaciones artificiales."
      />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="h-80" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No hay consultores activos"
          description="Asigne el rol CONSULTOR desde Administración de usuarios."
        />
      ) : (
        <div className="crm-consultants">
          {items.map((item) => (
            <article key={item.id}>
              <div>
                <span>{item.name.slice(0, 1)}</span>
                <h2>{item.name}</h2>
                <small>{item.email}</small>
              </div>
              <dl>
                <div>
                  <dt>Relaciones</dt>
                  <dd>{item._count.assignedProspects}</dd>
                </div>
                <div>
                  <dt>Oportunidades</dt>
                  <dd>{item._count.opportunities}</dd>
                </div>
                <div>
                  <dt>Tareas activas</dt>
                  <dd>{item._count.crmTasks}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
