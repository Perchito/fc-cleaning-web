#!/usr/bin/env bash
# Restore the outreach database from a backup made by backup.sh.
#   restore.sh /srv/fc-outreach/storage/backups/fc-outreach-YYYYMMDD-HHMMSS.sql.gz
# Takes a safety backup first, stops the app while restoring, then restarts it.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

: "${DATABASE_URL:?DATABASE_URL not set}"
FILE="${1:?usage: restore.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "safety backup of current data…"
BACKUP_KEEP=1000 "$HERE/backup.sh"

sudo -n systemctl stop fc-outreach-app fc-outreach-worker 2>/dev/null || true
trap 'sudo -n systemctl start fc-outreach-app fc-outreach-worker 2>/dev/null || true' EXIT

echo "restoring $FILE…"
gunzip -c "$FILE" | psql -v ON_ERROR_STOP=1 --quiet "$DATABASE_URL" > /dev/null
echo "restore complete"
