'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GraduationCap, MessagesSquare } from 'lucide-react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import {
  TrainingPerformance,
  TrainingPlan,
  TrainingProgram,
  TrainingProgress,
  TrainingRoleplay,
  TrainingTeamSummary,
  trainingApi,
} from '@/lib/knowledge';
import { messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function TrainingHome() {
  const { can } = useAuth();
  const canReadTeam = can('training.read_team');
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [progress, setProgress] = useState<TrainingProgress[]>([]);
  const [performance, setPerformance] = useState<TrainingPerformance | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [history, setHistory] = useState<TrainingRoleplay[]>([]);
  const [team, setTeam] = useState<TrainingTeamSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      trainingApi.list(),
      trainingApi.progress(),
      trainingApi.performance(),
      trainingApi.plan(),
      trainingApi.history(),
    ])
      .then(([p, r, metrics, improvement, attempts]) => {
        setPrograms(p);
        setProgress(r);
        setPerformance(metrics);
        setPlan(improvement);
        setHistory(attempts);
      })
      .catch((e) => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (canReadTeam)
      trainingApi
        .team()
        .then(setTeam)
        .catch((cause) => setError(messageOf(cause)));
  }, [canReadTeam]);
  return (
    <>
      <PageHeader
        title="Formación HAVONA"
        description="Aprendizaje corporativo anclado en conocimiento autorizado y práctica consultiva."
      />
      {error && <Alert>{error}</Alert>}
      <div className="mb-8 flex items-center justify-between border-y py-4">
        <span className="text-sm text-slate-600">
          {progress.filter((item) => item.status === 'IN_PROGRESS').length} programas en curso
        </span>
        <Link
          href="/formacion/roleplay"
          className="rounded-full bg-brand-900 px-5 py-2.5 font-semibold text-white"
        >
          <MessagesSquare className="mr-2 inline size-4" />
          Practicar con Henry
        </Link>
      </div>
      {!loading && performance && (
        <section aria-labelledby="training-progress" className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5">
            <h2 id="training-progress" className="text-sm font-semibold text-slate-600">
              Progreso
            </h2>
            <p className="mt-2 font-display text-3xl text-brand-900">
              {performance.roleplaysCompleted}
            </p>
            <p className="text-sm text-slate-600">roleplays completados</p>
          </div>
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-600">Score promedio</h2>
            <p className="mt-2 font-display text-3xl text-brand-900">
              {performance.averageScore ?? '—'}
            </p>
            <p className="text-sm text-slate-600">
              {performance.insufficientEvidence ? 'Evidencia todavía insuficiente' : 'Historial reciente'}
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-600">Siguiente habilidad</h2>
            <p className="mt-2 font-display text-xl text-brand-900">
              {plan?.nextSkill?.replaceAll('_', ' ') ?? 'Completa una primera práctica'}
            </p>
          </div>
        </section>
      )}
      {loading ? (
        <Skeleton className="h-60" />
      ) : programs.length === 0 ? (
        <EmptyState
          title="Sin programas asignados"
          description="La formación publicada y asignada aparecerá aquí; no se muestran contenidos ficticios."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => (
            <Link
              href={`/formacion/${program.id}`}
              key={program.id}
              className="rounded-2xl border bg-white p-6"
            >
              <GraduationCap className="mb-4 text-brand-600" />
              <h2 className="font-display text-2xl">{program.title}</h2>
              <p className="mt-2 text-slate-600">{program.description}</p>
            </Link>
          ))}
        </div>
      )}
      {!loading && plan && (
        <section className="mt-10 border-t pt-8" aria-labelledby="improvement-plan">
          <h2 id="improvement-plan" className="font-display text-3xl text-brand-950">
            Plan de mejora
          </h2>
          {plan.insufficientEvidence && (
            <p className="mt-2 text-sm text-slate-600">
              Aún no hay evidencia suficiente para afirmar una tendencia. Estas prácticas sirven
              para construir una línea base.
            </p>
          )}
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {plan.nextExercises.map((exercise, index) => (
              <li key={exercise.scenarioKey} className="rounded-2xl border bg-white p-5">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-600">
                  Ejercicio {index + 1}
                </span>
                <p className="mt-2 font-semibold">{exercise.title}</p>
                <p className="mt-1 text-sm text-slate-600">{exercise.objective}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!loading && history.length > 0 && (
        <section className="mt-10 border-t pt-8" aria-labelledby="training-history">
          <h2 id="training-history" className="font-display text-3xl text-brand-950">
            Historial
          </h2>
          <ul className="mt-4 divide-y rounded-2xl border bg-white px-5">
            {history.slice(0, 10).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-4">
                <span>{item.scenarioKey.replaceAll('_', ' ')}</span>
                <span className="font-semibold">{item.score == null ? item.status : `${item.score}/100`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {team && (
        <section className="mt-10 border-t pt-8" aria-labelledby="team-training">
          <h2 id="team-training" className="font-display text-3xl text-brand-950">
            Equipo
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Coaching formativo del equipo autorizado; no incluye pipeline, ventas ni metas.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5">
              <strong>{team.notPracticed.length}</strong>
              <p className="text-sm text-slate-600">sin práctica registrada</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <strong>{team.complianceRisk.length}</strong>
              <p className="text-sm text-slate-600">con riesgo de cumplimiento</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <strong>{team.skillsToReinforce.join(', ') || 'Sin evidencia'}</strong>
              <p className="text-sm text-slate-600">habilidades por reforzar</p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
