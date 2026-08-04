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
};
export const trainingApi = {
  list: () => api<TrainingProgram[]>('/training/programs'),
  get: (id: string) => api<TrainingProgram>(`/training/programs/${id}`),
  progress: () => api<TrainingProgress[]>('/training/progress'),
  startRoleplay: (scenarioKey: string) =>
    api<TrainingRoleplay>('/training/roleplays', {
      method: 'POST',
      body: JSON.stringify({ scenarioKey }),
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
