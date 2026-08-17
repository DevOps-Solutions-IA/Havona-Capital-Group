#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: knowledge-backup.sh ABSOLUTE_STORAGE_PATH ABSOLUTE_BACKUP_DIRECTORY" >&2
  exit 64
fi

source_path=$1
backup_directory=$2
case "$source_path:$backup_directory" in
  /*:/*) ;;
  *) echo "Both paths must be absolute" >&2; exit 64 ;;
esac
[ "$source_path" != "/" ] && [ "$backup_directory" != "/" ] || {
  echo "Root paths are forbidden" >&2; exit 64;
}
[ -d "$source_path" ] || { echo "Storage path does not exist" >&2; exit 66; }
mkdir -p "$backup_directory"
umask 077
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_directory/havona-knowledge-$timestamp.tar.gz"
tar -C "$source_path" -czf "$archive" .
(cd "$backup_directory" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
echo "Knowledge binary backup created: $(basename "$archive")"
echo "Back up PostgreSQL metadata in the same maintenance window."
