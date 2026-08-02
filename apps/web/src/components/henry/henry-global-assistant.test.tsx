import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HenryGlobalAssistant } from './henry-global-assistant';

vi.mock('next/navigation', () => ({ usePathname: () => '/crm/prospectos/607a72d8-3028-448f-b6cb-523573f117a0' }));

describe('HenryGlobalAssistant', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('abre un panel accesible y ofrece contexto de copiloto en móvil y escritorio', async () => {
    render(<HenryGlobalAssistant internal storageScope="internal_user" />);
    fireEvent.click(screen.getByRole('button', { name: /abrir copiloto henry/i }));
    expect(screen.getByRole('dialog', { name: 'Henry' })).toBeInTheDocument();
    expect(screen.getByText(/consulta únicamente información permitida/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /minimizar henry/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
