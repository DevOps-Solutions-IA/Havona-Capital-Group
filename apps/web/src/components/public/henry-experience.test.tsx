import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HenryExperience } from './henry-experience';
vi.mock('next/navigation', () => ({ usePathname: () => '/henry' }));

describe('HenryExperience', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => '7e3e371d-e3cb-4380-bd67-9acb5709cc72' });
  });
  afterEach(cleanup);

  it('exige consentimiento antes de iniciar una conversación persistente', async () => {
    render(<HenryExperience />);
    const starter = await screen.findByRole('button', { name: /revisar mi pensión/i });
    expect(starter).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(starter).toBeEnabled();
    expect(screen.getByRole('link', { name: /política de privacidad/i })).toHaveAttribute('href', '/privacidad');
  });

  it('conserva localmente un mensaje cuando la red falla tras crear la sesión', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: '607a72d8-3028-448f-b6cb-523573f117a0',
              accessToken: 'runtime-token',
              status: 'ACTIVE',
              providerConfigured: true,
              messages: [
                {
                  id: '9b4b8e82-f7b3-4661-a3fb-e235d82cb3d5',
                  role: 'ASSISTANT',
                  content: 'Soy Henry, asistente virtual.',
                  status: 'COMPLETED',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockRejectedValueOnce(new Error('Sin red'));
    vi.stubGlobal('fetch', fetchMock);
    render(<HenryExperience />);
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /revisar mi pensión/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/guardado en este dispositivo/i));
    expect(localStorage.getItem('havona_henry_session_v2_public')).toContain('607a72d8');
    expect(localStorage.getItem('havona_henry_draft_v2_public')).toBe('Quiero revisar mi pensión');
  });
});
