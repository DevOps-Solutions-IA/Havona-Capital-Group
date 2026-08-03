# HAVONA Communications Core

## Declaración arquitectónica

**HAVONA Communications Core es el motor corporativo omnicanal de la plataforma. Henry es uno de
sus consumidores; no controla directamente Meta WhatsApp ni Resend.**

CRM, Henry, consultores, gerentes, Portal, servicio al cliente y automatizaciones futuras consumen
el mismo dominio. Communications Core continúa operativo aunque Henry se encuentre deshabilitado.

```text
HAVONA Platform
  → Communications Core
    → MessagingProvider → MetaWhatsAppProvider
    → EmailProvider     → ResendEmailProvider
```

Los providers solo conocen autenticación, API externa, mapping, normalización y errores del
proveedor. No contienen reglas CRM, RBAC comercial, prompts ni asignación.

## Dominio

- `CommunicationThread`: hilo por canal, identidad normalizada, modo de atención, responsable y
  relaciones CRM opcionales.
- `CommunicationMessage`: mensaje interno con dirección, autor, contenido, estado, idempotencia y
  referencia externa.
- `CommunicationParticipant`: participantes del hilo sin asumir identidad CRM ambigua.
- `CommunicationAttachment`: metadata privada con expiración; no publica archivos.
- `MessageDeliveryEvent`: historial append-only de enviado, entregado, leído o fallido.
- `CommunicationAssignment`: historial de asignaciones y reasignaciones.
- `CommunicationConsent`: opt-in, opt-out y supresión por tipo de comunicación.
- `WhatsAppTemplate`: catálogo local de plantillas externas aprobadas; no crea plantillas ficticias.
- `CommunicationWebhookEvent`: deduplicación técnica de eventos normalizados.
- `ChannelConnection`: estado operativo seguro sin credenciales.

Los identificadores Meta/Resend nunca sustituyen los UUID internos.

## Seguridad y RBAC

Permisos: `communications.read`, `communications.send`, `communications.manage_own`,
`communications.manage_team`, `communications.assign`, `communications.takeover`,
`communications.link_crm` y `communications.admin`.

- CONSULTOR: hilos asignados propios.
- GERENTE: hilos propios y miembros explícitos de `CalendarTeamMembership`.
- ADMIN/SUPER_ADMIN: ámbito administrativo autorizado.

El servidor resuelve el alcance. Los IDs de usuario enviados por cliente no conceden acceso. Las
relaciones Prospect, Company, Opportunity y Conversation reutilizan
`CalendarAccessService.authorizeRelations`, incluida consistencia Opportunity ↔ Prospect ↔ Company
y aislamiento de consultores.

Webhooks Meta se validan mediante `X-Hub-Signature-256` y secreto de aplicación. La verificación GET
usa comparación constante. Resend usa el contrato Svix firmado (`svix-id`, `svix-timestamp`,
`svix-signature`) con ventana anti-replay. Ninguna credencial aparece en frontend, auditoría o logs.

## WhatsApp Meta

El provider usa Cloud API versionada y soporta texto/plantilla. Un mensaje libre solo puede
encolarse dentro de las 24 horas posteriores a un inbound real. Fuera de esa ventana exige una
plantilla local con estado `APPROVED`; Henry no puede eludir la regla.

Los webhooks normalizan inbound y estados `sent`, `delivered`, `read`, `failed`. Los IDs externos y
la clave idempotente evitan duplicados ante reintentos.

## Resend

El provider envía texto/HTML server-side con `reply-to`, clave idempotente y referencia externa.
Los webhooks soportan enviado, entregado, rebote, complaint y fallo. La recepción se normaliza solo
cuando Resend entrega `email.received`; la UI no declara inbound activo porque requiere dominio y
routing externos.

## Colas

`havona-communications` utiliza BullMQ/Redis. El API persiste primero y encola `communication.send`
o `communication.inbound`. El worker realiza I/O con Meta/Resend, actualiza el mensaje y aplica
reintentos exponenciales seguros. Un mensaje ya enviado no vuelve a salir. El webhook no espera IA.

## Henry y takeover

Henry usa únicamente `CommunicationsService` mediante tools allowlisted. Nunca llama Meta/Resend.
Los modos son `HENRY`, `HUMAN`, `PAUSED` y `CLOSED`. Durante takeover humano no existe respuesta
automática de Henry; puede actuar como copiloto interno. Cambios de modo y mutaciones se auditan y
requieren permisos/confirmación de tool.

## Consentimiento y privacidad

Instrucciones explícitas como “no me escriban” activan opt-out determinista en dominio y pausan el
hilo; no dependen exclusivamente del modelo. El envío a `OPTED_OUT` o `SUPPRESSED` se bloquea tanto
en API como en worker. No se activa marketing automation en esta fase.

Adjuntos conservan únicamente metadata y aplican tamaño/MIME/retención configurable. Media privada
no se sirve como URL pública y no se ejecuta. La recuperación binaria externa permanece oculta
hasta contar con almacenamiento privado y escaneo autorizados.

## Variables

Consultar `.env.example`. Variables sensibles: `META_WHATSAPP_ACCESS_TOKEN`,
`META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`, `RESEND_API_KEY` y
`RESEND_WEBHOOK_SECRET`. Nunca utilizar valores de un proveedor como credencial de otro.

## Endpoints

- `GET /api/v1/communications/config-status`
- `GET /api/v1/communications`
- `GET /api/v1/communications/:id`
- `POST /api/v1/communications/:id/messages`
- `PATCH /api/v1/communications/:id/mode`
- `PATCH /api/v1/communications/:id/assignment`
- `PATCH /api/v1/communications/:id/crm`
- `DELETE /api/v1/communications/:id`
- `GET|POST /api/v1/integrations/meta/whatsapp/webhook`
- `POST /api/v1/integrations/resend/webhook`

## Validación externa pendiente

Meta requiere aplicación/business account/número/token, plantillas aprobadas y webhook HTTPS
público. Resend requiere dominio remitente verificado; inbound requiere dominio/routing receptor.
Hasta obtener evidencia real estos puntos se reportan pendientes, no fallidos ni aprobados.
