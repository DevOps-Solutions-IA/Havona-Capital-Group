# PLAN DE FASES — HAVONA CAPITAL GROUP

> Fase 8 en construcción: Knowledge Core, RAG trazable, Training Core y memoria gobernada amplían el único Henry Core. El PR permanece Draft y no constituye release.

> Pre-cierre Fase B en construcción: Email Template Core gobierna templates, versiones, variantes,
> drafts y snapshots; Communications Core conserva la exclusividad del envío.

Todas las fases adoptan **HAVONA CAPITAL GROUP** como nombre corporativo oficial. La Home aprobada
en Fase 1 define el ADN visual que deben interpretar —sin copiar composiciones literalmente— CRM,
Henry, Agenda, Havona Meet, administración, dashboards, portal cliente, academia, mobile y módulos
futuros. Los identificadores técnicos y dominios previstos permanecen sin cambios.

## Regla

Cada fase es abierta, ejecutada, validada, cerrada y versionada antes de comenzar la siguiente.

## Flujo de ejecución de cada fase

Cada fase utiliza una rama propia `feature/fase-XX-*` y un Pull Request Draft hacia `develop`.
Puede y debe contener múltiples commits atómicos. Cada unidad lógica sigue este ciclo:

```text
Implementar
→ Probar
→ Corregir
→ Documentar
→ Commit
→ Push
→ GitHub Actions
→ Continuar
```

GitHub es la fuente oficial de control de versiones y respaldo. No se espera hasta el final de la
fase para publicar trabajo estable. El commit `release(fase-XX)` y la etiqueta correspondiente se
crean únicamente cuando todo el alcance esté aprobado.

## Entornos de validación

Durante desarrollo, el entorno oficial es `/mnt/d/havona` y la aprobación técnica se sustenta en
pruebas locales más GitHub Actions. La ausencia de VPS, Docker local productivo, DNS o SMTP
productivo no bloquea las fases normales.

Las validaciones integrales de Ubuntu 24.04, Docker en VPS, DNS, HTTPS, Caddy, SMTP, firewall,
backups, restauración, reinicios, persistencia, monitoreo y hardening se ejecutarán al llegar a
preproducción/producción.

## Fase 0 — Fundación técnica

**Estado: COMPLETADA**

La fase fue aprobada formalmente bajo el criterio vigente de desarrollo local más GitHub Actions.
El detalle de alcance, evidencia y responsabilidades diferidas se encuentra en
`docs/CIERRE_FASE_0.md`.

Entregables:

- Monorepo.
- GitHub.
- Docker.
- PostgreSQL.
- Redis.
- Next.js.
- NestJS.
- Worker.
- Autenticación.
- Roles.
- Permisos.
- Auditoría.
- Usuarios.
- Configuración.
- Health checks.
- CI.
- Documentación.

Versión: `v0.1.0`

Las comprobaciones operativas del VPS, Ubuntu 24.04 del servidor, Docker Engine del VPS, DNS,
HTTPS público, SMTP productivo, firewall, hardening, monitoreo del host, backup/restauración en la
infraestructura final y persistencia tras reinicios del VPS se ejecutarán en preproducción. No son
bloqueos ni pendientes críticos de desarrollo de esta fase.

## Fase 1 — Sitio público y captación

**Estado: COMPLETADA**

Rama: `feature/fase-01-web-captacion`

La fase construye la entrada pública real al ecosistema HAVONA CAPITAL GROUP. Incluye experiencia web
premium, captación persistente con consentimiento y trazabilidad, y consulta administrativa
inicial. El CRM completo, Henry AI, automatizaciones y canales posteriores permanecen fuera de
alcance.

La implementación y su evidencia de cierre están documentadas en
`docs/FASE_1_SITIO_CAPTACION.md` y `docs/CIERRE_FASE_1.md`. HAVONA CAPITAL GROUP aprobó la Home
como lenguaje visual maestro del ecosistema y autorizó el cierre mediante `v0.2.0`.

Entregables:

- Home.
- Servicios.
- Landing pages.
- Formularios.
- Consentimiento.
- Captación.
- Fuente del lead.
- Integración CRM inicial.
- Chat de entrada.

Versión: `v0.2.0`

## Fase 2 — CRM

**Estado: COMPLETADA — `v0.3.0`**

Rama: `feature/fase-02-crm`

El diseño funcional, dominio, matriz RBAC y límites están documentados en
`docs/FASE_2_CRM.md`. La fase reutiliza `Prospect` de Fase 1 y no adelanta Henry, Agenda ni canales
omnicanal.

Entregables:

- Prospectos.
- Clientes.
- Empresas.
- Pipeline.
- Tareas.
- Notas.
- Consultores.
- Panel consultor.
- Panel gerente.
- Historial.

Versión: `v0.3.0`

## Fase 3 — Henry web

**Estado: EN CONSTRUCCIÓN**

Rama: `feature/fase-03-henry-web`

La arquitectura, seguridad, dominio conversacional, integración CRM y límites se definen en
`docs/FASE_3_HENRY_WEB.md`. Las ampliaciones autorizadas incorporan voz web y HAVONA Calendar Core
con Google Calendar. Calendar Core es transversal a Agenda, CRM, Henry, gerentes, futuras
automatizaciones y Portal; Henry es un consumidor y no el propietario de la agenda. WhatsApp,
email conversacional y Havona Meet permanecen fuera de alcance.

Entregables:

- Chat web.
- Identificación de intención.
- Base de conocimiento.
- Calificación.
- Memoria controlada.
- Herramientas.
- Escalamiento.
- Auditoría.
- Agenda Google: OAuth, FreeBusy, citas, sincronización, UI y tools confirmables.

Versión: `v0.4.0`

## Fase 4 — Havona Meet y automatización de citas

HAVONA Meet Core se implementa como motor corporativo mediante `MeetingProvider` y Jitsi, con
reuniones vinculables a Agenda, CRM y Henry, acceso interno RBAC, invitados firmados y sala web
real. La validación Jitsi externa se ejecutará en VPS/preproducción cuando exista infraestructura
autorizada; no se simularán videollamadas durante desarrollo.

Entregables:

- Evolución de disponibilidad y citas sobre la Agenda Google entregada en Fase 3.
- Jitsi.
- Creación de salas.
- Recordatorios.
- Registro de asistencia.
- Integración CRM.

Versión: `v0.5.0`

## Fase 5 — WhatsApp y correo

**Estado: EN CONSTRUCCIÓN TÉCNICA EN PR #4**

La ampliación autorizada implementa HAVONA Communications Core como motor omnicanal corporativo,
independiente de Henry y reutilizable desde CRM, Portal, operación humana y automatizaciones
futuras. Meta WhatsApp y Resend son providers iniciales; sus validaciones externas requieren
cuentas, dominios y webhooks autorizados y se reportan separadamente de la implementación técnica.

Entregables:

- WhatsApp Business oficial.
- Correo.
- Plantillas.
- Bandeja unificada.
- Historial.
- Exclusión.
- Transferencia humana.

Versión: `v0.6.0`

## Fase 6 — Seguimientos inteligentes

**Estado: EN CONSTRUCCIÓN TÉCNICA EN PR #4**

Se implementa HAVONA Automations Core como dominio corporativo transversal con event bus, outbox,
workflows versionados, scheduler BullMQ, cadencias, suppression, approvals y acciones allowlisted.
Henry aporta razonamiento controlado; el motor conserva la decisión y ejecución determinística.

Entregables:

- Secuencias.
- Reintentos.
- Reactivación.
- Recuperación de inasistencias.
- Límites.
- Horarios.
- Pausas.
- Alertas.

Versión: `v0.7.0`

## Fase 7 — Analítica

**Estado: EN CONSTRUCCIÓN TÉCNICA EN PR #4**

La ampliación autorizada implementa HAVONA Enterprise Analytics & Commercial Intelligence Core
como capa transversal independiente de Henry para calcular hechos. Incluye catálogo semántico,
tiempo explícito, embudo, riesgo explicable, prioridades, objetivos, calidad de datos, métricas
operativas, herramientas Henry y Command Center con RBAC.

Entregables:

- Prospectos por canal.
- Respuestas.
- Citas.
- Asistencia.
- Conversión.
- Producción.
- Rendimiento de Henry.
- Rendimiento por consultor.
- Costos tecnológicos.

Versión: `v0.8.0`

## Fase 8 — Expansión

Posibles módulos:

- Portal del cliente.
- Academia.
- Telefonía.
- Aplicación móvil.
- Agentes de voz.
- Modelos predictivos.
- Distribución automática.
- Infraestructura distribuida.
