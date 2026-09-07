import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemoryPage from './page';
import { memoryApi } from '@/lib/knowledge';
vi.mock('@/lib/knowledge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/knowledge')>('@/lib/knowledge');
  return { ...actual, memoryApi: { list: vi.fn(), save: vi.fn(), remove: vi.fn() } };
});
describe('MemoryPage', () => {
  beforeEach(() => {
    vi.mocked(memoryApi.list).mockResolvedValue([
      {
        id: 'm1',
        key: 'explanation.preference',
        value: 'ejemplos cortos',
        category: 'PERSISTENT_ALLOWED',
        source: 'USER_EXPLICIT',
      },
    ]);
    vi.mocked(memoryApi.remove).mockResolvedValue(undefined);
  });
  it('permite ver y solicitar el olvido persistente', async () => {
    render(<MemoryPage />);
    expect(await screen.findByText('ejemplos cortos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Olvidar' }));
    expect(memoryApi.remove).toHaveBeenCalledWith('m1');
  });
});
