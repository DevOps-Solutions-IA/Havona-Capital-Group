# Instalación y desarrollo — Fase 0

## Requisitos

- Ubuntu 24.04 LTS, macOS o WSL2.
- Node.js 22 LTS y Corepack.
- Docker Engine 27+ con Compose v2.
- Git y `pnpm` (activado con `corepack enable`).

## Variables locales

Cree `.env` en la raíz a partir de la siguiente lista. El archivo está excluido de
Git y nunca debe compartirse. Use valores aleatorios reales, no los ejemplos:

```dotenv
NODE_ENV=development
POSTGRES_DB=havona
POSTGRES_USER=havona
POSTGRES_PASSWORD=<aleatorio-largo>
REDIS_PASSWORD=<aleatorio-de-al-menos-16-caracteres>
DATABASE_URL=postgresql://havona:<url-encoded-password>@localhost:5432/havona?schema=public
APP_ORIGIN=http://localhost:3000
COOKIE_DOMAIN=
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SITE_URL=http://localhost:3000
INITIAL_SUPER_ADMIN_EMAIL=<correo-operativo>
INITIAL_SUPER_ADMIN_PASSWORD=<contraseña-inicial-segura>
LOG_LEVEL=debug
WORKER_CONCURRENCY=5
WORKER_QUEUE_NAME=havona-system
SMTP_FROM=HAVONA CAPITAL <no-reply@localhost>
```

Genere secretos con `openssl rand -base64 48`. Si un secreto contiene caracteres
reservados, codifíquelo para `DATABASE_URL`.

## Desarrollo nativo

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose --profile dev up -d postgres redis
pnpm --filter @havona/database db:migrate
pnpm --filter @havona/database db:seed
pnpm dev
```

El seed es idempotente y puede ejecutarse nuevamente. Cambie la contraseña inicial
del `SUPER_ADMIN` tras el primer acceso.

`NEXT_PUBLIC_SITE_URL` define las URL canónicas, sitemap y JSON-LD del sitio público. Use el
origen público real en cada entorno; no incluya una ruta ni una barra final.

## Desarrollo completamente en Docker

```bash
docker compose --profile dev build
docker compose --profile dev up -d
docker compose --profile dev exec api-dev pnpm --filter @havona/database db:migrate
docker compose --profile dev exec api-dev pnpm --filter @havona/database db:seed
docker compose --profile dev ps
```

Web queda en `http://localhost:3000`, API en `http://localhost:3001`, y PostgreSQL y
Redis solo se publican en loopback. Revise logs con:

```bash
docker compose --profile dev logs -f api-dev web-dev worker-dev
```

## Calidad

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

No continúe si cualquiera de estos comandos falla.
