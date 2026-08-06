export type MetricDefinition = {
  key: string;
  displayName: string;
  description: string;
  meaning: string;
  source: string[];
  dimensions: string[];
  grains: string[];
  nullBehavior: string;
  criteria: string;
  timezonePolicy: string;
  version: number;
  owner: string;
  unit: 'COUNT' | 'RATE' | 'DAYS' | 'MILLISECONDS' | 'CURRENCY';
};
const definition = (
  key: string,
  displayName: string,
  unit: MetricDefinition['unit'],
  source: string[],
  criteria: string,
): MetricDefinition => ({
  key,
  displayName,
  description: displayName,
  meaning: criteria,
  source,
  dimensions: ['consultant', 'team', 'source', 'stage', 'channel'],
  grains: ['day', 'week', 'month', 'quarter'],
  nullBehavior:
    unit === 'RATE'
      ? 'Sin denominador se devuelve null/notAvailable.'
      : 'Ausencia real se devuelve cero; campo no modelado se devuelve notAvailable.',
  criteria,
  timezonePolicy: 'Rango [start,end) interpretado en IANA timezone; default America/Bogota.',
  version: 1,
  owner: 'HAVONA Commercial Intelligence',
  unit,
});

export const METRIC_CATALOG = [
  definition(
    'crm.prospects.created',
    'Prospectos creados',
    'COUNT',
    ['prospects.created_at'],
    'Prospectos cuyo createdAt pertenece al periodo.',
  ),
  definition(
    'crm.prospects.assigned',
    'Prospectos asignados',
    'COUNT',
    ['assignments.created_at'],
    'Asignaciones iniciadas durante el periodo.',
  ),
  definition(
    'crm.opportunities.created',
    'Oportunidades creadas',
    'COUNT',
    ['opportunities.created_at'],
    'Oportunidades creadas durante el periodo.',
  ),
  definition(
    'crm.opportunities.won',
    'Oportunidades ganadas',
    'COUNT',
    ['opportunities.status', 'opportunities.closed_at'],
    'Oportunidades WON cerradas durante el periodo.',
  ),
  definition(
    'crm.opportunities.lost',
    'Oportunidades perdidas',
    'COUNT',
    ['opportunities.status', 'opportunities.closed_at'],
    'Oportunidades LOST cerradas durante el periodo.',
  ),
  definition(
    'sales.win_rate',
    'Tasa de cierre ganado',
    'RATE',
    ['opportunities.status', 'opportunities.closed_at'],
    'WON / (WON + LOST) cerradas durante el periodo.',
  ),
  definition(
    'sales.average_cycle_days',
    'Ciclo comercial promedio',
    'DAYS',
    ['opportunities.created_at', 'opportunities.closed_at'],
    'Promedio de días entre creación y cierre para oportunidades cerradas.',
  ),
  definition(
    'sales.pipeline_value',
    'Valor de pipeline',
    'CURRENCY',
    ['opportunities.amount', 'opportunities.currency', 'opportunities.status'],
    'Suma de amount para oportunidades OPEN, agrupada por moneda; nunca convierte FX implícitamente.',
  ),
  definition('sales.weighted_pipeline', 'Pipeline ponderado', 'CURRENCY', ['opportunities.amount', 'opportunities.probability', 'opportunities.currency'], 'Suma de amount × probability/100 para oportunidades OPEN con ambos campos, agrupada por moneda.'),
  definition('sales.won_value', 'Valor comercial ganado', 'CURRENCY', ['opportunities.amount', 'opportunities.currency', 'opportunities.status', 'opportunities.closed_at'], 'Suma del valor comercial estimado de oportunidades WON cerradas en [start,end); no representa ingreso contable.'),
  definition('sales.lost_potential_value', 'Valor potencial perdido', 'CURRENCY', ['opportunities.amount', 'opportunities.currency', 'opportunities.status', 'opportunities.closed_at'], 'Suma del valor potencial de oportunidades LOST; no representa pérdida contable.'),
  definition('sales.average_deal_value', 'Ticket promedio ganado', 'CURRENCY', ['opportunities.amount', 'opportunities.currency', 'opportunities.status'], 'Promedio de amount para oportunidades WON con monto, agrupado por moneda.'),
  definition('sales.median_deal_value', 'Ticket mediano ganado', 'CURRENCY', ['opportunities.amount', 'opportunities.currency', 'opportunities.status'], 'Mediana de amount para oportunidades WON con monto, agrupada por moneda.'),
  definition('sales.commit_forecast', 'Forecast commit', 'CURRENCY', ['opportunities.amount', 'opportunities.currency', 'opportunities.expected_close_date', 'opportunities.forecast_category'], 'Valor de oportunidades OPEN declaradas COMMIT cuya fecha esperada cae en el periodo; no garantiza cierre.'),
  definition('sales.financial_coverage', 'Cobertura financiera', 'RATE', ['opportunities.amount', 'opportunities.currency', 'opportunities.expected_close_date', 'opportunities.probability'], 'Completitud de campos financieros en oportunidades abiertas.'),
  definition(
    'activities.interactions',
    'Interacciones registradas',
    'COUNT',
    ['crm_interactions.occurred_at'],
    'Interacciones ocurridas durante el periodo.',
  ),
  definition(
    'activities.tasks_completed',
    'Tareas completadas',
    'COUNT',
    ['crm_tasks.completed_at'],
    'Tareas completadas durante el periodo.',
  ),
  definition(
    'activities.tasks_overdue',
    'Tareas vencidas',
    'COUNT',
    ['crm_tasks.due_at', 'crm_tasks.status'],
    'Tareas abiertas cuyo vencimiento precede el fin de consulta.',
  ),
  definition(
    'calendar.appointments_scheduled',
    'Citas programadas',
    'COUNT',
    ['calendar_event_links.scheduled_start_at'],
    'Eventos de calendario con inicio dentro del periodo.',
  ),
  definition(
    'communications.inbound',
    'Mensajes entrantes',
    'COUNT',
    ['communication_messages.direction', 'communication_messages.created_at'],
    'Mensajes INBOUND recibidos durante el periodo.',
  ),
  definition(
    'communications.outbound',
    'Mensajes salientes',
    'COUNT',
    ['communication_messages.direction', 'communication_messages.created_at'],
    'Mensajes OUTBOUND creados durante el periodo.',
  ),
  definition(
    'automations.executions',
    'Ejecuciones de automatización',
    'COUNT',
    ['automation_executions.created_at'],
    'Ejecuciones creadas durante el periodo.',
  ),
  definition(
    'cadences.enrollments',
    'Inscripciones en cadencias',
    'COUNT',
    ['cadence_enrollments.created_at'],
    'Inscripciones creadas durante el periodo.',
  ),
  definition(
    'cadences.completed',
    'Cadencias completadas',
    'COUNT',
    ['cadence_enrollments.status', 'cadence_enrollments.stopped_at'],
    'Cadencias completadas durante el periodo.',
  ),
  definition(
    'cadences.stopped_by_reply',
    'Cadencias detenidas por respuesta',
    'COUNT',
    ['cadence_enrollments.stop_reason', 'cadence_enrollments.stopped_at'],
    'Cadencias detenidas por evidencia de mensaje inbound.',
  ),
  definition(
    'cadences.failed',
    'Cadencias fallidas',
    'COUNT',
    ['cadence_enrollments.status', 'cadence_enrollments.updated_at'],
    'Cadencias que entraron en estado FAILED durante el periodo.',
  ),
  definition(
    'henry.conversations',
    'Conversaciones Henry',
    'COUNT',
    ['conversations.created_at'],
    'Conversaciones iniciadas durante el periodo.',
  ),
  definition(
    'henry.escalations',
    'Escalamientos Henry',
    'COUNT',
    ['escalations.created_at'],
    'Escalamientos creados durante el periodo.',
  ),
] as const;

export const metricDefinition = (key: string) => METRIC_CATALOG.find((item) => item.key === key);
