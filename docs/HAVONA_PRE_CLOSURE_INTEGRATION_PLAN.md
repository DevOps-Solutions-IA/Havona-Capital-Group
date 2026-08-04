# HAVONA — Plan de Integración Antes del Cierre Integral

## Objetivo
Definir las fases restantes antes de declarar cerrado el bloque enterprise de HAVONA y pasar a preproducción/VPS. Este plan parte del estado técnico alcanzado hasta Analytics y asume que Fase 8 (Knowledge/RAG/Training/Memory) continúa en ejecución.

## Regla general
No cerrar PR #4, no crear tag/release final y no declarar cierre integral hasta completar las fases siguientes y validar regresión completa.

---

## Fase A — Finalizar Fase 8 actual
### Alcance
- Knowledge Core.
- ingestion/versionado/publicación.
- RAG autorizado con citas.
- training y role play.
- memoria gobernada.
- portal interno.
- seguridad frente a prompt injection/exfiltration.

### Criterio de salida
- CI completo verde.
- Knowledge/RAG/Training/Memory técnicamente aprobados.
- Ningún secreto versionado.
- Integraciones externas pendientes identificadas explícitamente.

---

## Fase B — Messaging & Email Template Intelligence Core
### Objetivo
Implementar la infraestructura de plantillas y composición inteligente descrita en `HAVONA_MESSAGING_EMAIL_AUTOMATION_BLUEPRINT.md`.

### Alcance mínimo enterprise
- Corporate masters y personal variants.
- one-off drafts.
- ad-hoc drafts de Henry.
- renderer server-side.
- variable registry.
- preview.
- versionado.
- protected blocks.
- branding.
- firma consultor.
- RBAC.
- test send mediante Communications Core.
- integration con Automations y Henry.
- snapshot de contenido enviado.
- consentimiento/suppression.
- idempotencia.

### Criterio de salida
El mismo correo puede prepararse desde UI, Henry o Automation usando un único motor, sin bypass de Communications Core.

---

## Fase C — Corporate Email Library & Governance
### Objetivo
Convertir la infraestructura en una biblioteca operativa real.

### Alcance
- Definir y aprobar las 32 masters iniciales.
- Asuntos.
- preheaders.
- cuerpo HTML/texto.
- CTA.
- variables obligatorias/opcionales.
- protected blocks.
- categorías y lifecycle stages.
- idioma/locale.
- política de personalización.
- estados DRAFT/REVIEW/APPROVED/ACTIVE/ARCHIVED.

### Entregable clave
Matriz maestra de plantillas con:
- intención;
- trigger;
- actor permitido;
- confirmación requerida;
- variables;
- CTA;
- follow-up posterior;
- evento de detención;
- canal compatible;
- contenido protegido.

### Criterio de salida
Ninguna master ACTIVE sin contenido corporativo revisado.

---

## Fase D — Henry Messaging Operator
### Objetivo
Permitir que Henry opere comunicaciones de extremo a extremo desde lenguaje natural.

### Escenarios obligatorios
1. “Envía este correo a este cliente.”
2. “Usa la plantilla de seguimiento y hazla más ejecutiva.”
3. “Adjunta la propuesta correcta.”
4. “Agenda seguimiento el jueves y agrega el link.”
5. “Mándalo mañana a las 8:30.”
6. “Hazlo más corto y cambia solo el último párrafo.”
7. “Prepara correos para los clientes con propuesta y sin próxima cita.”

### Controles
- entity resolution segura.
- scope CRM.
- Calendar/Meet real.
- Knowledge para afirmaciones corporativas.
- confirmación por policy.
- batch approval.
- no impersonation.

### Criterio de salida
Henry puede encadenar Email + Calendar + Automation + CRM sin saltarse los Cores.

---

## Fase E — Cadences, Replies & Intelligent Follow-up
### Objetivo
Madurar automatización comercial alrededor de email.

### Alcance
- secuencias/cadencias.
- delays.
- respuesta entrante detiene follow-up.
- opt-out detiene comunicación.
- takeover humano pausa Automation.
- delivery failure genera señal/prioridad.
- reply draft asistido.
- thread preservation cuando provider lo soporte.
- programación y cancelación de envíos.

### Criterio de salida
No existen follow-ups absurdos después de respuesta, opt-out, cancelación o takeover.

---

## Fase F — Resend Production Integration
### Objetivo
Validar email real en entorno externo.

### Alcance
- dominio de envío.
- DKIM/SPF.
- DMARC recomendado según política.
- From/Reply-To.
- API key en secrets manager/env, nunca Git.
- webhook de delivery.
- bounce/complaint/failed.
- thread/reply capabilities según provider.
- attachments.
- test sends.

### Criterio de salida
E2E real: HAVONA → Communications Core → Resend → inbox real → webhook → estado persistido.

---

## Fase G — Meta WhatsApp Production Integration
### Objetivo
Completar canal WhatsApp real sin mezclarlo con la lógica de email.

### Alcance
- WABA.
- Phone Number ID.
- permanent/system user token.
- app secret.
- verify token.
- webhook.
- `messages` subscriptions.
- templates aprobadas de WhatsApp cuando aplique.
- 24h conversation window.
- delivery/read/failed.
- opt-out.

### Criterio de salida
E2E real bidireccional y auditado.

---

## Fase H — Google Calendar / Meet External Validation
### Alcance
- OAuth real.
- account/calendar selection.
- FreeBusy.
- create/update/cancel.
- Google Meet cuando corresponda.
- webhook/sync externo.
- permisos de equipo.

### Criterio de salida
Agenda real sincronizada sin acceso fuera de scope.

---

## Fase I — HAVONA Meet / Jitsi External Validation
### Alcance
- DNS `meet.havonacapitalgroup.com`.
- HTTPS.
- JWT.
- host/guest roles.
- audio/video.
- lobby si aplica.
- eventos/webhooks.
- móvil/web.
- latencia.

### Criterio de salida
Join host/guest real y seguro.

---

## Fase J — Opportunity Financial Enrichment
### Objetivo
Cerrar la limitación actual de Analytics.

### Alcance
Agregar al dominio Opportunity, previa revisión de negocio:
- monetary value/currency.
- expected close date.
- probability/classification solo si semántica real lo soporta.

Luego habilitar:
- pipeline monetario.
- weighted pipeline definido correctamente.
- aging monetario.
- forecast determinístico/scenarios.

### Criterio de salida
Analytics deja de devolver `notAvailable` para métricas monetarias cuando exista cobertura suficiente.

---

## Fase K — Enterprise Regression & Architecture Review
### Objetivo
Revisar el sistema completo antes de infraestructura final.

### Validar
- dependencias entre Cores.
- no ciclos indebidos.
- RBAC/IDOR.
- audit coverage.
- lifecycle de workers.
- queue ownership.
- retry/idempotency.
- data retention.
- env contract.
- migrations.
- seeds.
- docs.
- no fake features.
- no secrets.
- performance critical paths.

### CI
- lint.
- typecheck.
- unit.
- web.
- PostgreSQL/Redis integration.
- pgvector si aplica.
- build.
- Compose.
- Docker images.

---

## Fase L — Preproduction/VPS
### Objetivo
Desplegar el stack final en infraestructura pública controlada.

### Alcance
- Ubuntu/Docker/Caddy.
- PostgreSQL.
- Redis.
- storage provider.
- app/API/worker.
- domains/DNS.
- TLS.
- secret management.
- backups.
- health checks.
- logs/metrics.
- restart policy.
- migrations deployment.

Dominios previstos:
- `app.havonacapitalgroup.com`
- `meet.havonacapitalgroup.com`

---

## Fase M — Full External E2E & Acceptance
### Escenarios integrales
1. Prospecto → CRM → Henry.
2. Henry → Calendar → Meet.
3. Henry → Email Template → Communications → Resend.
4. Inbound reply → Communications → CRM → Automation stop.
5. WhatsApp inbound/outbound.
6. Automation → template → communication.
7. Knowledge/RAG → Henry → cited answer.
8. Training/roleplay/memory.
9. Analytics reads real operational facts.
10. Manager asks Henry for priorities and receives evidence.

### Criterio de salida
Todos los flujos críticos funcionan con proveedores reales y auditabilidad.

---

## Fase N — PR/Release Closure
Solo después de todas las fases anteriores:
- actualizar PR #4.
- revisar documentación final.
- decidir merge.
- crear release/tag según roadmap oficial.
- registrar limitaciones conocidas.
- generar runbook operativo.

## Orden recomendado
A → B → C → D → E → F/G/H/I → J → K → L → M → N.

F, G, H e I pueden avanzar parcialmente en paralelo una vez que la infraestructura de preproducción esté disponible, pero la aprobación final depende del E2E completo.
