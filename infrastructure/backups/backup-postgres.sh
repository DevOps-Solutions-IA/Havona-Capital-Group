#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
umask 077
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$BACKUP_DIR/${POSTGRES_DB}_${timestamp}.dump"
temporary="${destination}.partial"

pg_dump --host "$POSTGRES_HOST" --port "${POSTGRES_PORT:-5432}" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --format custom --compress 9 --no-owner --no-acl --file "$temporary"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$destination"
sha256sum "$destination" >"${destination}.sha256"
find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.sha256' \) \
  -mtime "+$RETENTION_DAYS" -delete
printf 'Backup verified: %s\n' "$destination"
