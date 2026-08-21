'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { messageOf } from '@/lib/api';
import {
  cancelHenryScheduledEmail,
  confirmHenryEmail,
  getHenryMessagingOperation,
  HenryMessagingOperation,
  HenrySession,
  requestHenryEmailConfirmation,
} from '@/lib/henry';

export function HenryEmailOperationCard({
  session,
  revision,
}: {
  session: HenrySession;
  revision: number;
}) {
  const [data, setData] = useState<HenryMessagingOperation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getHenryMessagingOperation(session)
      .then(setData)
      .catch(() => setData(undefined));
  }, [session, revision]);
  if (!data?.draft) return null;
  const operation = data.operation;
  const pending = operation?.status === 'AWAITING_CONFIRMATION';
  const scheduled = operation?.status === 'SCHEDULED';

  async function act() {
    setBusy(true);
    setError('');
    try {
      if (pending && operation) await confirmHenryEmail(operation.id);
      else await requestHenryEmailConfirmation(session, data!.draft!.id);
      setData(await getHenryMessagingOperation(session));
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!operation) return;
    setBusy(true);
    setError('');
    try {
      await cancelHenryScheduledEmail(operation.id);
      setData(await getHenryMessagingOperation(session));
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className="mt-4 rounded-[22px] border border-[#d9e6f3] bg-white p-5 shadow-[0_18px_50px_rgba(7,26,51,.08)]"
      aria-label="Operación de correo de Henry"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#0a3d73]">
            <Mail size={15} /> Correo preparado
          </p>
          <h3 className="mt-2 font-display text-xl text-[#071a33]">{data.draft.preview.subject}</h3>
        </div>
        <span className="rounded-full bg-[#eaf4ff] px-3 py-1 text-xs font-medium text-[#0a3d73]">
          {operation?.status ?? 'PREVIEW_READY'}
        </span>
      </div>
      <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-[#667085]">
        {data.draft.preview.text}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
        <ShieldCheck size={14} />
        <span>{data.draft.preview.messageClassification}</span>
        <span>·</span>
        <span>{data.draft.preview.attachmentReferences?.length ?? 0} adjuntos</span>
      </div>
      {scheduled && (
        <p className="mt-3 flex items-center gap-2 text-sm text-[#0a3d73]">
          <CalendarClock size={16} /> Programado para{' '}
          {operation?.scheduledAt
            ? new Date(operation.scheduledAt).toLocaleString('es-CO')
            : 'la hora confirmada'}{' '}
          {operation?.timezone}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {!scheduled && !['QUEUED', 'SENT', 'DELIVERED'].includes(operation?.status ?? '') && (
          <button
            type="button"
            disabled={busy}
            onClick={act}
            className="rounded-full bg-[#071a33] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Enviar correo' : 'Revisar y solicitar envío'}
          </button>
        )}
        {scheduled && (
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className="rounded-full border border-[#c9a86a] px-5 py-2.5 text-sm font-semibold text-[#071a33] disabled:opacity-50"
          >
            Cancelar programación
          </button>
        )}
        {operation?.communicationMessageId && (
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 size={16} /> Aceptado por Communications Core
          </span>
        )}
      </div>
    </aside>
  );
}
