import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommunicationsPage from './page';
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock('@/lib/communications', () => ({
  deliveryStatusLabel: {},
  communicationsApi: {
    list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    config: vi
      .fn()
      .mockResolvedValue({ whatsapp: { configured: false }, email: { configured: false } }),
    get: vi.fn(),
    send: vi.fn(),
    mode: vi.fn(),
    link: vi.fn(),
    close: vi.fn(),
  },
}));
describe('Bandeja omnicanal', () => {
  it('muestra estado vacío real y proveedores pendientes', async () => {
    render(<CommunicationsPage />);
    await waitFor(() => expect(screen.getByText('Sin conversaciones')).toBeTruthy());
    expect(screen.getByText(/WhatsApp · Pendiente/)).toBeTruthy();
    expect(screen.queryByText(/mensaje de prueba/i)).toBeNull();
  });
});
