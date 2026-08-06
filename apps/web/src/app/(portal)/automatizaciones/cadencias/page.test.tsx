import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CadencesPage from './page';
import { cadencesApi } from '@/lib/automations';

vi.mock('@/lib/automations', () => ({
  cadencesApi: {
    list: vi.fn(),
    enrollments: vi.fn().mockResolvedValue([]),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
  },
}));
describe('Cadence Command Center', () => {
  it('muestra biblioteca, plan y stop conditions reales', async () => {
    vi.mocked(cadencesApi.list).mockResolvedValue([
      {
        id: 'c1',
        key: 'prospecting.followup_basic',
        name: 'Seguimiento',
        purpose: 'Continuidad gobernada',
        status: 'ACTIVE',
        updatedAt: '',
        versions: [],
        activeVersion: {
          version: 1,
          approvalPolicy: 'APPROVAL_REQUIRED',
          stopConditions: ['CUSTOMER_REPLIED', 'OPT_OUT'],
          steps: [
            {
              id: 's1',
              stepOrder: 1,
              type: 'SEND_EMAIL',
              delayMinutes: 60,
              templateKey: 'prospecting.no_response_followup',
            },
          ],
        },
      },
    ]);
    render(<CadencesPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Seguimiento' })).toBeInTheDocument(),
    );
    expect(screen.getByText('CUSTOMER_REPLIED')).toBeInTheDocument();
    expect(screen.getByText(/SEND_EMAIL/)).toBeInTheDocument();
  });
  it('presenta vacío informativo', async () => {
    vi.mocked(cadencesApi.list).mockResolvedValue([]);
    render(<CadencesPage />);
    await waitFor(() => expect(screen.getByText('Sin cadencias')).toBeInTheDocument());
  });
});
