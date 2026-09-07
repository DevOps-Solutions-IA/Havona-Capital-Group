# HAVONA Meet Core

## Declaración arquitectónica

**HAVONA Meet Core es el motor corporativo de reuniones de HAVONA. Henry es uno de sus consumidores y no controla directamente el proveedor de videoconferencia.**

Dependencia admitida: `Agenda/Calendar, CRM, Henry, Portal o automatización → MeetingService → MeetingProvider → Jitsi`. Meet Core no importa Henry, no posee conversaciones y no accede al proveedor mediante IA.

## Dominio y privacidad

`Meeting` conserva proveedor, sala no enumerable, estado, ventana IANA, creador, propietario, consultor asignado, vínculo opcional a `CalendarEventLink` y relaciones CRM autorizadas. `MeetingParticipant` define roles internos; `MeetingInvitation` guarda solo el hash del token; `MeetingAttendanceEvent` recibe eventos idempotentes verificables. No se habilitan grabación, transcripción, almacenamiento audiovisual ni biometría.

`createdById` identifica al actor, `ownerUserId` al organizador y `assignedConsultantId` al responsable. Henry o una automatización pueden solicitar una reunión, pero nunca pasan a ser propietarios del calendario.

## Seguridad y RBAC

- `meeting.read`, `meeting.create`, `meeting.manage_own`, `meeting.manage_team`, `meeting.join` y `meeting.admin` tienen aplicación server-side.
- CONSULTOR queda limitado a sus reuniones y CRM asignado; GERENTE utiliza membresías explícitas de equipo; ADMIN y SUPER_ADMIN conservan alcance administrativo sin omitir confirmaciones.
- Prospect, Company, Opportunity y Conversation reutilizan `CalendarAccessService`, incluida consistencia relacional y defensa IDOR.
- Las salas usan `havona-<random seguro>` sin PII. Las invitaciones almacenan SHA-256, expiración y revocación. JWT Jitsi se firma en backend; solo HOST/MODERATOR obtiene moderación.
- Reuniones canceladas, anticipadas o expiradas rechazan acceso. Lobby es obligatorio por defecto. No se exponen secretos Jitsi.

## Integraciones

Calendar puede vincular una cita a un único Meeting. Reprogramar actualiza su ventana; cancelar revoca Meeting e invitaciones sin borrar trazabilidad. Google Meet y HAVONA Meet son conceptos diferentes. Henry usa tools allowlisted para consultar, crear desde una cita, obtener join y cancelar; las mutaciones exigen sesión, RBAC, confirmación e idempotencia y el modelo nunca genera salas o URLs.

## API

- `GET /api/v1/meetings`, `GET /api/v1/meetings/team`, `GET /api/v1/meetings/:id`
- `POST /api/v1/meetings`, `PATCH /api/v1/meetings/:id`, `DELETE /api/v1/meetings/:id`
- `POST /api/v1/meetings/:id/join`
- `POST /api/v1/meetings/:id/invitations`, `DELETE /api/v1/meetings/:id/invitations/:invitationId`
- `POST /api/v1/public/meetings/join`
- `POST /api/v1/integrations/jitsi/events`

## Configuración y resiliencia

Variables: `MEETING_PROVIDER`, `JITSI_ENABLED`, `JITSI_BASE_URL`, `JITSI_DOMAIN`, `JITSI_APP_ID`, `JITSI_APP_SECRET`, `JITSI_JWT_ENABLED`, `JITSI_TOKEN_TTL_SECONDS`, `JITSI_GUEST_TOKEN_TTL_SECONDS`, `JITSI_MEETING_PREFIX`, `JITSI_REQUEST_TIMEOUT_MS`, `JITSI_WEBHOOK_SECRET`. Todo secreto es server-side.

Si Jitsi no está configurado, Agenda, CRM, Calendar y Henry textual continúan operativos; Meet devuelve `MEETING_CONFIGURATION_REQUIRED`. En VPS/preproducción se validarán Jitsi real, DNS/HTTPS, JWT, host/invitado, lobby, audio/video, expiración, cancelación, eventos, móvil y calidad/latencia. No se declara éxito externo antes de ejecutarlo.
