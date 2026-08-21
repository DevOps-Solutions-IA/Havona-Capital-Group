'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { Archive, Pause, Play, Plus, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/page';
import { AutomationWorkflow, automationsApi } from '@/lib/automations';
import { messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const triggerOptions = [
  ['PROSPECT_CREATED', 'Prospecto creado'],
  ['PROSPECT_ASSIGNED', 'Prospecto asignado'],
  ['OPPORTUNITY_STAGE_CHANGED', 'Etapa de oportunidad'],
  ['CALENDAR_BEFORE_APPOINTMENT', 'Antes de cita'],
  ['CALENDAR_AFTER_APPOINTMENT', 'Después de cita'],
  ['COMMUNICATION_INBOUND', 'Mensaje recibido'],
  ['COMMUNICATION_DELIVERY_FAILED', 'Entrega fallida'],
  ['COMMUNICATION_OPT_OUT', 'Exclusión'],
];

export default function AutomationsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<AutomationWorkflow[]>([]);
  const [selected, setSelected] = useState<AutomationWorkflow | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [creating, setCreating] = useState(false);
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [trigger, setTrigger] = useState('PROSPECT_CREATED'),
    [taskTitle, setTaskTitle] = useState('Seguimiento comercial');
  const selectedId = selected?.id;
  const load = useCallback(async () => {
    try {
      setError('');
      const result = await automationsApi.list();
      setRows(result.data);
      if (selectedId) setSelected(await automationsApi.get(selectedId));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      setError('');
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
    await act(async () => {
      const created = await automationsApi.create({
        name,
        description: description || undefined,
        scope: 'OWN',
        trigger: { type: trigger, definition: {} },
        actions: [
          {
            type: 'CREATE_CRM_TASK',
            definition: { title: taskTitle, assignee: 'ENTITY_OWNER', dueInMinutes: 60 },
            approvalMode: 'AUTO',
          },
        ],
      });
      setSelected(created);
      setCreating(false);
      setName('');
      setDescription('');
    });
  }
  return (
    <>
      <PageHeader
        title="Automatizaciones"
        description="Workflows corporativos determinísticos con trazabilidad, consentimiento y control humano."
      />
      {error && <Alert>{error}</Alert>}
      <div className="mb-5 flex items-center justify-between border-y border-slate-200 py-4">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">
          Automations Core · {rows.length} workflows reales
        </p>
        {can('automations.create') && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-full bg-brand-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="mr-2 inline size-4" />
            Crear workflow
          </button>
        )}
      </div>
      {creating && (
        <form
          onSubmit={submit}
          className="mb-6 grid gap-4 rounded-[24px] border border-brand-100 bg-white p-6 shadow-sm md:grid-cols-2"
        >
          <label className="text-sm font-semibold">
            Nombre
            <input
              required
              minLength={3}
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border px-3 font-normal"
            />
          </label>
          <label className="text-sm font-semibold">
            Trigger
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border px-3 font-normal"
            >
              {triggerOptions.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Descripción
            <input
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border px-3 font-normal"
            />
          </label>
          <label className="text-sm font-semibold">
            Primera tarea real
            <input
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border px-3 font-normal"
            />
          </label>
          <button
            disabled={busy}
            className="w-fit rounded-full bg-brand-600 px-5 py-2.5 font-semibold text-white md:col-span-2"
          >
            Guardar como borrador
          </button>
        </form>
      )}
      {loading ? (
        <Skeleton className="h-[560px]" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin workflows"
          description="Cree un workflow estructurado; nada se ejecutará hasta activarlo explícitamente."
        />
      ) : (
        <div className="grid min-h-[560px] overflow-hidden rounded-[28px] border bg-white lg:grid-cols-[360px_1fr]">
          <section className="border-b lg:border-b-0 lg:border-r" aria-label="Workflows">
            {rows.map((row) => (
              <button
                key={row.id}
                onClick={() => void act(async () => setSelected(await automationsApi.get(row.id)))}
                className={`w-full border-b p-5 text-left hover:bg-brand-50 ${selected?.id === row.id ? 'bg-brand-50' : ''}`}
              >
                <span className="flex items-center gap-2 font-display text-lg text-slate-950">
                  <Workflow className="size-4 text-brand-600" />
                  {row.name}
                </span>
                <span className="mt-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {row.status} · v{row.version}
                </span>
              </button>
            ))}
          </section>
          {!selected ? (
            <div className="grid place-items-center p-8">
              <EmptyState
                title="Seleccione un workflow"
                description="Revise definición y ejecuciones persistidas."
              />
            </div>
          ) : (
            <section className="p-6 lg:p-9">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand-600">
                    {selected.scope} · {selected.status}
                  </p>
                  <h2 className="mt-2 font-display text-3xl text-slate-950">{selected.name}</h2>
                  <p className="mt-2 max-w-2xl text-slate-600">
                    {selected.description || 'Sin descripción.'}
                  </p>
                </div>
                {can('automations.activate') && (
                  <div className="flex gap-2">
                    {selected.status !== 'ACTIVE' && (
                      <button
                        disabled={busy}
                        onClick={() => void act(() => automationsApi.status(selected.id, 'ACTIVE'))}
                        className="rounded-full border px-4 py-2 text-sm"
                      >
                        <Play className="mr-1 inline size-4" />
                        Activar
                      </button>
                    )}
                    {selected.status === 'ACTIVE' && (
                      <button
                        disabled={busy}
                        onClick={() => void act(() => automationsApi.status(selected.id, 'PAUSED'))}
                        className="rounded-full border px-4 py-2 text-sm"
                      >
                        <Pause className="mr-1 inline size-4" />
                        Pausar
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => void act(() => automationsApi.status(selected.id, 'ARCHIVED'))}
                      className="rounded-full border px-4 py-2 text-sm text-red-700"
                    >
                      <Archive className="mr-1 inline size-4" />
                      Archivar
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-8 border-t pt-6">
                <h3 className="font-display text-xl">Definición</h3>
                <ol className="mt-4 space-y-3">
                  <li className="border-l-2 border-brand-500 pl-4">
                    <b>Trigger</b>
                    <p className="text-sm text-slate-500">{selected.triggers[0]?.type}</p>
                  </li>
                  {selected.actions.map((a) => (
                    <li key={a.id} className="border-l-2 border-slate-200 pl-4">
                      <b>
                        {a.stepOrder}. {a.type}
                      </b>
                      <p className="text-sm text-slate-500">Control: {a.approvalMode}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-8 border-t pt-6">
                <h3 className="font-display text-xl">Ejecuciones recientes</h3>
                {selected.executions.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Todavía no hay ejecuciones reales.</p>
                ) : (
                  <div className="mt-4 divide-y">
                    {selected.executions.map((x) => (
                      <div key={x.id} className="flex justify-between py-3 text-sm">
                        <span>{new Date(x.createdAt).toLocaleString('es-CO')}</span>
                        <b>
                          {x.status}
                          {x.failureCode ? ` · ${x.failureCode}` : ''}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
