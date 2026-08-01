# Cierre de Fase 1 — Sitio público y captación

## Estado

**FASE 1 — COMPLETADA**

Versión: `v0.2.0`

HAVONA CAPITAL GROUP aprobó formalmente la Fase 1 el 1 de agosto de 2026 con base en la validación
del entorno local oficial, la revisión visual y los controles reproducibles de GitHub Actions.
No existen bloqueos críticos dentro del alcance aprobado.

## Alcance entregado

- Home premium y responsive con navegación real.
- Lenguaje visual maestro editorial, patrimonial y tecnológico para todo el ecosistema.
- Nueve landings funcionales y trazabilidad de origen.
- Captación real mediante `Prospect`, `LeadSource`, `Consent` y `LeadEvent`.
- Consentimiento explícito, deduplicación razonable e idempotencia por `submissionId`.
- Recuperación acotada ante fallos de red.
- Administración inicial de prospectos con búsqueda, filtros, detalle e historial.
- Integración visual inicial de Henry como punto de entrada de captación, sin simular IA completa.
- Metadata, canonical, OpenGraph, Twitter cards, JSON-LD, sitemap y robots.
- Accesibilidad por teclado, foco, labels, errores asociados y reducción de movimiento.
- Seguridad mediante validación, sanitización, rate limiting, sesiones, CSRF, RBAC y auditoría.
- Identidad institucional completa de HAVONA CAPITAL GROUP.

## Evidencia técnica

GitHub Actions aprobó para el HEAD previo al release:

- Instalación reproducible con lockfile.
- Lint y typecheck del monorepo.
- Pruebas unitarias e integración.
- Builds de producción.
- Generación y validación de Prisma.
- Migraciones sobre PostgreSQL real.
- Seed ejecutado dos veces de forma idempotente.
- Integración API con PostgreSQL y Redis.
- Validación de Docker Compose y construcción de imágenes Docker.

El commit formal de release debe superar nuevamente esta misma matriz antes de crear `v0.2.0`.

## Evidencia visual

La Home se revisó a 1440, 1024, 768, 390 y 360 píxeles. La dirección aprobada incorpora navegación
flotante, tipografía editorial, geometría original, espacios negativos, motion sobrio, exploración
interactiva de soluciones, storytelling patrimonial e integración estratégica de Henry. Esta Home
es la referencia visual maestra descrita en `docs/DIRECTRIZ_VISUAL_FUNCIONAL.md`.

## Continuidad

El CRM completo corresponde a Fase 2. Henry AI completo, WhatsApp, automatizaciones omnicanal,
Havona Meet, telefonía, portal cliente, academia e IA predictiva permanecen fuera del alcance de
esta versión.
