# HAVONA Enterprise Analytics & Commercial Intelligence Core

> La semántica financiera de Opportunity y el forecast conservador se definen en [HAVONA_OPPORTUNITY_FINANCIALS.md](./HAVONA_OPPORTUNITY_FINANCIALS.md). Los agregados monetarios usan Decimal/string, se agrupan por moneda y separan actual, forecast y pacing.

## Propósito y arquitectura

HAVONA Analytics Core convierte hechos persistidos por CRM, Communications, Calendar, Meet,
Automations y Henry en métricas reproducibles, señales explicables y prioridades accionables. No
depende de Henry para calcular hechos. Henry consume herramientas allowlisted que consultan
`AnalyticsService`; nunca calcula KPIs autoritativos con el modelo.

```text
Dominios operativos persistentes
        ↓
Catálogo semántico versionado + AnalyticsService
        ↓
Métricas / embudo / riesgo / calidad / objetivos
        ↓
API / Command Center / Henry / exportaciones autorizadas
```

PostgreSQL continúa como fuente inicial. No se incorporó un warehouse prematuro. Los snapshots
persistentes quedan preparados para métricas históricas; las consultas actuales son live y
reconstruibles desde hechos operativos.

## Tiempo

- Timezone corporativo: `America/Bogota`; se aceptan identificadores IANA válidos.
- Todo rango usa inicio inclusivo y fin exclusivo: `[start, end)`.
- Presets: hoy, ayer, semana, mes, trimestre, año y rango personalizado.
- La comparación utiliza el periodo inmediatamente anterior de igual duración.
- Si el periodo anterior vale cero, el delta porcentual es `NOT_COMPARABLE`, nunca infinito.

## Embudo

Las etapas proceden de `PipelineStage`; no existe un embudo paralelo. `entered` cuenta cada
oportunidad una sola vez por etapa dentro del periodo, incluso si reingresa. El tiempo en etapa se
calcula entre transiciones históricas consecutivas y expone promedio, mediana y tamaño de muestra.
Las etapas saltadas no se imputan como visitadas.

## Riesgo y prioridades

El riesgo es una puntuación explicable, no una probabilidad de pérdida. Versión inicial:

- inactividad igual o superior a 7 días: +12;
- inactividad igual o superior a 14 días: +25;
- tarea vencida: +20;
- oportunidad abierta sin próxima tarea: +15.

Cada componente devuelve factor, contribución y evidencia. Las prioridades combinan oportunidades
estancadas y tareas vencidas. Analytics solo crea evidencia/señales; las acciones externas deben
pasar por Automations/Communications.

## Calidad y cobertura

Las respuestas distinguen `available`, `notAvailable`, `COMPLETE`, `PARTIAL`,
`INSUFFICIENT_DATA` y `NOT_AVAILABLE`. Desconocido nunca se convierte silenciosamente en cero.
La versión actual no almacena valor monetario ni `expectedCloseAt` en `Opportunity`; por ello el
pipeline monetario, weighted pipeline, forecast y metas monetarias no están disponibles. Esto es
una limitación declarada, no un defecto de cálculo.

## Objetivos, anomalías y cohorts

`AnalyticsGoal` conserva métrica, unidad, ámbito, periodo, timezone, creador y estado. Solo acepta
métricas disponibles y los cambios quedan auditados. La detección inicial solo informa incremento
de tareas vencidas cuando el periodo base tiene cinco observaciones y el cambio supera 50%; sin
muestra devuelve `INSUFFICIENT_DATA`. No se afirma causalidad. Snapshots permiten madurar cohorts
y baselines; cohortes avanzadas no se exponen todavía como completas.

## Seguridad y RBAC

- `analytics.read`: ámbito propio.
- `analytics.read_team`: miembros relacionados explícitamente mediante equipo Calendar Core.
- `analytics.read_all`: ámbito organizacional.
- `analytics.goals.manage`: administrar objetivos autorizados.
- `analytics.export`: exportar prioridades autorizadas.
- `analytics.admin`: configuración futura.

`consultantId` recibido por HTTP nunca define autoridad. `AnalyticsService.scope` valida en el
servidor: CONSULTOR solo su usuario; GERENTE solo su equipo explícito; ADMIN/SUPER_ADMIN según
permisos. El mismo servicio protege UI, exportación y herramientas Henry.

## API y Command Center

Base `/api/v1/analytics`: `catalog`, `summary`, `metrics/:key`, `funnel`, `pipeline`, `risks`,
`priorities`, `team`, `consultants/:id`, `goals`, `data-quality`, `anomalies`, `communications`,
`automations`, `henry` y `exports/priorities.csv`.

`/analitica` adapta el Command Center al rol. Cada prioridad enlaza al listado operativo. El CSV
limita filas, respeta RBAC y neutraliza inyección de fórmulas.

## Rendimiento, privacidad y validación

Las consultas usan agregaciones server-side, índices operativos y límites; no cargan datasets
completos al navegador. Redis/snapshots se añadirán donde medición real demuestre necesidad y sus
claves incluirán versión, scope, rango, filtros y timezone. No se calculan atributos sensibles ni
perfiles psicológicos. Las pruebas cubren tiempo, cero denominador, unknown distinto de cero,
reingreso, scope, métricas live, UI y salida natural PostgreSQL/Redis.
