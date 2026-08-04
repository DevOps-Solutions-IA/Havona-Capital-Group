'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GraduationCap, MessagesSquare } from 'lucide-react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { TrainingProgram, TrainingProgress, trainingApi } from '@/lib/knowledge';
import { messageOf } from '@/lib/api';

export default function TrainingHome() {
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [progress, setProgress] = useState<TrainingProgress[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([trainingApi.list(), trainingApi.progress()])
      .then(([p, r]) => {
        setPrograms(p);
        setProgress(r);
      })
      .catch((e) => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, []);
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
    </>
  );
}
