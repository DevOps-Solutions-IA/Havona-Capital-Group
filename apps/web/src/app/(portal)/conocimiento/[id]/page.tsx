'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { knowledgeApi, KnowledgeDocument } from '@/lib/knowledge';
import { messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function KnowledgeDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setDoc(await knowledgeApi.get(id));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function transition(action: 'approve' | 'publish') {
    try {
      await knowledgeApi[action](id);
      await load();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }
  if (!doc)
    return (
      <>
        {error && <Alert>{error}</Alert>}
        <Skeleton className="h-80" />
      </>
    );
  return (
    <>
      {error && <Alert>{error}</Alert>}
      <PageHeader
        title={doc.title}
        description={doc.description ?? 'Documento corporativo versionado.'}
      />
      <div className="rounded-[24px] border bg-white p-6">
        <dl className="grid gap-5 md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-slate-500">Colección</dt>
            <dd className="font-semibold">{doc.collection.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Estado</dt>
            <dd className="font-semibold">{doc.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Tipo</dt>
            <dd className="font-semibold">{doc.type}</dd>
          </div>
        </dl>
        <h2 className="mt-8 font-display text-2xl">Historial de versiones</h2>
        <div className="mt-3 divide-y">
          {doc.versions.map((version) => (
            <div key={version.version} className="flex justify-between py-3">
              <span>Versión {version.version}</span>
              <span>
                {version.status} · {version.ingestions[0]?.status ?? 'sin ingesta'}
              </span>
            </div>
          ))}
        </div>
        {can('knowledge.review') && doc.status === 'REVIEW' && (
          <button
            onClick={() => void transition('approve')}
            className="mt-6 rounded-full bg-brand-900 px-5 py-2.5 text-white"
          >
            Aprobar versión revisada
          </button>
        )}
        {can('knowledge.publish') && doc.status === 'APPROVED' && (
          <button
            onClick={() => void transition('publish')}
            className="mt-6 rounded-full bg-brand-900 px-5 py-2.5 text-white"
          >
            Publicar versión aprobada
          </button>
        )}
      </div>
    </>
  );
}
