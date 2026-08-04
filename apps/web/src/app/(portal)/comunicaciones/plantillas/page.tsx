'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, EmptyState, Skeleton } from '@havona/ui';
import { PageHeader } from '@/components/page';
import { emailTemplatesApi, EmailDraft, EmailPreview, EmailTemplate } from '@/lib/email-templates';
import { messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function EmailTemplatesPage() {
  const params = useSearchParams(),
    { can } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]),
    [drafts, setDrafts] = useState<EmailDraft[]>([]),
    [catalog, setCatalog] = useState<Array<{ key: string; category: string }>>([]);
  const [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [preview, setPreview] = useState<EmailPreview | null>(null);
  const [templateId, setTemplateId] = useState(''),
    [prospectId, setProspectId] = useState(params.get('prospectId') ?? ''),
    [threadId] = useState(params.get('threadId') ?? '');
  const [master, setMaster] = useState({
    key: '',
    name: '',
    category: 'PROSPECTING',
    purpose: '',
    subject: '',
    body: '',
  });
  const load = useCallback(async () => {
    try {
      const [t, d, c] = await Promise.all([
        emailTemplatesApi.list(search),
        emailTemplatesApi.drafts(),
        emailTemplatesApi.catalog(),
      ]);
      setTemplates(t);
      setDrafts(d);
      setCatalog(c);
      if (!templateId) setTemplateId(t.find((x) => x.status === 'ACTIVE')?.id ?? '');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [search, templateId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function compose(e: FormEvent) {
    e.preventDefault();
    setError('');
    setPreview(null);
    try {
      const draft = await emailTemplatesApi.createDraft({
        templateId,
        recipientProspectId: prospectId,
        communicationThreadId: threadId || undefined,
      });
      setPreview(await emailTemplatesApi.preview(draft.id));
      await load();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  async function transition(id: string, action: 'approve' | 'activate') {
    try {
      await emailTemplatesApi[action](id);
      await load();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  async function createMaster(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await emailTemplatesApi.create({
        key: master.key,
        name: master.name,
        category: master.category,
        purpose: master.purpose,
        scope: 'CORPORATE',
        locale: 'es-CO',
        tags: [],
      });
      await emailTemplatesApi.version(created.id, {
        subject: master.subject,
        preheader: '',
        messageClassification: 'RELATIONSHIP',
        blocks: [
          { id: 'body', type: 'BODY', mode: 'EDITABLE', content: master.body },
          {
            id: 'identity',
            type: 'FOOTER',
            mode: 'LOCKED',
            content: '<p>HAVONA CAPITAL GROUP</p>',
          },
        ],
        requiredVariables: [],
      });
      setMaster({ key: '', name: '', category: 'PROSPECTING', purpose: '', subject: '', body: '' });
      await load();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }
  return (
    <>
      <PageHeader
        title="Plantillas de email"
        description="Composición corporativa versionada, segura y conectada con CRM y Communications Core."
      />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[1.15fr_.85fr]">
          <section className="space-y-6">
            <div className="flex gap-3 border-y py-4">
              <input
                aria-label="Buscar plantillas"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 flex-1 rounded-full border px-4"
                placeholder="Propósito, categoría o nombre"
              />
              <span className="self-center text-xs font-semibold text-slate-500">
                {templates.length} publicadas/personales · {catalog.length} keys estructurales
              </span>
            </div>
            {templates.length === 0 ? (
              <EmptyState
                title="Sin copy publicado"
                description="El catálogo estructural de 32 keys está listo, pero no se activa contenido comercial ficticio."
              />
            ) : (
              <div className="divide-y border-y">
                {templates.map((t) => (
                  <article key={t.id} className="py-5">
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                          {t.category} · {t.locale}
                        </p>
                        <h2 className="mt-1 font-display text-xl">{t.name}</h2>
                        <p className="text-sm text-slate-500">
                          {t.key} · {t.isCorporate ? 'Corporativa' : 'Personal'} · {t.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {can('email_templates.approve') && t.status === 'REVIEW' && (
                          <button
                            onClick={() => void transition(t.id, 'approve')}
                            className="rounded-full border px-3 text-xs"
                          >
                            Aprobar
                          </button>
                        )}
                        {can('email_templates.manage_corporate') && t.status === 'APPROVED' && (
                          <button
                            onClick={() => void transition(t.id, 'activate')}
                            className="rounded-full bg-brand-800 px-3 text-xs text-white"
                          >
                            Activar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div>
              <h2 className="font-display text-2xl">Catálogo starter</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {catalog.map((item) => (
                  <div key={item.key} className="border-l-2 border-brand-200 py-2 pl-3">
                    <p className="text-sm font-semibold">{item.key}</p>
                    <p className="text-xs text-slate-500">{item.category} · Sin copy activo</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <aside className="space-y-6">
            {can('email_templates.manage_corporate') && (
              <form onSubmit={createMaster} className="rounded-[24px] border bg-brand-50/50 p-6">
                <h2 className="font-display text-2xl">Nueva master corporativa</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Crea metadata y versión REVIEW; nunca activa automáticamente.
                </p>
                <div className="mt-4 grid gap-3">
                  <input
                    required
                    value={master.key}
                    onChange={(e) => setMaster({ ...master, key: e.target.value })}
                    className="h-10 rounded-xl border px-3"
                    placeholder="key autorizada"
                  />
                  <input
                    required
                    value={master.name}
                    onChange={(e) => setMaster({ ...master, name: e.target.value })}
                    className="h-10 rounded-xl border px-3"
                    placeholder="Nombre interno"
                  />
                  <input
                    required
                    value={master.purpose}
                    onChange={(e) => setMaster({ ...master, purpose: e.target.value })}
                    className="h-10 rounded-xl border px-3"
                    placeholder="Propósito"
                  />
                  <input
                    required
                    value={master.subject}
                    onChange={(e) => setMaster({ ...master, subject: e.target.value })}
                    className="h-10 rounded-xl border px-3"
                    placeholder="Asunto"
                  />
                  <textarea
                    required
                    value={master.body}
                    onChange={(e) => setMaster({ ...master, body: e.target.value })}
                    rows={4}
                    className="rounded-xl border px-3 py-2"
                    placeholder="Bloque editable"
                  />
                </div>
                <button className="mt-4 rounded-full bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white">
                  Crear en revisión
                </button>
              </form>
            )}
            <form onSubmit={compose} className="rounded-[24px] border bg-white p-6 shadow-sm">
              <h2 className="font-display text-2xl">Nuevo borrador</h2>
              <p className="mt-1 text-sm text-slate-500">
                Preview solamente. No envía al proveedor.
              </p>
              <label className="mt-5 block text-sm font-semibold">
                Plantilla activa
                <select
                  required
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border px-3"
                >
                  <option value="">Seleccione</option>
                  {templates
                    .filter((t) => t.status === 'ACTIVE')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="mt-4 block text-sm font-semibold">
                Prospecto autorizado
                <input
                  required
                  value={prospectId}
                  onChange={(e) => setProspectId(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border px-3"
                  placeholder="UUID de CRM"
                />
              </label>
              <button
                disabled={!templateId || !prospectId}
                className="mt-5 rounded-full bg-brand-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Crear y previsualizar
              </button>
            </form>
            {preview && (
              <section className="rounded-[24px] border bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                  Preview v{preview.templateVersion}
                </p>
                <h2 className="mt-2 font-display text-2xl">{preview.subject}</h2>
                {preview.missingVariables.length > 0 && (
                  <Alert>Faltan variables: {preview.missingVariables.join(', ')}</Alert>
                )}
                <iframe
                  title="Vista previa segura del correo"
                  sandbox=""
                  srcDoc={preview.html}
                  className="mt-5 h-96 w-full rounded-xl border"
                />
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold">Texto plano</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-sm">{preview.text}</pre>
                </details>
              </section>
            )}
            <section>
              <h2 className="font-display text-2xl">Borradores</h2>
              {drafts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No hay borradores persistidos.</p>
              ) : (
                <div className="mt-2 divide-y">
                  {drafts.map((d) => (
                    <button
                      key={d.id}
                      onClick={async () => {
                        try {
                          setPreview(await emailTemplatesApi.preview(d.id));
                        } catch (e) {
                          setError(messageOf(e));
                        }
                      }}
                      className="w-full py-3 text-left"
                    >
                      <span className="font-semibold">{d.template?.name ?? 'Borrador libre'}</span>
                      <span className="block text-xs text-slate-500">
                        {d.recipientProspect?.name ?? 'Sin destinatario'} · {d.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
