#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s /backups/file.dump\n' "$0" >&2
  exit 64
fi
: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

backup="$1"
test -r "$backup"
test -r "${backup}.sha256"
sha256sum -c "${backup}.sha256"
pg_restore --list "$backup" >/dev/null

if [ "${CONFIRM_RESTORE:-}" != "RESTORE_${POSTGRES_DB}" ]; then
  printf 'Set CONFIRM_RESTORE=RESTORE_%s to confirm destructive restore.\n' "$POSTGRES_DB" >&2
  exit 65
fi

pg_restore --host "$POSTGRES_HOST" --port "${POSTGRES_PORT:-5432}" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-acl --exit-on-error "$backup"
printf 'Restore completed from %s\n' "$backup"
