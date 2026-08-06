import { api } from './api';
export type AutomationWorkflow = {
  id: string;
  name: string;
  description?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  scope: string;
  version: number;
  updatedAt: string;
  triggers: Array<{ id: string; type: string; definition: Record<string, unknown> }>;
  actions: Array<{ id: string; stepOrder: number; type: string; approvalMode: string }>;
  executions: Array<{ id: string; status: string; createdAt: string; failureCode?: string | null }>;
};
export const automationsApi = {
  list: () => api<{ data: AutomationWorkflow[]; meta: { total: number } }>('/automations'),
  get: (id: string) => api<AutomationWorkflow>(`/automations/${id}`),
  create: (body: unknown) =>
    api<AutomationWorkflow>('/automations', { method: 'POST', body: JSON.stringify(body) }),
  status: (id: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') =>
    api<AutomationWorkflow>(`/automations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  cancelExecution: (id: string) =>
    api(`/automations/executions/${id}/cancel`, { method: 'POST', body: '{}' }),
  resolveApproval: (id: string, decision: 'APPROVED' | 'REJECTED', note?: string) =>
    api(`/automations/approvals/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    }),
};
export type Cadence = {
  id: string;
  key: string;
  name: string;
  purpose: string;
  status: string;
  updatedAt: string;
  activeVersion?: {
    version: number;
    stopConditions: string[];
    approvalPolicy: string;
    steps: Array<{
      id: string;
      stepOrder: number;
      type: string;
      delayMinutes: number;
      templateKey?: string | null;
    }>;
  } | null;
  versions: Array<{ id: string; version: number; status: string; createdAt: string }>;
};
export type CadenceEnrollment = {
  id: string;
  status: string;
  stopReason?: string | null;
  nextStepAt?: string | null;
  prospect: { id: string; name: string };
  version: { version: number; cadence: { id: string; key: string; name: string } };
  steps: Array<{ id: string; scheduledAt: string; step: { type: string } }>;
};
export const cadencesApi = {
  list: (status?: string) =>
    api<Cadence[]>(`/automations/cadences${status ? `?status=${status}` : ''}`),
  get: (id: string) => api<Cadence>(`/automations/cadences/${id}`),
  enrollments: (status?: string) =>
    api<CadenceEnrollment[]>(
      `/automations/cadences/enrollments${status ? `?status=${status}` : ''}`,
    ),
  pause: (id: string) =>
    api(`/automations/cadences/enrollments/${id}/pause`, { method: 'POST', body: '{}' }),
  resume: (id: string) =>
    api(`/automations/cadences/enrollments/${id}/resume`, { method: 'POST', body: '{}' }),
  stop: (id: string) =>
    api(`/automations/cadences/enrollments/${id}/stop`, { method: 'POST', body: '{}' }),
};
