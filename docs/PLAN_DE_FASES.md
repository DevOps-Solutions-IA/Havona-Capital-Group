# PLAN DE FASES — HAVONA CAPITAL

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

Entregables:

- Chat web.
- Identificación de intención.
- Base de conocimiento.
- Calificación.
- Memoria controlada.
- Herramientas.
- Escalamiento.
- Auditoría.

Versión: `v0.4.0`

## Fase 4 — Agenda y Havona Meet

Entregables:

- Disponibilidad.
- Citas.
- Reagendamiento.
- Cancelación.
- Jitsi.
- Creación de salas.
- Recordatorios.
- Registro de asistencia.
- Integración CRM.

Versión: `v0.5.0`

## Fase 5 — WhatsApp y correo

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
