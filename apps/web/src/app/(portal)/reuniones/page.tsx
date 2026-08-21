'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Video, Clock3 } from 'lucide-react';
import { Alert, Card, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { Meeting, meetingsApi } from '@/lib/meetings';
import { messageOf } from '@/lib/api';
export default function MeetingsPage() {
  const [items, setItems] = useState<Meeting[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    meetingsApi
      .list()
      .then(setItems)
      .catch((e) => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <PageHeader
        title="HAVONA Meet"
        description="Reuniones corporativas vinculadas con Agenda y CRM, protegidas por permisos y ventanas de acceso."
      />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No hay reuniones programadas"
          description="Las reuniones aparecerán cuando una cita autorizada utilice HAVONA Meet."
        />
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <Card key={m.id} className="flex items-center justify-between gap-5 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-brand-600">
                  {m.status}
                </p>
                <h2 className="mt-1 font-display text-xl text-slate-950">{m.title}</h2>
                <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <Clock3 className="size-4" />
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: m.timezone,
                  }).format(new Date(m.scheduledStartAt))}
                </p>
              </div>
              {m.status !== 'CANCELLED' && (
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                  href={`/meet/${m.id}`}
                >
                  <Video className="size-4" />
                  Entrar
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
