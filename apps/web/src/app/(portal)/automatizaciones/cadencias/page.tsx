'use client';
import { useEffect, useState } from 'react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { Clock3, ShieldCheck, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/page';
import { Cadence, CadenceEnrollment, cadencesApi } from '@/lib/automations';
import { messageOf } from '@/lib/api';

export default function CadencesPage() {
  const [rows, setRows] = useState<Cadence[]>([]),
    [selected, setSelected] = useState<Cadence | null>(null),
    [enrollments, setEnrollments] = useState<CadenceEnrollment[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    Promise.all([cadencesApi.list(), cadencesApi.enrollments()])
      .then(([definitions, activeEnrollments]) => {
        setRows(definitions);
        setSelected(definitions[0] ?? null);
        setEnrollments(activeEnrollments);
      })
      .catch((e) => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <PageHeader
        title="Cadencias"
        description="Seguimientos comerciales gobernados, persistentes y sensibles a respuestas, consentimiento y contexto."
      />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="h-[520px]" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin cadencias"
          description="No existen definiciones autorizadas. Nada se ejecuta sin una cadencia activa."
        />
      ) : (
        <div className="grid overflow-hidden rounded-[28px] border bg-white lg:grid-cols-[360px_1fr]">
          <aside className="border-r" aria-label="Biblioteca de cadencias">
            {rows.map((row) => (
              <button
                key={row.id}
                onClick={() => setSelected(row)}
                className={`w-full border-b p-5 text-left ${selected?.id === row.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
              >
                <span className="flex gap-2 font-display text-lg">
                  <Workflow className="size-4 text-brand-600" />
                  {row.name}
                </span>
                <span className="mt-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {row.status} · {row.key}
                </span>
              </button>
            ))}
          </aside>
          {selected && (
            <section className="p-7 lg:p-10">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand-600">
                Seguimiento gobernado
              </p>
              <h2 className="mt-2 font-display text-3xl">{selected.name}</h2>
              <p className="mt-3 max-w-2xl text-slate-600">{selected.purpose}</p>
              {!selected.activeVersion ? (
                <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                  Esta definición es estructural y permanece inactiva. No puede inscribir contactos.
                </div>
              ) : (
                <>
                  <div className="mt-8 flex flex-wrap gap-5 border-y py-5 text-sm">
                    <span>
                      <ShieldCheck className="mr-2 inline size-4" />
                      {selected.activeVersion.approvalPolicy}
                    </span>
                    <span>
                      <Clock3 className="mr-2 inline size-4" />
                      Versión {selected.activeVersion.version}
                    </span>
                  </div>
                  <h3 className="mt-7 font-display text-xl">Plan de pasos</h3>
                  <ol className="mt-4 space-y-3">
                    {selected.activeVersion.steps.map((step) => (
                      <li key={step.id} className="border-l-2 border-brand-200 pl-4">
                        <b>
                          {step.stepOrder}. {step.type}
                        </b>
                        <p className="text-sm text-slate-500">
                          Espera: {step.delayMinutes} min
                          {step.templateKey ? ` · ${step.templateKey}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <h3 className="mt-7 font-display text-xl">Condiciones de parada</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.activeVersion.stopConditions.map((condition) => (
                      <span
                        key={condition}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold"
                      >
                        {condition}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
      {!loading && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Inscripciones operativas</h2>
          {enrollments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No hay seguimientos inscritos en su ámbito.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-4">Contacto</th>
                    <th>Cadencia</th>
                    <th>Estado</th>
                    <th>Próximo paso</th>
                    <th className="p-4">Control</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-4 font-semibold">{item.prospect.name}</td>
                      <td>{item.version.cadence.name}</td>
                      <td>
                        {item.status}
                        {item.stopReason ? ` · ${item.stopReason}` : ''}
                      </td>
                      <td>
                        {item.nextStepAt
                          ? new Date(item.nextStepAt).toLocaleString('es-CO')
                          : 'Sin paso pendiente'}
                      </td>
                      <td className="p-4">
                        {item.status === 'ACTIVE' && (
                          <button
                            className="mr-3 underline"
                            onClick={() => cadencesApi.pause(item.id).then(() => location.reload())}
                          >
                            Pausar
                          </button>
                        )}
                        {item.status === 'PAUSED' && (
                          <button
                            className="mr-3 underline"
                            onClick={() =>
                              cadencesApi.resume(item.id).then(() => location.reload())
                            }
                          >
                            Reanudar
                          </button>
                        )}
                        {['ACTIVE', 'PAUSED'].includes(item.status) && (
                          <button
                            className="underline"
                            onClick={() => cadencesApi.stop(item.id).then(() => location.reload())}
                          >
                            Detener
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
