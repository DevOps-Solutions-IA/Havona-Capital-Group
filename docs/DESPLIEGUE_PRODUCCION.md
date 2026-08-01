# Despliegue de producción — Fase 0

## Preparación del servidor

Use Ubuntu 24.04 LTS actualizado, un usuario de despliegue sin acceso directo de
root, firewall con solo SSH, TCP 80/443 y UDP 443, y Docker Engine desde su
repositorio oficial. Los DNS de `APP_DOMAIN` y `API_DOMAIN` deben apuntar al VPS.

No publique 5432 ni 6379. Los valores predeterminados del Compose los enlazan a
`127.0.0.1`; en un host endurecido, bloquéelos además con firewall.

## Variables requeridas

Mantenga `/opt/havona-capital/.env` con permisos `0600`:

```dotenv
NODE_ENV=production
POSTGRES_DB=havona
POSTGRES_USER=havona
POSTGRES_PASSWORD=<secreto>
REDIS_PASSWORD=<secreto-de-al-menos-16-caracteres>
APP_ORIGIN=https://app.havonacapital.com
NEXT_PUBLIC_API_URL=https://api.havonacapital.com/api/v1
APP_DOMAIN=app.havonacapital.com
API_DOMAIN=api.havonacapital.com
ACME_EMAIL=operaciones@havonacapital.com
INITIAL_SUPER_ADMIN_EMAIL=<correo-operativo>
INITIAL_SUPER_ADMIN_PASSWORD=<contraseña-inicial-segura>
LOG_LEVEL=info
WORKER_CONCURRENCY=5
WORKER_QUEUE_NAME=havona-system
SMTP_HOST=<servidor-smtp>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<usuario-smtp>
SMTP_PASSWORD=<secreto-smtp>
SMTP_FROM=HAVONA CAPITAL <no-reply@havonacapital.com>
BACKUP_PATH=/srv/havona/backups
BACKUP_RETENTION_DAYS=14
```

`DATABASE_URL` se construye dentro de Compose. Rote `INITIAL_SUPER_ADMIN_PASSWORD` y retire
esa variable después del seed si la implementación del seed no la necesita para
comprobar idempotencia.

## Despliegue

```bash
cd /opt/havona-capital
git fetch --tags origin
git checkout v0.1.0
docker compose --profile prod config --quiet
docker compose --profile prod build --pull
docker compose --profile prod up -d postgres redis
docker compose --profile prod run --rm api pnpm --filter @havona/database db:migrate
docker compose --profile prod run --rm api pnpm --filter @havona/database db:seed
docker compose --profile prod up -d
docker compose --profile prod ps
curl --fail https://${API_DOMAIN}/health
curl --fail https://${API_DOMAIN}/health/ready
```

Caddy obtiene y renueva certificados TLS. El despliegue debe abortarse si migración,
seed o readiness fallan. Antes de una actualización, ejecute y verifique un backup.

## Operación

```bash
docker compose --profile prod logs --since=30m api worker web proxy
docker compose --profile prod restart worker
docker compose --profile prod pull postgres redis proxy
```

No use `docker compose down -v`: eliminaría volúmenes persistentes. La salida de
logs es estructurada y no debe contener credenciales ni tokens.

## Reversión

Una migración de base de datos no se revierte automáticamente. Ante un fallo,
mantenga los servicios detenidos, restaure el backup validado si la migración cambió
datos y despliegue la etiqueta estable anterior. Documente el incidente.
