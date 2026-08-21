'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Alert, EmptyState } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { HenryMemory, memoryApi } from '@/lib/knowledge';
import { messageOf } from '@/lib/api';
export default function MemoryPage() {
  const [rows, setRows] = useState<HenryMemory[]>([]),
    [key, setKey] = useState('explanation.preference'),
    [value, setValue] = useState(''),
    [error, setError] = useState('');
  async function load() {
    try {
      setRows(await memoryApi.list());
    } catch (e) {
      setError(messageOf(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await memoryApi.save(key, value);
      setValue('');
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function remove(id: string) {
    try {
      await memoryApi.remove(id);
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <>
      <PageHeader
        title="Mi memoria con Henry"
        description="Controla las preferencias operativas que Henry puede conservar de forma explícita."
      />
      {error && <Alert>{error}</Alert>}
      <form
        onSubmit={save}
        className="mb-8 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-[220px_1fr_auto]"
      >
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="h-11 rounded-xl border px-3"
        >
          <option value="explanation.preference">Forma de explicación</option>
          <option value="learning.difficulty">Dificultad de aprendizaje</option>
          <option value="learning.products">Productos estudiados</option>
          <option value="operational.preference">Preferencia operativa</option>
        </select>
        <input
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 rounded-xl border px-3"
          placeholder="Ej.: prefiero ejemplos cortos"
        />
        <button className="rounded-full bg-brand-900 px-5 text-white">Guardar</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title="Sin memoria persistente"
          description="Henry no ha guardado preferencias autorizadas para tu usuario."
        />
      ) : (
        <div className="divide-y rounded-2xl border bg-white">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-5">
              <div>
                <strong>{r.key}</strong>
                <p className="text-sm text-slate-600">{String(r.value)}</p>
                <p className="text-xs text-slate-400">
                  {r.category} · {r.source}
                </p>
              </div>
              <button
                onClick={() => void remove(r.id)}
                className="rounded-full border px-4 py-2 text-sm text-red-700"
              >
                Olvidar
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
