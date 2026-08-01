'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Field, SelectField, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { api, messageOf } from '@/lib/api';
import { formatDate } from '@/lib/crm';
import type { ApiPage, Owner, Stage } from '@/lib/crm';

type Assignment = {
  id: string;
  createdAt: string;
  endedAt?: string;
  assignee: Owner;
  assignedBy: Owner;
};
type ProspectTag = { tag: { id: string; name: string; color: string } };
type Consent = { id: string; type: string; acceptedAt: string; policyVersion: string };
type LeadEvent = { id: string; type: string; createdAt: string };
type DetailOpportunity = {
  id: string;
  title: string;
  priority: string;
  status: string;
  stage: Stage;
  owner?: Owner;
};
type DetailActivity = { id: string; summary: string; createdAt: string; actor?: Owner };
type DetailNote = { id: string; body: string; createdAt: string; editedAt?: string; author: Owner };
type Detail = {
  name: string;
  interest: string;
  city: string;
  source: { name: string };
  email?: string;
  phone?: string;
  landing: string;
  consents: Consent[];
  events: LeadEvent[];
  assignments: Assignment[];
  tags: ProspectTag[];
  opportunities: DetailOpportunity[];
  activities: DetailActivity[];
  notes: DetailNote[];
};

export default function CrmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail>();
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<Owner[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [opportunity, setOpportunity] = useState('');
  const [task, setTask] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [interaction, setInteraction] = useState('');
  const [method, setMethod] = useState('PHONE');

  const load = useCallback(async () => {
    try {
      const [detail, catalog, people] = await Promise.all([
        api<Detail>(`/crm/prospects/${id}`),
        api<Stage[]>('/crm/stages'),
        api<ApiPage<Owner>>('/users?page=1&pageSize=100').catch(() => ({
          data: [],
          meta: { page: 1, pageSize: 100, total: 0 },
        })),
      ]);
      setData(detail);
      setStages(catalog);
      setUsers(people.data);
    } catch (reason) {
      setError(messageOf(reason));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, methodName: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: methodName, body: JSON.stringify(body) });
      await load();
      return true;
    } catch (reason) {
      setError(messageOf(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function move(item: DetailOpportunity, stageId: string) {
    const target = stages.find((stage) => stage.id === stageId);
    if (target?.key === 'closed') {
      setError('Seleccione expresamente Ganada o Perdida para cerrar la oportunidad.');
      return;
    }
    await act(`/crm/opportunities/${item.id}/stage`, 'PUT', { stageId });
  }

  if (!data) return <>{error ? <Alert>{error}</Alert> : <Skeleton className="h-96" />}</>;
  const owner = data.assignments.find((item) => !item.endedAt)?.assignee;
  return (
    <>
      <PageHeader
        title={data.name}
        description={`${data.interest.replaceAll('-', ' ')} · ${data.city} · ${data.source.name}`}
      />
      {error && <Alert>{error}</Alert>}
      <div className="crm-360">
        <aside className="crm-identity">
          <span>RELACIÓN 360</span>
          <h2>Contexto esencial</h2>
          <dl>
            <Info label="Correo" value={data.email || 'No suministrado'} />
            <Info label="Teléfono" value={data.phone || 'No suministrado'} />
            <Info label="Origen" value={`${data.source.name} · ${data.landing}`} />
            <Info label="Consentimientos" value={String(data.consents.length)} />
          </dl>
          <SelectField
            label="Responsable comercial"
            value={owner?.id || ''}
            disabled={!users.length || busy}
            onChange={(event) =>
              void act(`/crm/prospects/${id}/assignment`, 'PUT', { assigneeId: event.target.value })
            }
          >
            <option value="">Sin asignar</option>
            {users.map((user) => (
              <option value={user.id} key={user.id}>
                {user.name}
              </option>
            ))}
          </SelectField>
          <div className="crm-tagline">
            {data.tags.length ? (
              data.tags.map((item) => (
                <span key={item.tag.id} style={{ borderColor: item.tag.color }}>
                  {item.tag.name}
                </span>
              ))
            ) : (
              <small>Sin etiquetas todavía.</small>
            )}
          </div>
          <section className="crm-evidence">
            <h3>Evidencia de captación</h3>
            {data.consents.map((item) => (
              <p key={item.id}>
                {item.type} · v{item.policyVersion}
                <small>{formatDate(item.acceptedAt)}</small>
              </p>
            ))}
            {data.events.slice(0, 4).map((item) => (
              <p key={item.id}>
                {item.type}
                <small>{formatDate(item.createdAt)}</small>
              </p>
            ))}
          </section>
        </aside>
        <main className="crm-relationship">
          <section>
            <header>
              <span>OPORTUNIDADES</span>
              <h2>Decisiones en movimiento</h2>
            </header>
            {data.opportunities.length ? (
              data.opportunities.map((item) => (
                <article className="crm-opportunity" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.owner?.name || 'Sin responsable'} · {item.priority}
                    </small>
                  </div>
                  <SelectField
                    label={`Etapa de ${item.title}`}
                    value={item.stage.id}
                    disabled={busy}
                    onChange={(event) => void move(item, event.target.value)}
                  >
                    {stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </SelectField>
                  <OpportunityClose item={item} stages={stages} act={act} />
                </article>
              ))
            ) : (
              <EmptyState
                title="Sin oportunidad activa"
                description="Cree una oportunidad únicamente cuando exista una conversación comercial real."
              />
            )}
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  await act('/crm/opportunities', 'POST', {
                    prospectId: id,
                    title: opportunity,
                    priority: 'MEDIUM',
                  })
                )
                  setOpportunity('');
              }}
              className="crm-inline-form"
            >
              <Field
                label="Nueva oportunidad"
                value={opportunity}
                onChange={(event) => setOpportunity(event.target.value)}
                required
              />
              <Button busy={busy}>Crear</Button>
            </form>
          </section>
          <section>
            <header>
              <span>ACTIVIDAD</span>
              <h2>Historia verificable</h2>
            </header>
            <ol className="crm-timeline">
              {data.activities.map((item) => (
                <li key={item.id}>
                  <i />
                  <div>
                    <strong>{item.summary}</strong>
                    <span>
                      {item.actor?.name || 'Sistema'} · {formatDate(item.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <header>
              <span>ASIGNACIÓN</span>
              <h2>Responsabilidad trazable</h2>
            </header>
            <ol className="crm-assignment-history">
              {data.assignments.map((item) => (
                <li key={item.id}>
                  <strong>{item.assignee.name}</strong>
                  <span>
                    Asignado por {item.assignedBy.name} · {formatDate(item.createdAt)}
                    {item.endedAt ? ` · finalizó ${formatDate(item.endedAt)}` : ' · actual'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </main>
        <aside className="crm-actions">
          <section>
            <h2>Nota interna</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (await act('/crm/notes', 'POST', { prospectId: id, body: note })) setNote('');
              }}
            >
              <label>
                Contexto para el equipo
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={4000}
                  required
                />
              </label>
              <Button busy={busy}>Guardar nota</Button>
            </form>
            {data.notes.slice(0, 4).map((item) => (
              <blockquote key={item.id}>
                {item.body}
                <small>
                  {item.author.name} · {formatDate(item.createdAt)}
                  {item.editedAt ? ' · editada' : ''}
                </small>
              </blockquote>
            ))}
          </section>
          <section>
            <h2>Próxima tarea</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!owner) {
                  setError('Asigne un responsable antes de crear una tarea');
                  return;
                }
                if (
                  await act('/crm/tasks', 'POST', {
                    prospectId: id,
                    assigneeId: owner.id,
                    title: task,
                    dueAt: new Date(dueAt).toISOString(),
                    priority: 'MEDIUM',
                  })
                ) {
                  setTask('');
                  setDueAt('');
                }
              }}
            >
              <Field
                label="Título"
                value={task}
                onChange={(event) => setTask(event.target.value)}
                required
              />
              <Field
                label="Fecha límite"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                required
              />
              <Button busy={busy}>Crear tarea</Button>
            </form>
          </section>
          <section>
            <h2>Registrar contacto</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  await act('/crm/interactions', 'POST', {
                    prospectId: id,
                    method,
                    summary: interaction,
                    occurredAt: new Date().toISOString(),
                  })
                )
                  setInteraction('');
              }}
            >
              <SelectField
                label="Medio"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="PHONE">Llamada</option>
                <option value="EMAIL">Correo</option>
                <option value="MEETING">Reunión</option>
                <option value="OTHER">Otro</option>
              </SelectField>
              <label>
                Resumen
                <textarea
                  value={interaction}
                  onChange={(event) => setInteraction(event.target.value)}
                  maxLength={1200}
                  required
                />
              </label>
              <Button busy={busy}>Registrar interacción</Button>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function OpportunityClose({
  item,
  stages,
  act,
}: {
  item: DetailOpportunity;
  stages: Stage[];
  act: (path: string, method: string, body: unknown) => Promise<boolean>;
}) {
  const closed = stages.find((stage) => stage.key === 'closed');
  if (item.status !== 'OPEN' || !closed) return null;
  return (
    <div className="crm-close-actions">
      <button
        type="button"
        onClick={() =>
          void act(`/crm/opportunities/${item.id}/stage`, 'PUT', {
            stageId: closed.id,
            outcome: 'WON',
          })
        }
      >
        Cerrar ganada
      </button>
      <button
        type="button"
        onClick={() =>
          void act(`/crm/opportunities/${item.id}/stage`, 'PUT', {
            stageId: closed.id,
            outcome: 'LOST',
          })
        }
      >
        Cerrar perdida
      </button>
    </div>
  );
}
