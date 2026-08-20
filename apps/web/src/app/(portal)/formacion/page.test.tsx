import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingPage from './page';
import { trainingApi } from '@/lib/knowledge';

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ can: (permission: string) => permission === 'training.read_team' }) }));
vi.mock('@/lib/knowledge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/knowledge')>('@/lib/knowledge');
  return {
    ...actual,
    trainingApi: {
      list: vi.fn(),
      progress: vi.fn(),
      performance: vi.fn(),
      plan: vi.fn(),
      history: vi.fn(),
      team: vi.fn(),
    },
  };
});

describe('Academia Henry /formacion', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trainingApi.list).mockResolvedValue([]);
    vi.mocked(trainingApi.progress).mockResolvedValue([]);
    vi.mocked(trainingApi.performance).mockResolvedValue({
      insufficientEvidence: true,
      roleplaysCompleted: 0,
      averageScore: null,
      lastScore: null,
      scoreTrend: null,
      strongestSkills: [],
      weakestSkills: [],
      complianceRiskCount: 0,
      assessmentAverage: null,
      trainingProgress: null,
    });
    vi.mocked(trainingApi.plan).mockResolvedValue({
      insufficientEvidence: true,
      roleplaysCompleted: 0,
      averageScore: null,
      lastScore: null,
      scoreTrend: null,
      strongestSkills: [],
      weakestSkills: [],
      complianceRiskCount: 0,
      assessmentAverage: null,
      trainingProgress: null,
      nextSkill: 'descubrimiento',
      areasNotPracticed: ['descubrimiento'],
      recurrentErrors: [],
      nextExercises: [],
    });
    vi.mocked(trainingApi.history).mockResolvedValue([]);
    vi.mocked(trainingApi.team).mockResolvedValue({
      members: [],
      notPracticed: [{ id: 'member', name: 'Consultor sintético' }],
      lowScore: [],
      improved: [],
      complianceRisk: [],
      skillsToReinforce: ['cierre'],
    });
  });

  it('muestra evidencia insuficiente y plan real sin inventar progreso', async () => {
    render(<TrainingPage />);
    expect(await screen.findByText('Evidencia todavía insuficiente')).toBeInTheDocument();
    expect(screen.getByText(/Aún no hay evidencia suficiente/)).toBeInTheDocument();
  });

  it('muestra coaching de equipo únicamente cuando la sesión tiene permiso', async () => {
    render(<TrainingPage />);
    expect(await screen.findByText('Equipo')).toBeInTheDocument();
    expect(screen.getAllByText('sin práctica registrada').length).toBeGreaterThan(0);
    expect(trainingApi.team).toHaveBeenCalledTimes(1);
  });
});
