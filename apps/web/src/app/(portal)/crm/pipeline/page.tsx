'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Alert, SelectField, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import type { ApiPage, Opportunity, Stage } from '@/lib/crm';
import { priorityLabel } from '@/lib/crm';
import { formatMoney } from '@/lib/crm';
import { useAuth } from '@/lib/auth';
import { OpportunityFinancialForm } from '@/components/crm/opportunity-financial-form';
type Lane = { items: Opportunity[]; page: number; total: number };
export default function PipelinePage() {
  const { can } = useAuth();
  const [stages, setStages] = useState<Stage[]>([]),
    [lanes, setLanes] = useState<Record<string, Lane>>({}),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const catalog = await api<Stage[]>('/crm/stages');
      const pages = await Promise.all(
        catalog.map((stage) =>
          api<ApiPage<Opportunity>>(
            `/crm/opportunities?page=1&pageSize=20&status=OPEN&stage=${stage.key}`,
          ),
        ),
      );
      setStages(catalog);
      setLanes(
        Object.fromEntries(
          catalog.map((stage, index) => [
            stage.id,
            { items: pages[index].data, page: 1, total: pages[index].meta.total },
          ]),
        ),
      );
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
    setBusy(item.id);
    try {
      await api(`/crm/opportunities/${item.id}/stage`, {
        method: 'PUT',
        body: JSON.stringify({ stageId }),
      });
      await load();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy('');
    }
  }
  async function more(stage: Stage) {
    const lane = lanes[stage.id],
      page = lane.page + 1;
    try {
      const result = await api<ApiPage<Opportunity>>(
        `/crm/opportunities?page=${page}&pageSize=20&status=OPEN&stage=${stage.key}`,
      );
      setLanes((current) => ({
        ...current,
        [stage.id]: { items: [...lane.items, ...result.data], page, total: result.meta.total },
      }));
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
            const lane = lanes[stage.id] || { items: [], page: 1, total: 0 };
            return (
              <section key={stage.id} className="crm-lane">
                <header>
                  <span>{String(stage.position).padStart(2, '0')}</span>
                  <h2>{stage.name}</h2>
                  <b>{lane.total}</b>
                </header>
                {lane.items.length === 0 ? (
                  <p className="crm-lane-empty">No hay oportunidades en esta etapa todavía.</p>
                ) : (
                  lane.items.map((item) => (
                    <article key={item.id}>
                      <p>{priorityLabel[item.priority]}</p>
                      <Link href={`/crm/prospectos/${item.prospect.id}`}>{item.title}</Link>
                      <span>
                        {item.prospect.name} · {item.prospect.interest.replaceAll('-', ' ')}
                      </span>
                      <div className="mt-3 space-y-1 text-xs text-slate-600">
                        <strong className="block text-sm text-slate-950">{item.amount && item.currency ? formatMoney(item.amount, item.currency) : 'Monto desconocido'}</strong>
                        <span>{item.expectedCloseDate ? `Cierre esperado: ${item.expectedCloseDate.slice(0, 10)}` : 'Sin fecha esperada'}</span>
                        <span className="block">{item.forecastCategory ? `Forecast: ${item.forecastCategory}` : 'Sin categoría de forecast'}</span>
                      </div>
                      <SelectField
                        label={`Etapa de ${item.title}`}
                        value={item.stage.id}
                        disabled={busy === item.id}
                        onChange={(event) => void move(item, event.target.value)}
                      >
                        {stages.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </SelectField>
                      {can('crm.opportunities') && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-brand-700">Datos financieros</summary><OpportunityFinancialForm opportunity={item} onSaved={load} /></details>}
                    </article>
                  ))
                )}
                {lane.items.length < lane.total && (
                  <button className="crm-load-more" onClick={() => void more(stage)}>
                    Ver más en {stage.name}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
