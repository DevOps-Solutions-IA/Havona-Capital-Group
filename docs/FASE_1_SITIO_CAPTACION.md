# Fase 1 — Sitio público y captación

## Estado

**FASE 1 — COMPLETADA**

HAVONA CAPITAL GROUP aprobó formalmente el alcance técnico, funcional y visual el 1 de agosto de
2026. La versión de cierre es `v0.2.0`; la evidencia consolidada se registra en
`docs/CIERRE_FASE_1.md`.

## Experiencia pública

La reconstrucción editorial de la Home, validada visualmente en agosto de 2026, es la referencia
maestra de marca de **HAVONA CAPITAL GROUP**. Su dirección artística se documenta de forma
permanente en `docs/DIRECTRIZ_VISUAL_FUNCIONAL.md`. Los refinamientos visuales progresivos no
invalidan este cierre ni extienden automáticamente el rediseño a las landings.

- Home editorial premium con navegación fija y responsive.
- Composición visual original basada en arquitectura, familia, empresa, protección y tecnología.
- CTAs de consultoría conectados al formulario real.
- Entrada de Henry limitada explícitamente a una captura inicial; no simula inteligencia ni
  adelanta la Fase 3.
- Landings estáticas para `/pension`, `/educacion`, `/patrimonio`, `/proteccion`, `/accidentes`,
  `/empresarios`, `/socios`, `/socio-unico` y `/consultores`.
- Contenido específico sin cifras, coberturas, promesas o rentabilidades no aprobadas.
- Política accesible en `/privacidad`.

## Dominio de captación

La migración `20260801000000_phase_1_lead_capture` añade:

- `LeadSource`: catálogo controlado e idempotente de fuentes.
- `Prospect`: identidad y contexto mínimo de la solicitud.
- `Consent`: evidencia append-only del consentimiento y versión de privacidad.
- `LeadEvent`: historial inicial inmutable e idempotente por `submissionId`.

El seed registra las fuentes `direct`, `organic`, `campaign`, `referral` y `henry-entry`. También
añade `prospects.read` a `SUPER_ADMIN`, `ADMIN` y `GERENTE`; `CONSULTOR` no recibe acceso.

La captura exige nombre, ciudad, al menos correo o teléfono y consentimiento explícito. Normaliza
identidades, reutiliza razonablemente un prospecto existente y crea consentimiento, evento y
auditoría dentro de una única transacción. La respuesta pública no revela si la identidad ya
existía.

## API

### Captación pública

`POST /api/v1/prospects/public`

- No requiere sesión ni usa cookies administrativas.
- Acepta solo el contrato validado de captación.
- Aplica honeypot, sanitización, límites de longitud y rate limiting específico.
- Usa `submissionId` UUID para que un reintento no duplique la captura.
- Persiste fuente, campaña, landing, interés, consentimiento y fecha.

### Administración

- `GET /api/v1/prospects`: paginación, búsqueda, estado, fuente, interés y orden allowlisted.
- `GET /api/v1/prospects/:id`: detalle, consentimientos e historial inicial.

Ambos endpoints requieren sesión y `prospects.read`. No existen mutaciones, pipeline, asignación,
notas, tareas, exportación ni automatizaciones de CRM en esta fase. La consulta de detalle queda
auditada sin incluir PII en metadata.

## Recuperación ante fallos de red

El formulario crea un `submissionId` antes de enviar. Los fallos de red, respuestas 429 y errores
5xx conservan temporalmente la captura en `localStorage` del navegador y reintentan cuando vuelve
la conexión. La cola admite como máximo cinco capturas y elimina automáticamente elementos con
más de 24 horas. Una confirmación del backend elimina la captura pendiente. Los errores 4xx no se
encolan porque requieren corrección del formulario.

Esta cola cumple la continuidad solicitada con retención acotada, pero un navegador compartido
puede conservar temporalmente datos de contacto. No se deben solicitar documentos, contraseñas
ni información financiera sensible en el mensaje.

## SEO, rendimiento y accesibilidad

- Metadata individual, canonical, OpenGraph y Twitter cards.
- Sitemap y robots generados por Next.js.
- JSON-LD de organización con escape seguro.
- Rutas administrativas y de autenticación marcadas `noindex`.
- Landings prerenderizadas mediante SSG.
- Separación de componentes server/client; JavaScript cliente concentrado en interacción real.
- Navegación por teclado, foco visible, labels, errores asociados y regiones de estado.
- Navbar específica para móvil/tablet/escritorio.
- Animaciones eficientes con soporte para `prefers-reduced-motion`.

## Variables nuevas

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
COOKIE_DOMAIN=
```

`NEXT_PUBLIC_SITE_URL` controla canonical, sitemap y datos estructurados. El Dockerfile y Compose
la inyectan tanto al build como al runtime de web. `NEXT_PUBLIC_API_URL` continúa definiendo la
API. `COOKIE_DOMAIN` queda vacío en desarrollo local; en un despliegue con web y API en
subdominios debe usar el dominio compartido, por ejemplo `.havonacapital.com`, para que el cliente
pueda leer la cookie CSRF. Esto exige que todos los subdominios bajo ese dominio sean confiables y
estén protegidos.

## Pruebas y evidencia

- Contrato, validación y formulario público.
- Captura exitosa y recuperación de red.
- Bandeja administrativa y detalle de consentimiento/historial.
- Servicio de prospectos y auditoría sin PII en metadata.
- Integración real en CI con PostgreSQL y Redis.
- Migración y seed ejecutado dos veces.
- Login administrativo y consulta de prospectos.
- Matriz RBAC: acceso permitido para `SUPER_ADMIN`, `ADMIN` y `GERENTE`; rechazo de
  `CONSULTOR` y solicitudes anónimas.
- Conflictos de identidad cruzada, asociación accesible de errores y expiración de la cola local.
- Lint, typecheck, pruebas y builds del monorepo.
- Validación de Docker Compose y construcción de imágenes de producción.

## Fuera de alcance

- Henry AI completo.
- CRM y pipeline comercial completos.
- WhatsApp y correo masivo.
- Jitsi y Havona Meet.
- Seguimientos automáticos.
- Telefonía.
- Analítica comercial avanzada.

## Cierre

No existen pendientes críticos dentro del alcance aprobado. Henry AI completo, CRM completo,
WhatsApp, automatizaciones, Havona Meet, telefonía y analítica avanzada continúan asignados a sus
fases posteriores.
