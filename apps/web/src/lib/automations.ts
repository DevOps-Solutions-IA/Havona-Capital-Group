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
