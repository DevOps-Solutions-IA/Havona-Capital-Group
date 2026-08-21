import { api } from './api';
export type EmailTemplate = {
  id: string;
  key: string;
  name: string;
  category: string;
  purpose: string;
  lifecycleStage?: string | null;
  locale: string;
  status: string;
  isCorporate: boolean;
  ownerId?: string | null;
  activeVersionId?: string | null;
  nextReviewAt?: string | null;
  governance?: {
    automationPolicy?: string;
    requiredEvidence?: string[];
    triggerEvents?: string[];
    stopEvents?: string[];
    cta?: { type: string; label: string };
  } | null;
  versions: Array<{
    id: string;
    version: number;
    status: string;
    subject: string;
    blocks: unknown;
    messageClassification: string;
    legalStatus?: string;
    contentPolicy?: Record<string, unknown>;
  }>;
};
export type EmailDraft = {
  id: string;
  status: string;
  template?: { id: string; name: string; key: string } | null;
  recipientProspect?: { id: string; name: string; normalizedEmail?: string | null } | null;
  updatedAt: string;
};
export type EmailPreview = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  missingVariables: string[];
  warnings: string[];
  messageClassification: string;
  templateVersion: number;
};
export const emailTemplatesApi = {
  list: (search = '') =>
    api<EmailTemplate[]>(
      `/email-templates${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  catalog: () => api<CorporateEmailCatalogItem[]>('/email-templates/catalog'),
  variables: () =>
    api<Array<{ key: string; type: string; dataSource: string; requiredByDefault: boolean }>>(
      '/email-templates/variables',
    ),
  drafts: () => api<EmailDraft[]>('/email-drafts'),
  create: (input: Record<string, unknown>) =>
    api<EmailTemplate>('/email-templates', { method: 'POST', body: JSON.stringify(input) }),
  version: (id: string, input: Record<string, unknown>) =>
    api(`/email-templates/${id}/versions`, { method: 'POST', body: JSON.stringify(input) }),
  approve: (id: string) => api(`/email-templates/${id}/approve`, { method: 'POST' }),
  activate: (id: string) => api(`/email-templates/${id}/activate`, { method: 'POST' }),
  variant: (id: string, name: string, overrides: Record<string, string>) =>
    api(`/email-templates/${id}/variants`, {
      method: 'POST',
      body: JSON.stringify({ name, overrides }),
    }),
  createDraft: (input: Record<string, unknown>) =>
    api<EmailDraft>('/email-drafts', { method: 'POST', body: JSON.stringify(input) }),
  preview: (id: string) => api<EmailPreview>(`/email-drafts/${id}/preview`, { method: 'POST' }),
};

export type CorporateEmailCatalogItem = {
  key: string;
  name: string;
  category: string;
  purpose: string;
  lifecycleStage: string;
  classification: string;
  automationPolicy: string;
  approvalPolicy: string;
  legalStatus: string;
  triggerEvents: string[];
  stopEvents: string[];
  requiredEvidence: string[];
  requiredVariables: string[];
  cta: { type: string; label: string };
};
