#!/usr/bin/env bash
# Dump the outreach database to $STORAGE_DIR/backups/<timestamp>.sql.gz and
# prune backups beyond $BACKUP_KEEP (default 14). Run nightly by the
# fc-outreach-backup.timer, or on demand from the control panel.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

: "${DATABASE_URL:?DATABASE_URL not set}"
DIR="${STORAGE_DIR:-/srv/fc-outreach/storage}/backups"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$DIR"

OUT="$DIR/fc-outreach-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --no-acl --clean --if-exists "$DATABASE_URL" | gzip -9 > "$OUT.part"
mv "$OUT.part" "$OUT"
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# keep the newest $KEEP
ls -1t "$DIR"/fc-outreach-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
