# HAVONA Calendar Core — Google Calendar

Estado: implementación operativa dentro de Fase 3; PR Draft. No constituye release ni Havona Meet.

## Arquitectura

**HAVONA Calendar Core es el motor corporativo de agenda de la plataforma. Henry es uno de sus
consumidores, no su propietario.**

```text
Google Calendar
        ↓
HAVONA Calendar Core / CalendarProvider
        ↓
├── Agenda Web
├── CRM
├── Henry
├── Gerentes / equipos
├── Automatizaciones futuras
└── Portal
```

Existe un solo Henry. Google no accede a OpenRouter, Prisma, CRM ni políticas. `CalendarProvider`
desacopla calendarios, FreeBusy, eventos, sincronización y canales push. El navegador solo habla
con el API HAVONA.

## Configuración

```dotenv
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3001/api/v1/integrations/google/calendar/oauth/callback
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly
GOOGLE_CALENDAR_DEFAULT_TIMEZONE=America/Bogota
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=
GOOGLE_CALENDAR_WEBHOOK_SECRET=
GOOGLE_CALENDAR_WEBHOOK_URL=
GOOGLE_CALENDAR_BASE_URL=https://www.googleapis.com/calendar/v3
GOOGLE_CALENDAR_ALLOW_GOOGLE_MEET=true
GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS=15000
```

Las claves de cifrado y webhook son secretos distintos. Nunca son `NEXT_PUBLIC_*`. Los tokens se
cifran con AES-256-GCM, se refrescan server-side y se eliminan al desconectar. Access token,
refresh token, authorization code y client secret no entran en logs ni AuditLog.

## OAuth y mínimo privilegio

El flujo usa `state` de un solo uso, expiración de diez minutos, PKCE S256, redirect registrado,
acceso offline y consentimiento. Scopes:

- `calendar.events`: leer y gestionar los eventos necesarios.
- `calendar.events.freebusy`: consultar ocupación.
- `calendar.calendarlist.readonly`: seleccionar un calendario accesible.

No se solicita el scope amplio `calendar`. La publicación externa puede requerir verificación OAuth
de Google; no se declara realizada ni se solicita sin autorización.

## Persistencia

- `CalendarConnection`: cuenta, calendario, scopes, estado y tokens cifrados.
- `CalendarAvailabilityRule`: horario, notice, duración, buffers, horizonte y zona IANA.
- `CalendarEventLink`: referencia Google y relaciones CRM/conversación.
- `CalendarTeamMembership`: ámbito explícito gerente–consultor, administrado y auditado.
- `CalendarSyncState`: sync token y resultados de sincronización.
- `CalendarWebhookChannel`: channel/resource, token cifrado y expiración.
- `CalendarMutation`: idempotencia de create/update/cancel.
- `CalendarOAuthState`: state hash, PKCE cifrado y consumo.

Google es fuente externa de verdad. HAVONA conserva referencias y metadata operativa, no una copia
completa del calendario.

`CalendarEventLink.createdById` identifica al actor que solicitó la creación;
`CalendarConnection.userId` identifica al propietario/organizador del calendario; y
`assignedConsultantId` identifica al consultor responsable cuando aplica. Henry y futuras
automatizaciones pueden solicitar una cita para un consultor autorizado sin convertirse en dueños
del calendario.

## API

```text
GET    /api/v1/integrations/google/calendar/oauth/connect
GET    /api/v1/integrations/google/calendar/oauth/callback
GET    /api/v1/calendar/status
GET    /api/v1/calendar/calendars
PUT    /api/v1/calendar/calendar
DELETE /api/v1/calendar/connection
GET    /api/v1/calendar/rules
PUT    /api/v1/calendar/rules
GET    /api/v1/calendar/availability
GET    /api/v1/calendar/events
GET    /api/v1/calendar/team/members
PUT    /api/v1/calendar/team/members/:memberId
DELETE /api/v1/calendar/team/members/:memberId
GET    /api/v1/calendar/team/availability
GET    /api/v1/calendar/team/events
POST   /api/v1/calendar/events
PATCH  /api/v1/calendar/events/:id
DELETE /api/v1/calendar/events/:id
POST   /api/v1/calendar/sync
POST   /api/v1/calendar/watch
DELETE /api/v1/calendar/watch
POST   /api/v1/integrations/google/calendar/webhook
```

Las mutaciones requieren sesión, CSRF, permiso, confirmación e `Idempotency-Key`. Antes de crear o
reprogramar se consulta FreeBusy de nuevo. CONSULTOR solo vincula entidades asignadas.

## RBAC y agenda de equipo

- `calendar.connect`: conecta, selecciona y desconecta la cuenta propia.
- `calendar.read`: consulta agenda, reglas y disponibilidad propias.
- `calendar.manage_own`: configura y muta la agenda propia.
- `calendar.manage_team`: consulta agendas y disponibilidad dentro de un ámbito resuelto por el
  servidor; nunca confía en un `userId` enviado por el navegador.

CONSULTOR permanece limitado a sí mismo. GERENTE accede solo a miembros registrados en
`CalendarTeamMembership`. ADMIN y SUPER_ADMIN pueden operar el alcance administrativo permitido.
Solo ADMIN/SUPER_ADMIN con `users.update` pueden definir membresías; toda asignación o retiro se
audita. La API de disponibilidad de equipo acepta hasta veinte miembros autorizados y consulta el
FreeBusy real de cada conexión, permitiendo localizar slots sin dobles reservas.

Todas las relaciones de una cita (`prospectId`, `companyId`, `opportunityId` y `conversationId`)
se autorizan individualmente. Además se comprueba que oportunidad, empresa y conversación sean
consistentes con el prospecto canónico. Un UUID existente fuera del scope produce rechazo y nunca
se persiste, evitando IDOR.

## Henry tools

- `get_calendar_availability`
- `list_calendar_events`
- `get_calendar_event`
- `create_calendar_event`
- `reschedule_calendar_event`
- `cancel_calendar_event`

Las lecturas no requieren confirmación; las mutaciones exigen `confirmedByUser=true`. El rol se
deriva de sesión. Henry solo confirma una acción después de ToolResult exitoso.

## Disponibilidad, zonas y Meet

FreeBusy es la fuente de ocupación. Luxon maneja zonas IANA y DST. Los slots combinan rango, días,
horario corporativo/override, notice, duración y buffers. Los defaults viven en
`calendar.availability_defaults`. Google Meet se solicita opcionalmente mediante
`conferenceDataVersion=1`; no sustituye ni inicia Havona Meet.

## Sync y webhooks

`events.list` conserva `nextSyncToken`; un `410 Gone` inicia full sync controlado. `events.watch`
guarda channel ID, resource ID, token cifrado y expiración. El webhook valida headers y después
consulta Google; no confía en un body. La URL debe ser HTTPS. La recepción externa se difiere a
preproducción si no existe URL pública estable, aunque código y validación interna estén completos.

Los eventos creados directamente en Google se leen desde `events.list` y cuentan como ocupación en
FreeBusy aunque no tengan `CalendarEventLink`. El sync solo actualiza enlaces HAVONA ya conocidos:
no fabrica relaciones CRM para eventos externos. Los eventos creados por HAVONA conservan sus
referencias y trazabilidad interna.

## Validación OAuth real en desarrollo

1. Crear o seleccionar Google Cloud Project autorizado.
2. Habilitar Google Calendar API.
3. Configurar Google Auth Platform, soporte, privacidad y términos.
4. Crear OAuth Client de tipo Web application.
5. Registrar exactamente el redirect localhost.
6. Agregar la cuenta autorizada como test user mientras la aplicación esté en Testing.
7. Guardar client ID, client secret y claves solo en `.env`; reiniciar API.
8. Abrir `http://localhost:3000/agenda`, conectar y aceptar scopes.
9. Consultar FreeBusy y próximas citas.
10. Crear `HAVONA DEV TEST`, comprobar en Google, reprogramar, comprobar y cancelar.
11. Confirmar vínculo CRM y AuditLog sin tokens; retirar residuos de prueba.

No inventar credenciales ni usar cuentas no autorizadas.

## Producción y fallos

Producción requiere dominio verificado, homepage, privacidad, términos, correo de soporte,
justificación de scopes y demostración si Google la exige. El redirect y webhook serán HTTPS.

Errores tipados: `CALENDAR_CONFIGURATION_REQUIRED`, `CALENDAR_NOT_CONNECTED`,
`CALENDAR_AUTH_EXPIRED`, `CALENDAR_PERMISSION_DENIED`, `CALENDAR_PROVIDER_UNAVAILABLE`,
`CALENDAR_RATE_LIMITED`, `CALENDAR_EVENT_NOT_FOUND`, `CALENDAR_CONFLICT`,
`CALENDAR_INVALID_TIMEZONE`, `CALENDAR_INVALID_TIME_RANGE`, `CALENDAR_ATTENDEE_INVALID`,
`CALENDAR_SYNC_FAILED` y `CALENDAR_WEBHOOK_INVALID`. Un fallo de Calendar no detiene Henry textual
ni CRM. No se implementan recordatorios WhatsApp/email ni Havona Meet en este alcance.
