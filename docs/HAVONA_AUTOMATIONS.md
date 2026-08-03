# HAVONA AUTOMATIONS CORE

## Declaración arquitectónica

> HAVONA Automations Core es el motor corporativo de workflows de la plataforma. Henry puede
> aportar razonamiento controlado, pero no ejecuta directamente proveedores ni reemplaza el motor
> determinístico.

Es un dominio transversal consumido por CRM, Calendar Core, Meet Core, Communications Core y
Henry Core. Los productores emiten eventos de dominio; no conocen workflows concretos.

```text
CRM / Calendar / Meet / Communications / Henry
                    ↓
          AutomationEventBus + Outbox
                    ↓
           HAVONA Automations Core
                    ↓
       BullMQ / Rules / Approvals / Actions
                    ↓
 CRM Tasks / Communications / Calendar / Escalations
```

## Dominio persistente

- `AutomationWorkflow`: definición versionada y estado DRAFT/ACTIVE/PAUSED/ARCHIVED.
- `AutomationTrigger` y `AutomationAction`: trigger, condiciones y pasos allowlisted.
- `AutomationExecution` y `AutomationStepExecution`: ejecución e historial por paso.
- `AutomationSchedule`: cron/runAt, timezone y referencia BullMQ.
- `AutomationEnrollment`: entidad inscrita sin duplicados.
- `AutomationEvent`: evento normalizado e idempotente.
- `AutomationSuppression`: pausa por entidad/canal/workflow.
- `AutomationApproval`: human-in-the-loop con vencimiento y resolución auditable.
- `DomainOutboxEvent`: entrega fiable posterior al commit de negocio.

## Motor y límites

El motor solo acepta triggers y acciones enumerados. Las condiciones usan rutas de campos y
operadores seguros; no existe `eval`, JavaScript dinámico ni ejecución arbitraria. Soporta pasos
secuenciales, conditions, delays persistentes, pausa, cancelación, suppression, approvals,
reintentos BullMQ y límites de pasos/duración.

Variables:

```text
AUTOMATIONS_QUEUE_NAME=havona-automations
AUTOMATIONS_MAX_STEPS=25
AUTOMATIONS_MAX_EXECUTION_SECONDS=86400
AUTOMATIONS_DEFAULT_TIMEZONE=America/Bogota
AUTOMATIONS_WORKER_CONCURRENCY=5
AUTOMATIONS_MAX_EXECUTIONS_PER_ENTITY_DAY=10
```

Los delays viven en Redis/BullMQ, no en timers de proceso. Las claves de ejecución combinan
evento, workflow, entidad y versión. Al reiniciar, el worker recupera outbox pendiente y schedules
activos; además aplica un límite diario configurable por workflow y entidad. Las acciones externas reciben una idempotency key derivada
de ejecución/paso.

## Triggers iniciales

- CRM: prospecto creado/asignado, etapa, tarea vencida, inactividad y oportunidades.
- Calendar: cita programada/reprogramada/cancelada y ventanas antes/después.
- Meet: finalización y asistencia solo cuando exista evidencia verificable.
- Communications: inbound, falta de respuesta, escalamiento humano, fallo, cierre y opt-out.
- Tiempo: ejecución programada y recurrente.

No-show nunca se deduce únicamente porque pasó la hora. Los triggers que requieren proveedores
externos permanecen inactivos hasta recibir evidencia auténtica.

## Actions

La allowlist contempla tareas CRM, cambios controlados, asignación, WhatsApp, templates, email,
follow-up, recordatorio, escalamiento, notificación interna, pausa, fin, delay y razonamiento Henry.
Las mutaciones sensibles y `HENRY_REASONING` requieren confirmación o política humana.

Los mensajes pasan por Communications Core, que vuelve a validar consent, suppression, ventana
de 24 horas, template y modo del thread. Automations Core no accede a Meta/Resend directamente.
Henry recibe contexto autorizado, devuelve JSON estructurado y no ejecuta la acción resultante.

## Cadencias y reactivación

Una cadencia es un workflow de pasos y delays configurable. Un inbound, opt-out o takeover puede
suprimir o pausar ejecuciones incompatibles. Reactivación exige días de inactividad, filtros,
consentimiento, cooldown y máximo de intentos definidos en el workflow; no se activa ninguna
plantilla invasiva por seed.

Se incluyen como DRAFT:

- Seguimiento de prospecto nuevo.
- Recordatorio de cita.
- Seguimiento post-cita.
- Reactivación de prospecto inactivo.
- Escalamiento sin respuesta.
- Notificación de entrega fallida.

## RBAC

- CONSULTOR: lectura, gestión propia y aprobaciones asignadas.
- GERENTE: creación, activación y gestión de equipo explícito.
- ADMIN/SUPER_ADMIN: administración según permisos, sin eliminar confirmations críticas.

Permisos: `automations.read`, `create`, `manage_own`, `manage_team`, `activate`, `approve` y
`admin`. Scope, owner y entidad se resuelven server-side.

## API y UI

API `/api/v1/automations`: listado, detalle, creación estructurada, estado, archivo, cancelación,
suppression, approvals y entrada administrativa de eventos. UI `/automatizaciones`: workflows,
definición, activación/pausa/archivo e historial real. No existe editor drag-and-drop ficticio.

## Auditoría, privacidad y observabilidad

Se auditan creación, estado, cancelación, suppression y approvals. Pasos guardan `policyId` y
`ruleId`; no se persisten secretos ni prompts. Los datos de ejecución se limitan a contexto
operativo. Métricas futuras se derivarán de ejecuciones reales; no se calcula ROI ficticio.

## Pruebas

La suite cubre schemas allowlisted, conditions, idempotencia, suppression, límites, approvals,
arquitectura, outbox e integración PostgreSQL/Redis. Los providers externos no se consumen en CI.

## Pendientes externos

Meta, Resend, Google y Jitsi requieren validación E2E en preproducción/VPS. Esto no cambia la
implementación determinística ni autoriza simular delivery, attendance o no-show.
