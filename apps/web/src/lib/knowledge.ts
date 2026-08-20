import { api } from './api';

export type KnowledgeDocument = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  type: string;
  updatedAt: string;
  collection: { id: string; name: string };
  versions: Array<{
    version: number;
    status: string;
    ingestions: Array<{ status: string; errorCode?: string | null }>;
  }>;
};
export type KnowledgeCollection = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};
export type Citation = {
  documentId: string;
  title: string;
  version: number;
  section?: string | null;
  page?: number | null;
  chunkId: string;
  snippet: string;
};
export const knowledgeApi = {
  list: () => api<KnowledgeDocument[]>('/knowledge'),
  get: (id: string) => api<KnowledgeDocument>(`/knowledge/documents/${id}`),
  collections: () => api<KnowledgeCollection[]>('/knowledge/collections'),
  search: (query: string) =>
    api<{
      answerStatus: string;
      confidence: string;
      message?: string;
      results: Array<{ score: number; content: string; citation: Citation }>;
    }>('/knowledge/search', { method: 'POST', body: JSON.stringify({ query }) }),
  upload: (body: FormData) =>
    api<KnowledgeDocument>('/knowledge/documents', { method: 'POST', body }),
  approve: (id: string) => api(`/knowledge/documents/${id}/approve`, { method: 'POST' }),
  publish: (id: string) => api(`/knowledge/documents/${id}/publish`, { method: 'POST' }),
};
export type TrainingProgram = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string; objective: string; estimatedMinutes: number }>;
  }>;
};
export type TrainingProgress = {
  id: string;
  status: string;
  progress: number;
  program: { id: string; title: string };
};
export type TrainingRoleplay = {
  id: string;
  scenarioKey: string;
  status: string;
  objective: string;
  difficulty: string;
  transcript: TrainingTurn[];
  scenario?: TrainingScenario;
  score?: number | null;
  evaluation?: TrainingEvaluation;
};
export type TrainingTurn = { role: 'CONSULTANT' | 'CLIENT'; content: string };
export type TrainingScenario = {
  scenarioKey: string;
  title: string;
  category: string;
  skill: string;
  need: string;
  difficulty: string;
  persona: string;
  context: string;
  objective: string;
  openingMessage: string;
};
export type TrainingEvaluation = {
  score: number;
  compliance: { critical: boolean; flags: Array<{ code: string; reason: string }> };
  feedback: {
    strengths: Array<{ criterion: string; score: number }>;
    opportunities: Array<{ criterion: string; score: number; improvement: string }>;
    missedKeyMoment: string;
    bestQuestion: string;
    complianceRisk: string[];
    recommendedScenarioKey: string;
  };
};
export type TrainingPerformance = {
  insufficientEvidence: boolean;
  roleplaysCompleted: number;
  averageScore: number | null;
  lastScore: number | null;
  scoreTrend: number | null;
  strongestSkills: Array<{ skill: string; score: number }>;
  weakestSkills: Array<{ skill: string; score: number }>;
  complianceRiskCount: number;
  assessmentAverage: number | null;
  trainingProgress: number | null;
};
export type TrainingPlan = TrainingPerformance & {
  nextSkill: string | null;
  areasNotPracticed: string[];
  recurrentErrors: string[];
  nextExercises: TrainingScenario[];
};
export type TrainingTeamSummary = {
  members: Array<{ user: { id: string; name: string }; performance: TrainingPerformance }>;
  notPracticed: Array<{ id: string; name: string }>;
  lowScore: Array<{ id: string; name: string }>;
  improved: Array<{ id: string; name: string }>;
  complianceRisk: Array<{ id: string; name: string }>;
  skillsToReinforce: string[];
};
export const trainingApi = {
  list: () => api<TrainingProgram[]>('/training/programs'),
  get: (id: string) => api<TrainingProgram>(`/training/programs/${id}`),
  progress: () => api<TrainingProgress[]>('/training/progress'),
  scenarios: () => api<TrainingScenario[]>('/training/roleplay-scenarios'),
  performance: () => api<TrainingPerformance>('/training/performance'),
  plan: () => api<TrainingPlan>('/training/plan'),
  history: () => api<TrainingRoleplay[]>('/training/roleplays/history'),
  team: () => api<TrainingTeamSummary>('/training/team'),
  startRoleplay: (scenarioKey: string) =>
    api<TrainingRoleplay>('/training/roleplays', {
      method: 'POST',
      body: JSON.stringify({ scenarioKey }),
    }),
  respond: (roleplayId: string, content: string) =>
    api<{ content: string; turn: number }>(`/training/roleplays/${roleplayId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  evaluate: (roleplayId: string, transcript: TrainingTurn[]) =>
    api<TrainingRoleplay>(`/training/roleplays/${roleplayId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ transcript }),
    }),
};
export type HenryMemory = {
  id: string;
  key: string;
  value: unknown;
  category: string;
  source: string;
  retentionUntil?: string | null;
};
export const memoryApi = {
  list: () => api<HenryMemory[]>('/henry/memory'),
  save: (key: string, value: string) =>
    api('/henry/memory', {
      method: 'POST',
      body: JSON.stringify({ key, value, source: 'USER_EXPLICIT' }),
    }),
  remove: (id: string) => api(`/henry/memory/${id}`, { method: 'DELETE' }),
};
