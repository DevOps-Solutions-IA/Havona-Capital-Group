'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, SelectField, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import type { ApiPage, Opportunity, Stage } from '@/lib/crm';
import { priorityLabel } from '@/lib/crm';
export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]),
    [items, setItems] = useState<Opportunity[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        api<Stage[]>('/crm/stages'),
        api<ApiPage<Opportunity>>('/crm/opportunities?page=1&pageSize=100&status=OPEN'),
      ]);
      setStages(s);
      setItems(o.data);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function move(item: Opportunity, stageId: string) {
    const target = stages.find((stage) => stage.id === stageId);
    if (target?.key === 'closed') {
      setError('Cierre la oportunidad desde su ficha indicando Ganada o Perdida.');
      return;
    }
    setError('');
    try {
      await api(`/crm/opportunities/${item.id}/stage`, {
        method: 'PUT',
        body: JSON.stringify({ stageId }),
      });
      await load();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Diez etapas, una historia verificable para cada oportunidad."
      />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="crm-kanban" aria-label="Pipeline comercial">
          {stages.map((stage) => {
            const rows = items.filter((item) => item.stage.id === stage.id);
            return (
              <section key={stage.id} className="crm-lane">
                <header>
                  <span>{String(stage.position).padStart(2, '0')}</span>
                  <h2>{stage.name}</h2>
                  <b>{rows.length}</b>
                </header>
                {rows.length === 0 ? (
                  <p className="crm-lane-empty">No hay oportunidades en esta etapa todavía.</p>
                ) : (
                  rows.map((item) => (
                    <article key={item.id}>
                      <p>{priorityLabel[item.priority]}</p>
                      <Link href={`/crm/prospectos/${item.prospect.id}`}>{item.title}</Link>
                      <span>
                        {item.prospect.name} · {item.prospect.interest.replaceAll('-', ' ')}
                      </span>
                  <SelectField
                    label={`Etapa de ${item.title}`}
                        value={item.stage.id}
                        onChange={(event) => void move(item, event.target.value)}
                      >
                        {stages.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </SelectField>
                    </article>
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
