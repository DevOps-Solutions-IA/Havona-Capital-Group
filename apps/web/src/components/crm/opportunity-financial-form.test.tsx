import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { Opportunity } from '@/lib/crm';
import { OpportunityFinancialForm } from './opportunity-financial-form';

vi.mock('@/lib/api', () => ({ api: vi.fn(), messageOf: (error: unknown) => error instanceof Error ? error.message : 'Error' }));
const opportunity: Opportunity = {
  id: 'opp',
  title: 'Protección',
  priority: 'HIGH',
  status: 'OPEN',
  updatedAt: '2026-08-06T12:00:00.000Z',
  amount: '250000000.25',
  currency: 'COP',
  expectedCloseDate: null,
  probability: null,
  forecastCategory: null,
  stage: { id: 'stage', key: 'proposal', name: 'Propuesta', position: 3 },
  prospect: { id: 'prospect', name: 'Cliente prueba', interest: 'Protección', city: 'Bogotá' },
};

describe('OpportunityFinancialForm', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);
  it('envía monto como string sin perder precisión y permite unknown explícito', async () => {
    vi.mocked(api).mockResolvedValue({});
    const saved = vi.fn().mockResolvedValue(undefined);
    render(<OpportunityFinancialForm opportunity={opportunity} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText('Valor comercial estimado'), { target: { value: '99999999999999999.99' } });
    fireEvent.change(screen.getByLabelText('Probabilidad manual (%)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos financieros' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/crm/opportunities/opp/financials', expect.objectContaining({
      method:'PATCH',
      body:JSON.stringify({amount:'99999999999999999.99',currency:'COP',expectedCloseDate:null,probability:50,forecastCategory:null,reason:undefined}),
    })));
    expect(saved).toHaveBeenCalled();
  });

  it('rechaza probabilidad fuera de rango', async () => {
    render(<OpportunityFinancialForm opportunity={opportunity} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Probabilidad manual (%)'), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos financieros' }));
    expect(await screen.findByText('La probabilidad debe estar entre 0 y 100.')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
});
