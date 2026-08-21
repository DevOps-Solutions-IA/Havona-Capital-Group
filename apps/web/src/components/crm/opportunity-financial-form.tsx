'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Field, SelectField } from '@havona/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, messageOf } from '@/lib/api';
import type { Opportunity } from '@/lib/crm';

const schema = z
  .object({
    amount: z.string().regex(/^$|^\d{1,17}(?:\.\d{1,2})?$/, 'Use un monto positivo con máximo dos decimales.'),
    currency: z.enum(['', 'COP', 'USD']),
    expectedCloseDate: z.string(),
    probability: z.string().refine((value) => value === '' || (!Number.isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 100), 'La probabilidad debe estar entre 0 y 100.'),
    forecastCategory: z.enum(['', 'PIPELINE', 'LIKELY', 'COMMIT', 'UPSIDE']),
    reason: z.string().max(500),
  })
  .refine((value) => !value.amount || Boolean(value.currency), { message: 'Seleccione moneda.', path: ['currency'] });
type Values = z.infer<typeof schema>;

export function OpportunityFinancialForm({ opportunity, onSaved }: { opportunity: Opportunity; onSaved: () => Promise<void> }) {
  const [error, setError] = useState('');
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: opportunity.amount ?? '',
      currency: opportunity.currency ?? '',
      expectedCloseDate: opportunity.expectedCloseDate?.slice(0, 10) ?? '',
      probability: opportunity.probability ?? '',
      forecastCategory: opportunity.forecastCategory ?? '',
      reason: '',
    },
  });
  const submit = form.handleSubmit(async (values) => {
    setError('');
    try {
      await api(`/crm/opportunities/${opportunity.id}/financials`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount: values.amount || null,
          currency: values.amount ? values.currency : null,
          expectedCloseDate: values.expectedCloseDate || null,
          probability: values.probability === '' ? null : Number(values.probability),
          forecastCategory: values.forecastCategory || null,
          reason: values.reason || undefined,
        }),
      });
      await onSaved();
    } catch (reason) {
      setError(messageOf(reason));
    }
  });
  return (
    <form className="mt-4 grid gap-3 border-t border-slate-200 pt-4" onSubmit={submit}>
      {error && <Alert>{error}</Alert>}
      <Field label="Valor comercial estimado" inputMode="decimal" placeholder="Desconocido" {...form.register('amount')} error={form.formState.errors.amount?.message} />
      <SelectField label="Moneda" {...form.register('currency')} error={form.formState.errors.currency?.message}>
        <option value="">Sin moneda</option><option value="COP">COP</option><option value="USD">USD</option>
      </SelectField>
      <Field label="Fecha esperada de cierre" type="date" {...form.register('expectedCloseDate')} error={form.formState.errors.expectedCloseDate?.message} />
      <Field label="Probabilidad manual (%)" inputMode="decimal" placeholder="Sin definir" {...form.register('probability')} error={form.formState.errors.probability?.message} />
      <SelectField label="Categoría de forecast" {...form.register('forecastCategory')} error={form.formState.errors.forecastCategory?.message}>
        <option value="">Sin clasificar</option><option value="PIPELINE">Pipeline</option><option value="LIKELY">Likely</option><option value="COMMIT">Commit</option><option value="UPSIDE">Upside</option>
      </SelectField>
      <Field label="Razón del cambio (opcional)" {...form.register('reason')} error={form.formState.errors.reason?.message} />
      <p className="text-xs leading-5 text-slate-500">El monto es valor comercial estimado; no representa prima, suma asegurada, comisión ni ingreso contable. Commit tampoco garantiza cierre.</p>
      <Button type="submit" busy={form.formState.isSubmitting}>Guardar datos financieros</Button>
    </form>
  );
}
