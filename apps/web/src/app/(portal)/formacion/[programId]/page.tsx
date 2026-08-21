'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { trainingApi, TrainingProgram } from '@/lib/knowledge';
import { messageOf } from '@/lib/api';
export default function Program() {
  const { programId } = useParams<{ programId: string }>();
  const [program, setProgram] = useState<TrainingProgram | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    trainingApi
      .get(programId)
      .then(setProgram)
      .catch((e) => setError(messageOf(e)));
  }, [programId]);
  return (
    <>
      {error && <Alert>{error}</Alert>}
      {!program ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <PageHeader
            title={program.title}
            description={program.description ?? 'Programa corporativo'}
          />
          <div className="space-y-6">
            {program.modules.map((m) => (
              <section key={m.id} className="rounded-2xl border bg-white p-6">
                <h2 className="font-display text-2xl">{m.title}</h2>
                <ol className="mt-4 divide-y">
                  {m.lessons.map((l) => (
                    <li key={l.id} className="py-4">
                      <strong>{l.title}</strong>
                      <p className="mt-1 text-sm text-slate-600">
                        {l.objective} · {l.estimatedMinutes} min
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
