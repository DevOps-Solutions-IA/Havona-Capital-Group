'use client';
import { useState } from 'react';
import { Alert } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { TrainingRoleplay, trainingApi } from '@/lib/knowledge';
import { messageOf } from '@/lib/api';
const scenarios = [
  ['objection_price', 'Objeción de precio'],
  ['think_about_it', 'Lo voy a pensar'],
  ['already_insured', 'Ya tengo seguro'],
  ['no_budget', 'Falta de presupuesto'],
];
export default function Roleplay() {
  const [scenario, setScenario] = useState(scenarios[0]![0]);
  const [session, setSession] = useState<TrainingRoleplay | null>(null);
  const [error, setError] = useState('');
  async function start() {
    try {
      setSession(await trainingApi.startRoleplay(scenario));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }
  return (
    <>
      <PageHeader
        title="Role play comercial"
        description="Simulación de entrenamiento separada por completo de clientes y CRM reales."
      />
      {error && <Alert>{error}</Alert>}
      <div className="rounded-[24px] border bg-white p-6">
        <label className="text-sm font-semibold">
          Escenario
          <select
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            className="mt-2 block h-11 w-full rounded-xl border px-3"
          >
            {scenarios.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => void start()}
          className="mt-5 rounded-full bg-brand-900 px-5 py-2.5 text-white"
        >
          Iniciar simulación
        </button>
        {session && (
          <div className="mt-8 border-l-2 border-brand-300 pl-5">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-700">
              Training simulation
            </p>
            <p className="mt-2 text-slate-700">
              Sesión creada. Continúa la práctica con Henry; ninguna intervención se registrará como
              actividad de un cliente real.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
