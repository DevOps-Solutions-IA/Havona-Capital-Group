# HAVONA Opportunity Financials

## Semántica

`Opportunity.amount` es exclusivamente el **valor comercial estimado de la oportunidad**. No es prima mensual/anual, suma asegurada, valor en efectivo, capital objetivo, comisión ni ingreso reconocido por HAVONA CAPITAL GROUP. Esos conceptos requieren campos o dominios separados si se incorporan posteriormente.

El monto usa `Decimal(19,2)` y se entrega como string. Un monto exige moneda ISO soportada (`COP` o `USD`); `null` significa desconocido y nunca se transforma en cero. Los reportes agrupan por moneda. No existe conversión FX ni total multimoneda implícito.

## Fecha, probabilidad y forecast

`expectedCloseDate` es una fecha de negocio (`DATE`) explícita, sin hora ni fecha inferida. `probability` es un porcentaje decimal de 0 a 100 capturado manualmente. No existen defaults por etapa ni probabilidades calculadas por Henry.

- `PIPELINE`: oportunidad abierta sin compromiso.
- `LIKELY`: expectativa comercial declarada con evidencia, no garantía.
- `COMMIT`: expectativa declarada de cierre en el periodo, nunca venta garantizada.
- `UPSIDE`: oportunidad adicional posible.

El forecast es determinístico: categoría declarada + monto/moneda + fecha esperada dentro de `[start,end)`. Si falta un componente, baja la cobertura y el registro no aporta cero.

## Provenance, historia y cierre

Cada campo conserva fuente (`MANUAL`, `IMPORT`, `CRM_STAGE_POLICY`, `SYSTEM`, `EXTERNAL_FUTURE`). En esta fase la UI y API operativa escriben `MANUAL`; no se habilita política automática por etapa. `OpportunityFinancialHistory` conserva campo, valor anterior/nuevo, actor, fuente, razón y timestamp. Auditoría registra el cambio y Outbox publica `OPPORTUNITY_FINANCIALS_UPDATED`.

Al cerrar una oportunidad, `closedAt` es independiente de `updatedAt`; monto y moneda permanecen históricos. `WON value` es valor comercial ganado, no revenue contable. `LOST potential value` es potencial perdido, no pérdida contable.

## Analytics, objetivos, Henry y RBAC

Analytics calcula pipeline crudo/ponderado, WON/LOST, ticket promedio/mediano, aging, forecast y cobertura, siempre por moneda. Metas monetarias exigen moneda. Henry usa `get_pipeline_health`, `get_analytics_metric`, `get_goal_progress` y `get_analytics_data_quality`; no calcula desde CRM.

El scope CRM permanece autoritativo: CONSULTOR solo asignadas, GERENTE equipo explícito y ADMIN/SUPER_ADMIN según permisos. No se implementan FX, facturación, contabilidad, revenue recognition, productos financieros ni modelos predictivos.
