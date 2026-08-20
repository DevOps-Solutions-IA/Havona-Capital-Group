import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoleplayPage from './page';
import { trainingApi } from '@/lib/knowledge';

vi.mock('@/lib/knowledge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/knowledge')>('@/lib/knowledge');
  return {
    ...actual,
    trainingApi: {
      scenarios: vi.fn(),
      startRoleplay: vi.fn(),
      respond: vi.fn(),
      evaluate: vi.fn(),
    },
  };
});

const scenario = {
  scenarioKey: 'discovery_family',
  title: 'Discovery familiar',
  category: 'DISCOVERY',
  skill: 'descubrimiento',
  need: 'FAMILY_PROTECTION',
  difficulty: 'INTERMEDIATE',
  persona: 'Persona sintética',
  context: 'Contexto de práctica',
  objective: 'Comprender la necesidad',
  openingMessage: 'Me preocupa mi familia.',
};

describe('Academia Henry roleplay UX', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(trainingApi.scenarios).mockResolvedValue([scenario]);
    vi.mocked(trainingApi.startRoleplay).mockResolvedValue({
      id: 'roleplay',
      scenarioKey: scenario.scenarioKey,
      status: 'ACTIVE',
      objective: scenario.objective,
      difficulty: scenario.difficulty,
      transcript: [{ role: 'CLIENT', content: scenario.openingMessage }],
    });
    vi.mocked(trainingApi.respond).mockResolvedValue({ content: 'Mi familia depende de mí.', turn: 3 });
  });

  it('separa visualmente roleplay mode de coach mode y no muestra hechos ocultos', async () => {
    render(<RoleplayPage />);
    await screen.findByText(/Discovery familiar/);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar simulación' }));
    expect(await screen.findByText(/Henry es el prospecto/)).toBeInTheDocument();
    expect(screen.queryByText(/hiddenFacts/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tu respuesta'), { target: { value: '¿Quién depende de ti?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(screen.getByText('Mi familia depende de mí.')).toBeInTheDocument());
  });
});
