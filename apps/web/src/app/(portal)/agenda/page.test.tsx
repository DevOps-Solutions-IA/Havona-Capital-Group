import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgendaPage from './page';

vi.mock('@/lib/calendar', () => ({
  calendarApi: {
    status: vi.fn().mockResolvedValue({ status: 'DISCONNECTED', enabled: false }),
    events: vi.fn(),
    rules: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    updateRules: vi.fn(),
    create: vi.fn(),
    sync: vi.fn(),
  },
}));

describe('AgendaPage', () => {
  afterEach(cleanup);
  it('no simula eventos y ofrece OAuth real cuando está desconectada', async () => {
    render(<AgendaPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conectar google calendar/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/tokens permanecen cifrados/i)).toBeInTheDocument();
    expect(screen.queryByText(/cita de prueba/i)).not.toBeInTheDocument();
  });
});
