export type Stage = { id: string; key: string; name: string; position: number; total?: number };
export type Owner = { id: string; name: string; email?: string };
export type Opportunity = {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'WON' | 'LOST' | 'CANCELLED';
  updatedAt: string;
  amount?: string | null;
  currency?: 'COP' | 'USD' | null;
  expectedCloseDate?: string | null;
  probability?: string | null;
  forecastCategory?: 'PIPELINE' | 'LIKELY' | 'COMMIT' | 'UPSIDE' | null;
  stage: Stage;
  owner?: Owner;
  prospect: { id: string; name: string; interest: string; city: string };
};
export const formatMoney = (amount: string, currency: string) =>
  `${currency} ${(() => {
    const [integer, decimals] = amount.split('.');
    const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decimals && decimals !== '00' ? `${grouped},${decimals.replace(/0$/, '')}` : grouped;
  })()}`;
export type CrmProspect = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  city: string;
  interest: string;
  lastCapturedAt: string;
  source: { key: string; name: string };
  assignments: { assignee: Owner }[];
  opportunities: Opportunity[];
  tags: { tag: { id: string; name: string; color: string } }[];
};
export type CrmDashboard = {
  newProspects: number;
  activeOpportunities: number;
  pendingTasks: number;
  overdueTasks: number;
  pipeline: Stage[];
  generatedAt: string;
};
export type CrmTask = {
  id: string;
  title: string;
  description?: string;
  dueAt: string;
  priority: string;
  status: string;
  prospect: { id: string; name: string };
  assignee: Owner;
  opportunity?: { id: string; title: string };
};
export type ApiPage<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };
export type CrmClient = {
  id: string;
  status: string;
  convertedAt: string;
  prospect: CrmProspect;
  convertedBy: Owner;
};
export type CrmCompany = {
  id: string;
  name: string;
  legalName?: string;
  taxIdentifier?: string;
  city?: string;
  email?: string;
  phone?: string;
  contacts: { prospect: { id: string; name: string; email?: string; phone?: string } }[];
};
export type CrmConsultant = {
  id: string;
  name: string;
  email: string;
  _count: { assignedProspects: number; crmTasks: number; opportunities: number };
};
export const priorityLabel: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
