# Fase 2 — CRM comercial

## Estado

**EN DESARROLLO — PULL REQUEST DRAFT**

Rama: `feature/fase-02-crm`

Versión objetivo: `v0.3.0`

## Objetivo

Convertir la captación de Fase 1 en un sistema operativo comercial real para HAVONA CAPITAL GROUP,
desde el prospecto hasta su conversión en cliente. No se duplicará `Prospect`: la oportunidad,
asignación, tareas, notas y actividad se relacionan con esa entidad existente.

## Pipeline inmutable aprobado

```text
Nuevo
→ Contactado
→ Conversando
→ Calificado
→ Cita agendada
→ Cita realizada
→ Propuesta
→ Seguimiento
→ Cerrado
→ Cliente
```

Las etapas se modelan como datos ordenados y estables. Cada movimiento crea un historial append-only
con etapa anterior, etapa nueva, actor y timestamp, además de `AuditLog`. El cambio accesible mediante
selector es obligatorio aun cuando exista drag and drop.

## Modelo de dominio

- `Prospect`: identidad captada y ficha central; se reutiliza desde Fase 1.
- `Opportunity`: ciclo comercial, etapa, prioridad, responsable, resultado y cierre.
- `PipelineStage`: catálogo ordenado del pipeline aprobado.
- `OpportunityStageHistory`: transición inmutable y actor responsable.
- `Assignment`: historial de asignaciones y reasignaciones del prospecto.
- `Task`: trabajo comercial paginado con responsable, vencimiento, prioridad y estado.
- `Note`: nota interna con autor; edición conserva timestamp de modificación.
- `Activity`: timeline unificado append-only para eventos humanos y futuras integraciones.
- `Tag` y `ProspectTag`: clasificación controlada sin duplicar texto libre.
- `Interaction`: registro manual de contacto y canal.
- `ContactMethod`: tipo de interacción permitido.

Los adjuntos se difieren hasta definir almacenamiento autorizado; no se almacenarán blobs ni rutas
ficticias. Agenda futura podrá relacionarse mediante contratos con `Prospect`, `Opportunity` y `User`
sin crear citas en esta fase.

## Estados

Prioridad: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.

Tareas: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

Oportunidades: `OPEN`, `WON`, `LOST`, `CANCELLED`. La etapa `Cliente` requiere resultado ganado; el
cierre conserva fecha y usuario. No se elimina historial comercial.

## Matriz RBAC

| Capacidad | SUPER_ADMIN | ADMIN | GERENTE | CONSULTOR |
|---|---:|---:|---:|---:|
| Ver todo el CRM | Sí | Sí | Sí | No |
| Ver asignados propios | Sí | Sí | Sí | Sí |
| Asignar y reasignar | Sí | Sí | Sí | No |
| Editar prospecto comercial | Sí | Sí | Sí | Solo asignados |
| Crear/mover oportunidades | Sí | Sí | Sí | Solo asignados |
| Crear notas e interacciones | Sí | Sí | Sí | Solo asignados |
| Crear tareas para otros | Sí | Sí | Sí | No |
| Gestionar tareas propias | Sí | Sí | Sí | Sí |
| Cerrar oportunidades | Sí | Sí | Sí | Solo asignados |
| Consultar dashboard global | Sí | Sí | Sí | No |

La primera versión de GERENTE tiene ámbito global porque el modelo aún no incluye equipos. Antes de
introducir equipos o territorios se requiere un modelo explícito; no se simulará un ámbito inexistente.

## API coherente

- `/api/v1/crm/prospects`: bandeja paginada, filtros y detalle 360.
- `/api/v1/crm/prospects/:id/assignments`: asignación e historial.
- `/api/v1/crm/opportunities`: creación, listado y detalle.
- `/api/v1/crm/opportunities/:id/stage`: transición validada.
- `/api/v1/crm/tasks`: listado, creación y actualización de estado.
- `/api/v1/crm/notes`: creación y edición controlada.
- `/api/v1/crm/activities`: timeline paginado e interacciones.
- `/api/v1/crm/tags`: catálogo y asociación.
- `/api/v1/crm/dashboard`: métricas derivadas exclusivamente de datos persistidos.

Los listados usan paginación backend y filtros allowlisted. Toda mutación usa sesión, CSRF, permisos,
validación, transacción cuando corresponda y auditoría.

## Dirección visual

La Home de Fase 1 aporta tipografía, paleta, geometría, aire, jerarquía y motion sobrio. El CRM adapta
ese ADN a densidad productiva mediante carriles claros, líneas de proceso, paneles editoriales y
estados vacíos. Se rechazan dashboards SaaS genéricos, métricas ficticias y grids repetitivos.

## Fuera de alcance

- Henry AI completo.
- WhatsApp y automatización omnicanal.
- Havona Meet y agenda operativa.
- Telefonía, IA predictiva, portal cliente y academia.
- Almacenamiento de adjuntos hasta aprobar proveedor y política.

## Cierre

La fase permanece Draft. No se crea `release(fase-02)`, `v0.3.0` ni merge sin revisión técnica y
visual formal de HAVONA CAPITAL GROUP.
