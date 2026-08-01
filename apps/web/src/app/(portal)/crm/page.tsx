'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import type { CrmDashboard } from '@/lib/crm';
export default function CrmDashboardPage() {
  const [data, setData] = useState<CrmDashboard>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<CrmDashboard>('/crm/dashboard')
      .then(setData)
      .catch((reason) => setError(messageOf(reason)));
  }, []);
  return (
    <div className="crm-workspace">
      <PageHeader
        title="Pulso comercial"
        description="Una lectura real del trabajo, las relaciones y el movimiento del pipeline."
      />
      {error && <Alert>{error}</Alert>}
      {!data && !error ? (
        <Skeleton className="h-80" />
      ) : (
        data && (
          <>
            <section className="crm-pulse">
              <div>
                <span>01 · ENTRADA</span>
                <strong>{data.newProspects}</strong>
                <p>Prospectos nuevos</p>
              </div>
              <div>
                <span>02 · MOVIMIENTO</span>
                <strong>{data.activeOpportunities}</strong>
                <p>Oportunidades activas</p>
              </div>
              <div>
                <span>03 · COMPROMISOS</span>
                <strong>{data.pendingTasks}</strong>
                <p>Tareas pendientes</p>
              </div>
              <div className={data.overdueTasks ? 'is-alert' : ''}>
                <span>04 · ATENCIÓN</span>
                <strong>{data.overdueTasks}</strong>
                <p>Tareas vencidas</p>
              </div>
            </section>
            <section className="crm-flow">
              <header>
                <div>
                  <span>Pipeline real</span>
                  <h2>El estado de cada conversación.</h2>
                </div>
                <Link href="/crm/pipeline">
                  Abrir pipeline <ArrowUpRight />
                </Link>
              </header>
              {data.pipeline.every((stage) => !stage.total) ? (
                <EmptyState
                  title="El pipeline está listo"
                  description="Las oportunidades aparecerán aquí cuando el equipo las cree desde una relación real."
                />
              ) : (
                <ol>
                  {data.pipeline.map((stage) => (
                    <li key={stage.id}>
                      <span>{String(stage.position).padStart(2, '0')}</span>
                      <div>
                        <strong>{stage.name}</strong>
                        <i
                          style={{
                            width: `${Math.max(4, Math.min(100, (stage.total ?? 0) * 12))}%`,
                          }}
                        />
                      </div>
                      <b>{stage.total ?? 0}</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
