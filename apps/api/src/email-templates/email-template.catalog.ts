import { CORPORATE_EMAIL_LIBRARY } from '@havona/contracts';

export const EMAIL_TEMPLATE_CATALOG = CORPORATE_EMAIL_LIBRARY.map(
  ({ key, category }) => [key, category] as const,
);

export const EMAIL_VARIABLES = [
  ['client.firstName', 'CLIENT', true, 'CRM Prospect.name'],
  ['client.fullName', 'CLIENT', true, 'CRM Prospect.name'],
  ['client.email', 'CLIENT', true, 'CRM Prospect.normalizedEmail'],
  ['consultant.firstName', 'CONSULTANT', true, 'User.name'],
  ['consultant.fullName', 'CONSULTANT', true, 'User.name'],
  ['consultant.email', 'CONSULTANT', true, 'User.email'],
  ['consultant.phone', 'CONSULTANT', false, 'EmailSignature.phone'],
  ['company.name', 'COMPANY', false, 'CRM Company.name'],
  ['appointment.date', 'CALENDAR', false, 'CalendarEventLink.startAt'],
  ['appointment.time', 'CALENDAR', false, 'CalendarEventLink.startAt'],
  ['appointment.timezone', 'CALENDAR', false, 'CalendarEventLink.timezone'],
  ['meeting.url', 'MEETING', false, 'Meeting join authorization'],
  ['opportunity.name', 'OPPORTUNITY', false, 'Opportunity.title'],
  ['product.name', 'KNOWLEDGE', false, 'Published authorized KnowledgeDocument'],
  ['system.companyName', 'SYSTEM', true, 'Corporate configuration'],
] as const;

export const variableRegistry = EMAIL_VARIABLES.map(
  ([key, type, requiredByDefault, dataSource]) => ({
    key,
    type,
    description: key,
    dataSource,
    requiredByDefault,
    formatter: 'TEXT',
    escapeStrategy: 'HTML_AND_HEADER',
  }),
);
