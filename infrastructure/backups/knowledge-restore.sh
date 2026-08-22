#!/bin/sh
set -eu

if [ "$#" -ne 3 ] || [ "$3" != "--confirm-empty-target" ]; then
  echo "Usage: knowledge-restore.sh ABSOLUTE_ARCHIVE ABSOLUTE_EMPTY_TARGET --confirm-empty-target" >&2
  exit 64
fi

archive=$1
target=$2
case "$archive:$target" in
  /*:/*) ;;
  *) echo "Both paths must be absolute" >&2; exit 64 ;;
esac
[ "$target" != "/" ] || { echo "Root target is forbidden" >&2; exit 64; }
[ -f "$archive" ] && [ -f "$archive.sha256" ] || {
  echo "Archive or checksum is missing" >&2; exit 66;
}
expected=$(awk 'NR == 1 { print $1 }' "$archive.sha256")
case "$expected" in
  *[!0-9a-fA-F]*|'') echo "Invalid archive checksum" >&2; exit 65 ;;
esac
actual=$(sha256sum "$archive" | awk '{ print $1 }')
[ "$actual" = "$expected" ] || { echo "Archive checksum mismatch" >&2; exit 65; }
mkdir -p "$target"
[ -z "$(find "$target" -mindepth 1 -maxdepth 1 -print -quit)" ] || {
  echo "Restore target must be empty" >&2; exit 65;
}
if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Unsafe archive path detected" >&2
  exit 65
fi
umask 077
tar -C "$target" -xzf "$archive"
echo "Knowledge binaries restored. Restore matching PostgreSQL metadata before enabling ingestion."
