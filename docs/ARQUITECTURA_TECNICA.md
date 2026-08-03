# ARQUITECTURA TÉCNICA — HAVONA CAPITAL GROUP

## 1. Enfoque

HAVONA CAPITAL GROUP se construirá como un monorepo con monolito modular, preparado para separar servicios cuando el crecimiento lo requiera.

## 2. Aplicaciones

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
