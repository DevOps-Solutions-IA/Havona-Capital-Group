import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgePage from './page';
import { knowledgeApi } from '@/lib/knowledge';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (permission: string) => permission === 'knowledge.upload' }),
}));
vi.mock('@/lib/knowledge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/knowledge')>('@/lib/knowledge');
  return {
    ...actual,
    knowledgeApi: {
      list: vi.fn(),
      collections: vi.fn(),
      search: vi.fn(),
      upload: vi.fn(),
      publish: vi.fn(),
      get: vi.fn(),
    },
  };
});

describe('KnowledgePage', () => {
  beforeEach(() => {
    vi.mocked(knowledgeApi.list).mockResolvedValue([]);
    vi.mocked(knowledgeApi.collections).mockResolvedValue([
      { id: 'collection', key: 'general', name: 'General' },
    ]);
    vi.mocked(knowledgeApi.search).mockResolvedValue({
      answerStatus: 'INSUFFICIENT',
      confidence: 'INSUFFICIENT',
      message:
        'Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP.',
      results: [],
    });
  });
  it('muestra vacío real y comunica ausencia exacta de evidencia', async () => {
    render(<KnowledgePage />);
    expect(await screen.findByText('Sin documentos autorizados')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar conocimiento'), {
      target: { value: 'política inexistente' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(
      await screen.findByText(
        'Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP.',
      ),
    ).toBeInTheDocument();
  });
});
