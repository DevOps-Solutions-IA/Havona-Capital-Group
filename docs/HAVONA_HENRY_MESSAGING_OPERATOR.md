# HAVONA Henry Messaging Operator

## Alcance y arquitectura

HAVONA Henry Messaging Operator convierte instrucciones internas autorizadas en operaciones de
correo trazables. No es un asistente adicional ni un provider. El flujo obligatorio es:

```text
Usuario interno → Henry Core → resolución de intención/contexto
→ CRM / Calendar / Meet / Knowledge
→ Email Template Core → draft y preview
→ política / consentimiento / confirmación
→ Communications Core → EmailProvider
```

Henry no importa ni invoca `ResendEmailProvider`. Communications Core conserva el thread, el
mensaje, la supresión, la idempotencia y el dispatch. Automations Core conserva el job diferido.

## Intenciones y tools

Las intenciones server-side son `EMAIL_DRAFT`, `EMAIL_EDIT`, `EMAIL_PREVIEW`, `EMAIL_SEND`,
`EMAIL_SCHEDULE`, `EMAIL_REPLY`, `EMAIL_ATTACH`, `EMAIL_CANCEL_SCHEDULED` y
`EMAIL_BATCH_PREPARE`. Las tools allowlisted son:

- `recommend_email_templates`, `create_email_draft`, `update_email_draft` y
  `preview_email_draft`;
- `attach_to_email_draft`, `send_email_draft`, `schedule_email_draft` y
  `cancel_scheduled_email`;
- `request_email_confirmation` crea el vínculo expirable antes de cualquier mutación;
- `reply_to_email_thread`, `get_email_send_status` y `prepare_email_batch`.

Las mutaciones se vuelven a autorizar en servidor. El contenido recuperado por RAG es dato no
confiable y nunca puede originar por sí solo una tool call.

## Contexto, destinatario y continuidad

El destinatario se resuelve en este orden: entidad explícita, thread explícito, entidad de página,
working context, prospecto de la conversación y búsqueda CRM autorizada. Cero o varios resultados
producen aclaración; nunca se elige por aproximación. `CalendarAccessService.authorizeRelations`
aplica el scope CRM y evita IDOR.

`ConversationState.state.activeEmailDraftId` conserva el draft activo. Las ediciones se aplican
como patch y Email Template Core rechaza cambios en bloques `LOCKED` o no editables. Un cambio
invalida el snapshot anterior.

## Preview y confirmación

El preview contiene destinatario, asunto, HTML/texto, clasificación, adjuntos, variables faltantes,
versión y checksum. `HenryMessagingOperation` liga la confirmación a:

- actor y conversación;
- draft y versión;
- destinatario normalizado;
- checksum exacto del render;
- checksum de adjuntos;
- plan, fecha y timezone cuando aplica.

La confirmación usa `ALWAYS_CONFIRM` y expira tras
`HENRY_MESSAGING_CONFIRMATION_TTL_SECONDS` (900 segundos por defecto). Antes del dispatch se
revalidan actor, expiración, checksum, destinatario, adjuntos, estado/version legal, consentimiento,
supresión y thread. El worker repite la validación autoritativa de recipient, template y contexto
PALIG justo antes del I/O. Una edición posterior genera `EMAIL_CONFIRMATION_STALE`.

## Envío, idempotencia y estados

La clave estable deriva de intent + draft + checksum; Communications Core conserva su propia clave
única y crea exactamente un `CommunicationMessage`. El snapshot final registra template, versión,
variant, draft, clasificación y operación Henry. `QUEUED`/`SENT` no se muestran como `DELIVERED`;
entrega y fallo dependen de eventos reales del provider.

Si Resend no está configurado, Communications devuelve `CHANNEL_NOT_CONFIGURED`; no se fabrica un
éxito. El asunto aprobado viaja en metadata y el worker lo toma del snapshot, no de un texto
genérico del thread.

## Programación, cancelación y planes

Los envíos programados usan `AutomationQueueService` y el job
`automation.messaging-send`; no existen timers ni scheduler paralelo. La fecha debe ser futura y el
timezone explícito. Cancelar elimina un job todavía `delayed/waiting/paused` y persiste `CANCELLED`.
La ejecución vuelve a validar el snapshot y Communications antes de enviar.

Un plan puede incluir `followUpAt`. El seguimiento se crea solo después de que Communications
acepta el mensaje. Si el mensaje queda `QUEUED` y falla la tarea, el resultado es
`PARTIAL_FAILED`; nunca se reenvía el correo para compensar.

## Adjuntos, Calendar y Knowledge

Las referencias admitidas siguen siendo `KNOWLEDGE_DOCUMENT` publicado/autorizado y
`COMMUNICATION_ATTACHMENT` dentro del scope, vigente y seguro. No se aceptan rutas locales. Los
datos de cita y HAVONA Meet se resuelven desde sus cores; Template Core no crea eventos. Contenido
de producto solo procede de Knowledge `PUBLISHED`; la ausencia de evidencia deja la variable
faltante y bloquea el envío si es requerida.

## Consentimiento, threads y clasificación

Communications Core bloquea `OPTED_OUT`/`SUPPRESSED`. `COMMERCIAL` y `MARKETING` requieren
`OPTED_IN`. Henry no puede enviar en threads `PAUSED` o `CLOSED`. La clasificación procede de la
versión o de la policy ad-hoc permitida (`TRANSACTIONAL`, `RELATIONSHIP`, `SERVICE`); Henry no puede
reclasificar para evadir controles.

## Seguridad, RBAC y auditoría

Se requieren `communications.send` y `email_templates.preview`. CONSULTOR queda limitado a sus
prospectos/drafts; GERENTE usa membresías explícitas; ADMIN/SUPER_ADMIN conservan el scope
administrativo. Se previenen recipient/header/HTML injection, draft/attachment IDOR,
impersonación, replay y TOCTOU.

Se auditan draft, edición, adjunto, preview, solicitud/aceptación de confirmación, dispatch,
programación, cancelación y fallo parcial. No se guarda chain-of-thought, credenciales ni headers
de proveedor.

## API y UX

Además de las tools, la UI interna usa endpoints autenticados bajo
`/api/v1/henry/internal/...` para preparar/editar drafts, solicitar y aceptar confirmación,
consultar estado y cancelar una programación. La tarjeta de Henry presenta contenido real,
clasificación y adjuntos; muestra `Enviar correo` únicamente para una confirmación vigente.

## Validación externa

Las pruebas usan servicios determinísticos y colas internas; no llaman Resend. El código de Fase G
está preparado, pero dominio, sender, webhook y entrega real permanecen pendientes de configuración
externa autorizada.
