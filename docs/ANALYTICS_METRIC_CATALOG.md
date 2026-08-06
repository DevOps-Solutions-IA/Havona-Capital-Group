# Catálogo semántico de métricas HAVONA

## Métricas financieras Opportunity — v1

| Key | Definición | Fuente | Nulos, moneda y tiempo |
|---|---|---|---|
| `sales.pipeline_value` | Σ amount OPEN | amount/currency/status | Unknown reduce coverage; agrupado por moneda |
| `sales.weighted_pipeline` | Σ amount × probability/100 OPEN | amount/probability/currency | Probability null no es cero; por moneda |
| `sales.won_value` | Valor comercial WON | amount/currency/status/closedAt | No es ingreso; `closedAt` en `[start,end)` |
| `sales.lost_potential_value` | Potencial LOST | amount/currency/status/closedAt | No es pérdida contable; por moneda |
| `sales.average_deal_value` | Promedio amount WON | amount/currency | Solo registros cubiertos |
| `sales.median_deal_value` | Mediana amount WON | amount/currency | Solo registros cubiertos |
| `sales.commit_forecast` | COMMIT con expected close en periodo | amount/currency/category/date | No garantiza cierre |
| `sales.financial_coverage` | OPEN con amount+currency / OPEN | Opportunity | Sin muestra = insufficient |

COP y USD nunca se suman sin FX explícita. `amount` es valor comercial estimado, no prima, suma asegurada, comisión ni revenue.

Diccionario empresarial autoritativo. La implementación ejecutable está en
`apps/api/src/analytics/metric-catalog.ts`. Todas las definiciones iniciales son `v1` y usan rango
`[inicio, fin)` en timezone IANA.

| Clave | Definición reproducible | Fuente | Unidad / nulos |
|---|---|---|---|
| `crm.prospects.created` | Prospectos creados dentro del periodo y scope. | `prospects` | count. |
| `crm.prospects.assigned` | Asignaciones iniciadas dentro del periodo. | `assignments` | count. |
| `crm.opportunities.created` | Oportunidades creadas dentro del periodo. | `opportunities` | count. |
| `crm.opportunities.won` | Oportunidades `WON` cerradas dentro del periodo. | `opportunities` | count. |
| `crm.opportunities.lost` | Oportunidades `LOST` cerradas dentro del periodo. | `opportunities` | count. |
| `sales.win_rate` | `WON / (WON + LOST)` para cierres del periodo. | `opportunities` | rate; sin cierres = null. |
| `sales.average_cycle_days` | Media de `closedAt - createdAt` para cierres. | `opportunities` | días; sin cierres = null. |
| `sales.pipeline_value` | Valor monetario de oportunidades abiertas. | campo no modelado | notAvailable, nunca cero. |
| `activities.interactions` | Interacciones ocurridas dentro del periodo. | `crm_interactions` | count. |
| `activities.tasks_completed` | Tareas completadas dentro del periodo. | `crm_tasks` | count. |
| `activities.tasks_overdue` | Tareas abiertas vencidas antes del fin consultado. | `crm_tasks` | count. |
| `calendar.appointments_scheduled` | Eventos cuyo inicio pertenece al periodo. | `calendar_event_links` | count; no implica asistencia. |
| `communications.inbound` | Mensajes entrantes creados en el periodo. | `communication_messages` | count. |
| `communications.outbound` | Mensajes salientes creados en el periodo. | `communication_messages` | count. |
| `automations.executions` | Ejecuciones creadas en el periodo. | `automation_executions` | count; no atribuye ventas. |
| `henry.conversations` | Conversaciones iniciadas en el periodo. | `conversations` | count. |
| `henry.escalations` | Escalamientos creados en el periodo. | `henry_escalations` | count. |

Cambiar fórmula, criterios, timezone o fuente incrementa `version`. Todo KPI nuevo debe definir
numerador, denominador, exclusiones, nulos, cobertura, dimensiones, owner y fuente antes de verse.
