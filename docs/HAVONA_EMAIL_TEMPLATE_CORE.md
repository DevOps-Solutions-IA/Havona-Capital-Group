# HAVONA Enterprise Email Template Intelligence Core

## Declaración arquitectónica

**Email Template Core es la capa corporativa transversal de composición y gobierno de correo de
HAVONA CAPITAL GROUP.** Produce mensajes renderizados y snapshots inmutables; nunca llama Resend
ni otro proveedor. Todo envío sigue `Email Template Core → Communications Core → EmailProvider`.

CRM, Henry, Automations, Calendar, Knowledge y las interfaces internas consumen el mismo núcleo.
Henry solo crea, personaliza y previsualiza borradores autorizados; no altera bloques protegidos ni
envía directamente.

## Dominio y lifecycle

- `EmailTemplate`: identidad, propósito, categoría, alcance, locale y gobierno corporativo/personal.
- `EmailTemplateVersion`: contenido inmutable, contrato de variables, clasificación y checksum. Una
  master corporativa avanza `DRAFT → REVIEW → APPROVED → ACTIVE`.
- `EmailTemplateVariant`: variante personal ligada a master y versión exactas. Un cambio de master
  marca `updateAvailable`; nunca reescribe la variante.
- `EmailTemplateDraft`: edición puntual por destinatario/contexto; no modifica master ni variante.
- `EmailTemplateUsage`: snapshot final preparado para Communications con procedencia completa.
- `EmailSignature`: firma estructurada desde perfil autorizado, sin HTML arbitrario.

El catálogo contiene 32 claves estructurales en Prospección, Reuniones, Propuesta,
Onboarding/Emisión, Servicio/Retención, Continuidad de pago y Recuperación de cancelación. No se
siembra copy comercial ficticio ni contenido activo.

## Renderer, bloques y variables

Los bloques `EDITABLE`, `LOCKED` y `REQUIRED` separan contenido personalizable de avisos legales,
identidad, footer y opt-out. Una master exige footer protegido; `COMMERCIAL` y `MARKETING` exigen un
bloque `UNSUBSCRIBE` no editable. El renderer determinístico aplica marca email-safe HAVONA y
produce HTML/texto, rechazando scripts, iframes, objetos, formularios, handlers, `javascript:` e
inyección de encabezados.

Solo se aceptan variables del registro central: `client.*`, `consultant.*`, `company.name`,
`opportunity.name`, `appointment.*`, `meeting.url`, `product.name` y `system.companyName`. El
servidor resuelve CRM, perfil, Calendar, Meet y Knowledge con RBAC. `product.name` solo procede de
conocimiento `PUBLISHED` autorizado. Una variable requerida ausente bloquea el handoff.

## Draft, preview, snapshots e integraciones

Preview no envía. Devuelve destinatario, asunto, preheader, HTML, texto, variables, faltantes,
advertencias y referencias. El handoff persiste un snapshot exacto con template, versión, variante,
draft, clasificación, locale y timestamp; cambios posteriores no alteran el histórico.

Calendar aporta fecha/hora/zona sin que Template Core cree citas. Meet aporta referencia interna
autorizada. Knowledge aporta hechos publicados. Los attachments son referencias autorizadas, no
blobs del template. Communications aplica consentimiento/supresión y es la única salida al provider.
En Fase B el handoff declara `providerDispatched: false`: no crea mensajes ni llama al provider.

Henry dispone de catálogo, detalle, creación/personalización y preview. Automations debe validar
template `ACTIVE`, variables y consentimiento antes de delegar en Communications.

## RBAC, API y portal

Permisos: `email_templates.read`, `email_templates.create_personal`,
`email_templates.edit_personal`, `email_templates.manage_corporate`, `email_templates.approve` y
`email_templates.preview`.

- CONSULTOR: masters permitidas, variantes y drafts propios.
- GERENTE: lectura/previsualización propia y de miembros explícitos de equipo; no edita sus drafts.
- ADMIN/SUPER_ADMIN: gobierno corporativo conforme a permisos.

El scope de gerente reutiliza `CalendarTeamMembership`; la búsqueda textual se combina con el scope
para impedir inferencias. API: `/api/v1/email-templates`, `/api/v1/email-drafts` y
`/api/v1/email-signatures`. Portal: `/comunicaciones/plantillas`, con entradas reales desde Prospect
360 y threads Email.

## Límites y reconciliación posterior

No se incorpora copy comercial definitivo, test-send externo ni envío conversacional operativo.
Fase C debe partir de este catálogo gobernado sin duplicar el motor. La documentación de
`docs/pre-cierre-enterprise-blueprint`, si se integra después, debe reconciliar catálogo, lifecycle,
clasificación y límites de Fase B sin sobrescribir este contrato técnico.
