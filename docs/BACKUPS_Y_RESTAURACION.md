# Backups y restauración de PostgreSQL

## Política mínima

- Backup lógico diario en formato custom de `pg_dump`.
- Verificación inmediata con `pg_restore --list` y SHA-256.
- Retención local predeterminada de 14 días.
- Copia cifrada fuera del VPS con acceso restringido.
- Prueba de restauración mensual en una base aislada.

## Crear un backup

Con producción activa:

```bash
mkdir -p /srv/havona/backups
chmod 0700 /srv/havona/backups
docker compose --profile backup run --rm backup
ls -lh /srv/havona/backups
```

Instale `infrastructure/backups/crontab.example` en el host y supervise su código de
salida. El contenedor escribe primero `.partial`, valida el dump y solo entonces lo
publica; elimina dumps y checksums que exceden la retención.

## Restaurar

La restauración es destructiva para objetos existentes. Detenga API y worker,
conserve un backup del estado actual y seleccione explícitamente el archivo:

```bash
docker compose --profile prod stop api worker
export RESTORE_FILE=/backups/havona_YYYYMMDDTHHMMSSZ.dump
docker compose --profile backup run --rm \
  -e CONFIRM_RESTORE=RESTORE_havona \
  --entrypoint /usr/local/bin/restore-postgres \
  backup "$RESTORE_FILE"
docker compose --profile prod run --rm api pnpm --filter @havona/database db:migrate
docker compose --profile prod up -d
curl --fail https://${API_DOMAIN}/health/ready
```

El nombre de confirmación debe coincidir con `POSTGRES_DB`. Registre quién autorizó
la restauración, archivo, checksum, hora y resultado. Nunca pruebe una restauración
sobre producción.

## Copia externa

El script no selecciona proveedor. Sincronice solo dumps ya verificados hacia
almacenamiento cifrado e inmutable. Proteja por separado las claves y pruebe que la
cuenta de backup no pueda administrar la infraestructura principal.
