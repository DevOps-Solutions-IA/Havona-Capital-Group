'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Alert, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import {
  TrainingEvaluation,
  TrainingRoleplay,
  TrainingScenario,
  TrainingTurn,
  trainingApi,
} from '@/lib/knowledge';
import { messageOf } from '@/lib/api';

export default function Roleplay() {
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [scenario, setScenario] = useState('');
  const [session, setSession] = useState<TrainingRoleplay | null>(null);
  const [transcript, setTranscript] = useState<TrainingTurn[]>([]);
  const [message, setMessage] = useState('');
  const [evaluation, setEvaluation] = useState<TrainingEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    trainingApi
      .scenarios()
      .then((items) => {
        setScenarios(items);
        setScenario(items[0]?.scenarioKey ?? '');
      })
      .catch((cause) => setError(messageOf(cause)));
  }, []);

  async function start() {
    if (!scenario) return;
    setBusy(true);
    setError('');
    try {
      const next = await trainingApi.startRoleplay(scenario);
      setSession(next);
      setTranscript(next.transcript);
      setEvaluation(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!session || !message.trim()) return;
    const content = message.trim();
    setBusy(true);
    setMessage('');
    try {
      const response = await trainingApi.respond(session.id, content);
      setTranscript((current) => [
        ...current,
        { role: 'CONSULTANT', content },
        { role: 'CLIENT', content: response.content },
      ]);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!session || transcript.length < 2) return;
    setBusy(true);
    try {
      const result = await trainingApi.evaluate(session.id, transcript);
      setEvaluation(result.evaluation ?? null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Practicar con Henry"
        description="Henry interpreta un prospecto sintético durante la práctica y cambia a coach únicamente al finalizar."
      />
      {error && <Alert>{error}</Alert>}
      {scenarios.length === 0 && !error ? (
        <Skeleton className="h-72" />
      ) : !session ? (
        <div className="rounded-[24px] border bg-white p-6">
          <label htmlFor="scenario" className="text-sm font-semibold">
            Escenario
          </label>
          <select
            id="scenario"
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            className="mt-2 block h-11 w-full rounded-xl border px-3"
          >
            {scenarios.map((item) => (
              <option key={item.scenarioKey} value={item.scenarioKey}>
                {item.title} · {item.difficulty}
              </option>
            ))}
          </select>
          {scenario && (
            <p className="mt-4 text-sm text-slate-600">
              Objetivo: {scenarios.find((item) => item.scenarioKey === scenario)?.objective}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="mt-5 rounded-full bg-brand-900 px-5 py-2.5 text-white disabled:opacity-50"
          >
            Iniciar simulación
          </button>
        </div>
      ) : !evaluation ? (
        <section className="rounded-[24px] border bg-white p-5" aria-labelledby="roleplay-mode">
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <div>
              <p id="roleplay-mode" className="text-xs font-bold uppercase tracking-widest text-brand-700">
                Roleplay mode · Henry es el prospecto
              </p>
              <p className="mt-1 text-sm text-slate-600">{session.objective}</p>
            </div>
            <button type="button" disabled={busy} onClick={() => void finish()} className="rounded-full border px-4 py-2 text-sm font-semibold">
              Finalizar y evaluar
            </button>
          </div>
          <ol className="my-5 max-h-[55vh] space-y-3 overflow-y-auto" aria-live="polite">
            {transcript.map((turn, index) => (
              <li key={`${turn.role}-${index}`} className={turn.role === 'CONSULTANT' ? 'ml-10 rounded-2xl bg-brand-900 p-4 text-white' : 'mr-10 rounded-2xl bg-slate-100 p-4 text-slate-800'}>
                <span className="text-xs font-bold uppercase tracking-wide">{turn.role === 'CONSULTANT' ? 'Tú' : 'Prospecto'}</span>
                <p className="mt-1">{turn.content}</p>
              </li>
            ))}
          </ol>
          <form onSubmit={(event) => void send(event)} className="flex gap-2">
            <label htmlFor="roleplay-message" className="sr-only">Tu respuesta</label>
            <input id="roleplay-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} disabled={busy} className="h-11 flex-1 rounded-xl border px-3" placeholder="Formula una pregunta o responde al prospecto" />
            <button disabled={busy || !message.trim()} className="rounded-full bg-brand-900 px-5 text-white disabled:opacity-50">Enviar</button>
          </form>
        </section>
      ) : (
        <section className="space-y-6" aria-labelledby="coach-mode">
          <div className="rounded-[24px] border bg-white p-6">
            <p id="coach-mode" className="text-xs font-bold uppercase tracking-widest text-brand-700">Coach mode · Evaluación final</p>
            <p className="mt-2 font-display text-5xl text-brand-950">{evaluation.score}/100</p>
            {evaluation.compliance.critical && <Alert>Se detectó un riesgo crítico de cumplimiento.</Alert>}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5">
              <h2 className="font-display text-2xl">Fortalezas</h2>
              <ul className="mt-3 space-y-2">{evaluation.feedback.strengths.map((item) => <li key={item.criterion}>{item.criterion.replaceAll('_', ' ')} · {item.score}/5</li>)}</ul>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <h2 className="font-display text-2xl">Oportunidades</h2>
              <ul className="mt-3 space-y-3">{evaluation.feedback.opportunities.map((item) => <li key={item.criterion}><strong>{item.criterion.replaceAll('_', ' ')}</strong><p className="text-sm text-slate-600">{item.improvement}</p></li>)}</ul>
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="font-display text-2xl">Momento clave perdido</h2>
            <p className="mt-2 text-slate-700">{evaluation.feedback.missedKeyMoment}</p>
            <h3 className="mt-5 font-semibold">Mejor pregunta que podrías haber hecho</h3>
            <p className="mt-1 text-slate-700">{evaluation.feedback.bestQuestion}</p>
          </div>
        </section>
      )}
    </>
  );
}
