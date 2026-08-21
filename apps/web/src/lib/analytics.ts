import { api } from './api';

export type MetricResult = { metric: string; value: number | null; money?: Array<{ currency: string; amount: string }>; availability: 'available' | 'notAvailable'; coverage: { status: string; warning?: string }; period: { start: string; end: string; timezone: string } };
export type AnalyticsSummary = {
  period: { start: string; end: string; timezone: string };
  freshness: { status: string; generatedAt: string };
  metrics: Array<{ current: MetricResult; previous: MetricResult; delta: { absolute: number | null; percentage: number | null; status: string } }>;
  funnel: { stages: Array<{ stage: { key: string; name: string }; entered: number; conversionToNext: number | null; averageDays: number | null; medianDays: number | null }> };
  pipeline: { active: number; monetaryValue: { values?: Array<{ currency: string; amount: string }>; availability: string; coverage: { warning?: string; percentage?: number | null } }; weightedPipeline?: { values: Array<{ currency: string; amount: string }>; coverage: { percentage: number | null } }; forecast?: { categories: Array<{ category: string; values: Array<{ currency: string; amount: string }> }> }; stalled: Array<{ id: string; title: string; inactivityDays: number; riskScore: number }> };
  priorities: Array<{ type: string; severity: string; entityType: string; entityId: string; title: string; reason: string; suggestedAction: string }>;
  goals: Array<{ id: string; metricKey: string; targetValue: string; periodEnd: string }>;
  dataQuality: { status: string; issues: number };
};
export type AnalyticsPeriod = { preset?: string; consultantId?: string };
const params = (query: AnalyticsPeriod) => { const value = new URLSearchParams(); Object.entries(query).forEach(([key, item]) => item && value.set(key, item)); return value.toString(); };
export const analyticsApi = {
  summary: (query: AnalyticsPeriod = {}) => api<AnalyticsSummary>(`/analytics/summary?${params(query)}`),
  team: (query: AnalyticsPeriod = {}) => api<Array<{ user: { id: string; name: string }; prospects: number; opportunities: number; overdueTasks: number; winRate: number | null }>>(`/analytics/team?${params(query)}`),
  quality: (query: AnalyticsPeriod = {}) => api<{ summary: { status: string; issues: number }; checks: Array<{ key: string; missing: number; total: number; coveragePercentage: number | null; note?: string }> }>(`/analytics/data-quality?${params(query)}`),
};
