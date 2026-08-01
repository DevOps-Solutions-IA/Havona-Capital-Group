# HAVONA CAPITAL GROUP

Fundación técnica de la plataforma empresarial HAVONA CAPITAL GROUP. Este repositorio es un monorepo
TypeScript con Next.js, NestJS, PostgreSQL, Prisma, Redis y BullMQ, desplegable mediante Docker
Compose y Caddy.

El nombre corporativo oficial de la plataforma y del ecosistema es **HAVONA CAPITAL GROUP**.
Identificadores técnicos históricos como `@havona/*`, `havona-capital` y los dominios previstos se
conservan deliberadamente y no representan una denominación institucional alternativa.

La Fase 0 implementa autenticación por sesiones, recuperación de contraseña, RBAC, administración
de usuarios, configuración, auditoría, health checks, worker de correo, backups y CI. Henry AI,
CRM, Jitsi y WhatsApp permanecen fuera de esta fase.

## Estado del proyecto

**Fase 0 — COMPLETADA (`v0.1.0`)**

**Fase 1 — COMPLETADA (`v0.2.0`)**

La fundación técnica fue aprobada con evidencia del entorno local oficial y GitHub Actions. Las
validaciones de infraestructura final (VPS, DNS, HTTPS público, SMTP productivo, firewall,
hardening, monitoreo, backup/restauración y persistencia del servidor) pertenecen a
preproducción/producción y no constituyen pendientes críticos de desarrollo de la Fase 0.

Consulte el [acta de cierre de la Fase 0](docs/CIERRE_FASE_0.md) para conocer el alcance validado,
la evidencia de CI y las tareas diferidas.

La Fase 1 incorpora el sitio público, nueve landings, captación persistente con consentimiento y
una bandeja administrativa inicial. Su [documentación técnica](docs/FASE_1_SITIO_CAPTACION.md) y
[acta de cierre](docs/CIERRE_FASE_1.md) registran endpoints, datos, trazabilidad, pruebas, identidad
corporativa y aprobación del lenguaje visual maestro.

## Requisitos

- Node.js 22 LTS y Corepack.
- Docker Engine con Compose v2.
- Git.

## Inicio rápido

```bash
cp .env.example .env
# Sustituya todos los valores de ejemplo antes de continuar.
corepack enable
pnpm install --frozen-lockfile
docker compose --profile dev up -d postgres redis
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Web: `http://localhost:3000`. API: `http://localhost:3001/api/v1`. Health checks públicos:
`http://localhost:3001/health` y `http://localhost:3001/health/ready`.

## Calidad

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

## Documentación operativa

- [Instalación y desarrollo](docs/INSTALACION_Y_DESARROLLO.md)
- [Despliegue de producción](docs/DESPLIEGUE_PRODUCCION.md)
- [Backups y restauración](docs/BACKUPS_Y_RESTAURACION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Arquitectura técnica](docs/ARQUITECTURA_TECNICA.md)
- [Reglas de desarrollo](docs/REGLAS_DE_DESARROLLO.md)

Nunca confirme `.env`, credenciales, tokens ni dumps de producción. No avance a una fase posterior
sin cerrar y aprobar la fase vigente.
