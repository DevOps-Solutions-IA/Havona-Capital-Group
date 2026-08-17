import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HenryGlobalAssistant } from './henry-global-assistant';

let pathname = '/crm/prospectos/607a72d8-3028-448f-b6cb-523573f117a0';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

describe('HenryGlobalAssistant', () => {
  beforeEach(() => {
    pathname = '/crm/prospectos/607a72d8-3028-448f-b6cb-523573f117a0';
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(cleanup);

  it('abre un panel accesible y ofrece contexto de copiloto en móvil y escritorio', async () => {
    render(<HenryGlobalAssistant internal storageScope="internal_user" role="CONSULTANT" />);
    fireEvent.click(screen.getByRole('button', { name: /abrir copiloto henry/i }));
    expect(screen.getByRole('dialog', { name: 'Henry' })).toBeInTheDocument();
    expect(screen.getByText(/consulta únicamente información permitida/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /minimizar henry/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('mantiene la conversación al navegar y actualiza las sugerencias con el contexto', async () => {
    localStorage.setItem(
      'havona_henry_session_v2_internal_user',
      JSON.stringify({ id: '607a72d8-3028-448f-b6cb-523573f117a0', accessToken: 'runtime-token' }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              id: '607a72d8-3028-448f-b6cb-523573f117a0',
              status: 'ACTIVE',
              prospectAssociated: true,
              messages: [
                {
                  id: 'message-1',
                  role: 'ASSISTANT',
                  content: 'Contexto conservado',
                  status: 'COMPLETED',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const view = render(
      <HenryGlobalAssistant internal storageScope="internal_user" role="CONSULTANT" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir copiloto henry/i }));
    expect(await screen.findByText('Contexto conservado')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /preparar el siguiente contacto/i }),
    ).toBeInTheDocument();
    const requestsBeforeNavigation = vi.mocked(fetch).mock.calls.length;

    pathname = '/crm/pipeline';
    view.rerender(<HenryGlobalAssistant internal storageScope="internal_user" role="CONSULTANT" />);
    expect(screen.getByText('Contexto conservado')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /oportunidades requieren atención/i }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(requestsBeforeNavigation);
  });

  it('aísla la sesión local mediante el alcance del usuario autenticado', async () => {
    localStorage.setItem(
      'havona_henry_session_v2_internal_user_a',
      JSON.stringify({ id: '607a72d8-3028-448f-b6cb-523573f117a0', accessToken: 'token-a' }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<HenryGlobalAssistant internal storageScope="internal_user_b" role="CONSULTANT" />);
    fireEvent.click(screen.getByRole('button', { name: /abrir copiloto henry/i }));
    expect(await screen.findByText(/copiloto contextual/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
