import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MeetingsPage from './page';
vi.mock('@/lib/meetings', () => ({ meetingsApi: { list: vi.fn().mockResolvedValue([]) } }));
describe('HAVONA Meet', () => {
  it('presenta un estado vacío real sin reuniones ficticias', async () => {
    render(<MeetingsPage />);
    await waitFor(() =>
      expect(screen.getByText('No hay reuniones programadas')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/reunión de prueba/i)).not.toBeInTheDocument();
  });
});
