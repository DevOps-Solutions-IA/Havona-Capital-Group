# ARQUITECTURA TÉCNICA — HAVONA CAPITAL GROUP

> Opportunity conserva enriquecimiento financiero nullable e historia append-only. CRM es fuente, Outbox publica cambios, Analytics agrega por moneda y Henry consume Analytics. No existe motor FX o contable.

> Knowledge Core es transversal y no depende de Henry. Storage, embeddings, recuperación autorizada, formación y memoria gobernada son dominios reutilizables; Henry los consume mediante tools y un único ContextAssembler.

> Los originales de Knowledge usan `StorageProvider` y filesystem persistente content-addressed en producción. El staging calcula SHA-256 server-side, deduplica, aplica scan/review y solo entonces alimenta el pipeline existente; nunca publica automáticamente. Henry no conoce paths ni storage keys.

## 1. Enfoque

HAVONA CAPITAL GROUP se construirá como un monorepo con monolito modular, preparado para separar servicios cuando el crecimiento lo requiera.

## 2. Aplicaciones

HAVONA Meet Core es un dominio corporativo transversal. Agenda/Calendar, CRM, Henry, Portal y
futuras automatizaciones consumen `MeetingService`, que delega en `MeetingProvider`; Jitsi es la
implementación inicial. La dependencia permitida es Henry → Meet Core y Calendar → Meet Core.
Meet Core nunca depende de Henry y Google Meet no se confunde con HAVONA Meet.

HAVONA Communications Core es el dominio corporativo omnicanal transversal. CRM, Henry,
consultores, gerentes, Portal, servicio al cliente y automatizaciones futuras consumen el servicio,
que delega en `MessagingProvider` o `EmailProvider`. Meta WhatsApp y Resend son implementaciones
iniciales. La dependencia permitida es Henry → Communications Core; Communications Core no depende
de Henry y opera aunque la IA esté deshabilitada.

HAVONA Email Template Core es la capa transversal de composición y gobierno de correo. CRM, Henry,
Automations y las interfaces producen borradores/versiones mediante este núcleo; el núcleo entrega
mensajes renderizados a Communications Core y nunca depende de Resend ni de otro provider.

En la integración Resend de Fase G, BullMQ reclama el mensaje y realiza una revalidación final de
recipient, consentimiento/suppression, template, adjuntos y Product/Need PALIG. El transporte
compartido solo conoce HTTP, timeout, idempotencia y mapping seguro; el webhook Svix es la única
fuente de `DELIVERED`, `BOUNCED` y `COMPLAINED`. `SENT` no equivale a entrega.

HAVONA Henry Messaging Operator es una capa de orquestación dentro del único Henry Core. Resuelve
intención y contexto, conserva el draft activo, exige confirmación ligada al snapshot y delega el
dispatch a Communications Core y la programación a Automations Core. No contiene provider ni crea
un agente de email independiente.

HAVONA Automations Core es el motor corporativo transversal de workflows. CRM, Calendar, Meet y
Communications publican eventos mediante un bus interno respaldado por transactional outbox;
Automations Core decide enrollments, conditions, delays, approvals y actions allowlisted mediante
BullMQ. Henry puede aportar razonamiento estructurado, pero no ejecuta providers ni sustituye el
motor determinístico. La dependencia permitida es `Henry → Automations Core`; Automations Core no
depende de providers externos concretos.

HAVONA Enterprise Analytics & Commercial Intelligence Core es la capa semántica transversal que
calcula hechos reproducibles desde CRM, Calendar, Meet, Communications, Automations y Henry. No
depende de Henry: la dependencia correcta es `Henry → Analytics Core`. El catálogo centraliza
fórmulas, fuentes, periodos, cobertura y versiones; PostgreSQL es la fuente inicial y los datos
desconocidos nunca se convierten en cero.

### `apps/web`

Responsabilidades:

- Sitio público.
- Landing pages.
- Portal interno.
- CRM.
- Panel gerencial.
- Panel administrativo.
- Chat.
- Agenda.
- Portal de consultores.

Tecnología:

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- motion/react.
- React Hook Form.
- Zod.

### `apps/api`

Responsabilidades:

- API REST.
- Autenticación.
- Usuarios.
- Roles.
- Permisos.
- Auditoría.
- CRM.
- Agenda.
- Conversaciones.
- Integraciones.
- Henry.
- Configuración.

La agenda se implementa como **HAVONA Calendar Core**, un módulo corporativo independiente de
Henry. `CalendarService` y `CalendarProvider` son consumidos por Agenda Web, CRM, Henry, gerentes,
workers/automatizaciones futuras y Portal. La dependencia permitida es `Henry → Calendar Core`;
Calendar Core no depende de Henry.

Tecnología:

- NestJS.
- Prisma.
- PostgreSQL.
- Redis.
- BullMQ.

### `apps/worker`

Responsabilidades:

- Trabajos programados.
- Seguimientos.
- Correos.
- Notificaciones.
- Reintentos.
- Procesamiento asíncrono.
- Resúmenes de reuniones.
- Automatizaciones.

## 3. Paquetes compartidos

### `packages/ui`

Sistema visual reutilizable.

### `packages/database`

Prisma schema, cliente, migraciones y seed.

### `packages/auth`

Tipos, políticas y utilidades de autenticación.

### `packages/config`

Validación y acceso a variables de entorno.

### `packages/contracts`

DTO, esquemas, eventos y contratos compartidos.

### `packages/shared`

Utilidades comunes sin dependencias de negocio.

## 4. Base de datos

Motor: PostgreSQL.

Entidades iniciales:

- User.
- Role.
- Permission.
- UserRole.
- RolePermission.
- Session.
- AuditLog.
- SystemSetting.

Entidades futuras:

- Prospect.
- Client.
- Company.
- Conversation.
- Message.
- Appointment.
- Meeting.
- Opportunity.
- Task.
- Consent.
- Campaign.
- Consultant.
- Product.
- Document.

## 5. Seguridad

- Contraseñas con Argon2id.
- Sesiones seguras.
- Cookies HTTP-only.
- SameSite.
- HTTPS obligatorio.
- Rate limiting.
- CORS restringido.
- Validación de entrada.
- RBAC.
- Auditoría.
- Protección de secretos.
- Backups cifrados.
- Política de retención.

## 6. Infraestructura

### Docker Compose

Servicios iniciales:

- web.
- api.
- worker.
- postgres.
- redis.
- proxy.
- jitsi.
- monitoring.

### Proxy

Caddy recomendado por simplicidad de HTTPS.

Subdominios previstos:

- `havonacapital.com`
- `app.havonacapital.com`
- `api.havonacapital.com`
- `henry.havonacapital.com`
- `meet.havonacapital.com`
- `admin.havonacapital.com`

## 7. Observabilidad

- Logs estructurados.
- Health checks.
- Métricas básicas.
- Registro de errores.
- Estado de PostgreSQL.
- Estado de Redis.
- Estado de Jitsi.
- Alertas de recursos.

## 8. Escalabilidad

Orden de separación futura:

1. Jitsi.
2. PostgreSQL.
3. Worker.
4. Redis.
5. Henry.
6. Almacenamiento de documentos.

## 9. Decisiones no permitidas sin aprobación

- Cambiar NestJS.
- Cambiar Next.js.
- Cambiar PostgreSQL.
- Cambiar Prisma.
- Cambiar Redis.
- Introducir microservicios.
- Introducir Kubernetes.
- Añadir proveedores sin justificación.

## PALIG Product & Need Core

PALIG Product & Need Core gobierna el único portafolio comercializable
(`PAN_AMERICAN_LIFE_COLOMBIA`) y separa CustomerNeed, AuthorizedSolution, AuthorizedProduct y
evidencia Knowledge. Las referencias de Opportunity son nullable para respetar discovery y no
alteran el dominio financiero.
