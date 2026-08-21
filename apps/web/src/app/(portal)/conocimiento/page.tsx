'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { BookOpen, Search, Upload } from 'lucide-react';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { messageOf } from '@/lib/api';
import { Citation, KnowledgeCollection, KnowledgeDocument, knowledgeApi } from '@/lib/knowledge';
import { useAuth } from '@/lib/auth';

export default function KnowledgePage() {
  const { can } = useAuth();
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]),
    [collections, setCollections] = useState<KnowledgeCollection[]>([]),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<Array<{ score: number; content: string; citation: Citation }>>(
      [],
    ),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  async function load() {
    try {
      const [d, c] = await Promise.all([knowledgeApi.list(), knowledgeApi.collections()]);
      setDocs(d);
      setCollections(c);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function search(e: FormEvent) {
    e.preventDefault();
    try {
      setError('');
      const r = await knowledgeApi.search(query);
      setResults(r.results);
      setMessage(r.message ?? '');
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const data = new FormData(e.currentTarget);
      await knowledgeApi.upload(data);
      e.currentTarget.reset();
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <>
      <PageHeader
        title="Conocimiento corporativo"
        description="Fuentes autorizadas, versionadas y trazables para HAVONA CAPITAL GROUP."
      />
      {error && <Alert>{error}</Alert>}
      <form onSubmit={search} className="mb-8 flex gap-3 rounded-2xl border bg-white p-3">
        <Search className="ml-2 mt-2.5 size-5 text-brand-600" />
        <input
          aria-label="Buscar conocimiento"
          required
          minLength={2}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 px-2 outline-none"
          placeholder="Buscar política, producto o procedimiento"
        />
        <button className="rounded-full bg-brand-900 px-5 py-2.5 font-semibold text-white">
          Buscar
        </button>
      </form>
      {message && <Alert>{message}</Alert>}
      {results.length > 0 && (
        <section className="mb-10 space-y-4" aria-label="Resultados de búsqueda">
          <h2 className="font-display text-2xl">Evidencia autorizada</h2>
          {results.map((r) => (
            <article key={r.citation.chunkId} className="border-l-2 border-brand-300 bg-white p-5">
              <p className="leading-7 text-slate-700">{r.content}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-brand-700">
                {r.citation.title} · v{r.citation.version}
                {r.citation.section ? ` · ${r.citation.section}` : ''}
              </p>
            </article>
          ))}
        </section>
      )}
      {can('knowledge.upload') && collections.length > 0 && (
        <form
          onSubmit={upload}
          className="mb-10 grid gap-4 rounded-[24px] border bg-brand-50/60 p-6 md:grid-cols-2"
        >
          <h2 className="font-display text-2xl md:col-span-2">
            <Upload className="mr-2 inline size-5" />
            Nueva fuente en revisión
          </h2>
          <input
            name="title"
            required
            minLength={3}
            className="h-11 rounded-xl border px-3"
            placeholder="Título"
          />
          <select name="collectionId" required className="h-11 rounded-xl border px-3">
            {collections.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="classification" className="h-11 rounded-xl border px-3">
            <option value="GENERAL">General</option>
            <option value="SALES">Ventas</option>
            <option value="TRAINING">Capacitación</option>
            <option value="COMPLIANCE">Cumplimiento</option>
          </select>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.docx,.txt,.md,.html"
            className="h-11 rounded-xl border bg-white p-2"
          />
          <button className="w-fit rounded-full bg-brand-900 px-5 py-2.5 font-semibold text-white">
            Cargar y procesar
          </button>
        </form>
      )}
      <h2 className="mb-4 font-display text-2xl">Biblioteca vigente</h2>
      {loading ? (
        <Skeleton className="h-64" />
      ) : docs.length === 0 ? (
        <EmptyState
          title="Sin documentos autorizados"
          description="Los documentos aparecen aquí después de su carga, revisión y publicación."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {docs.map((d) => (
            <Link
              href={`/conocimiento/${d.id}`}
              key={d.id}
              className="rounded-2xl border bg-white p-5 transition hover:border-brand-300"
            >
              <BookOpen className="mb-4 size-5 text-brand-600" />
              <h3 className="font-display text-xl">{d.title}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {d.collection.name} · {d.status} · v{d.versions[0]?.version ?? 1}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
