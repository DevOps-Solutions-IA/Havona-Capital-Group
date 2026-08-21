# HAVONA Email Governance

## Principio

Una master corporativa es un activo gobernado, no un string. Email Template Core produce un mensaje renderizado y Communications Core conserva consentimiento, suppression, entrega e historial. Ninguna plantilla llama directamente a Resend.

## Ciclo de vida y roles

`DRAFT → REVIEW → APPROVED → ACTIVE`. AUTHOR crea una versión; REVIEWER valida contenido; APPROVER concede aprobación editorial; PUBLISHER activa. Los permisos existentes realizan ese mapeo. La aprobación jurídica es independiente mediante `email_templates.legal_approve` y debe conservar una referencia humana verificable.

Una versión con `LEGAL_REVIEW_REQUIRED` no puede pasar a `ACTIVE`. Codex no concede aprobación legal. Cada cambio crea una nueva versión y conserva intacto el histórico. Las variantes personales mantienen `parentTemplateId` y `parentVersionId`; un cambio de master solo marca `UPDATE_AVAILABLE`.

## Clasificación y consentimiento

- `TRANSACTIONAL`: confirma un hecho operativo real.
- `RELATIONSHIP`: continúa una relación o conversación existente.
- `SERVICE`: acompañamiento o gestión de servicio.
- `COMMERCIAL`: contacto comercial que exige controles de consentimiento/opt-out.
- `MARKETING`: campaña promocional; no se utiliza en la biblioteca inicial.

La clasificación no puede ser alterada por Henry ni por un consultor. `COMMERCIAL` y `MARKETING` requieren el bloque protegido `commercial.unsubscribe`. Communications Core sigue siendo la autoridad de consentimiento y suppression.

## Automatización y evidencia

Las políticas son `MANUAL_ONLY`, `HENRY_DRAFT_ONLY`, `HENRY_CONFIRM_SEND`, `AUTOMATION_WITH_APPROVAL` y `AUTOMATION_ALLOWED`. Incluso `AUTOMATION_ALLOWED` exige master activa, versión legalmente aprobada, variables completas, evidencia requerida y controles de Communications. Los stop events deben acompañar cualquier futura cadencia.

No-show requiere evento fiable de asistencia o marca humana explícita. Pagos permanecen manuales y con triggers futuros hasta existir fuente autorizada. Emisión requiere evidencia operativa autoritativa. Ningún stage CRM se interpreta por sí solo como pago, emisión o asistencia.

## Contenido protegido y revisión

Footer, legal y unsubscribe están bloqueados. `LegalContentRegistry` registra `corporate.footer.default`, `commercial.unsubscribe` y `confidentiality.default`, todos inicialmente `LEGAL_REVIEW_REQUIRED`. Las fechas `lastReviewedAt` y `nextReviewAt` permiten identificar `TEMPLATE_REVIEW_DUE`; el vencimiento no archiva automáticamente.

## Seguridad

El renderer valida variables registradas, HTML, URLs, inyección de headers, bloques requeridos, longitud, CTA y patrones básicos de spam. La resolución de CRM, Calendar, Meet, Knowledge, destinatario y firma ocurre server-side y respeta RBAC.
