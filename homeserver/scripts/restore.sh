#!/usr/bin/env bash
# Restore a database from a backup made by backup.sh. The file name decides
# which database it goes back into:
#   fc-outreach-YYYYMMDD-HHMMSS.sql.gz        → the outreach database
#   project-<slug>-YYYYMMDD-HHMMSS.sql.gz     → that project's database
# Takes a safety backup of the target first.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

: "${DATABASE_URL:?DATABASE_URL not set}"
FILE="${1:?usage: restore.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="$(basename "$FILE")"

if [[ "$NAME" =~ ^project-(.+)-[0-9]{8}-[0-9]{6}(-final)?\.sql\.gz$ ]]; then
  SLUG="${BASH_REMATCH[1]}"
  TARGET="$(project_dbs | awk -v s="$SLUG" '$1 == s { print $2 }')"
  [ -n "$TARGET" ] || { echo "project '$SLUG' has no database any more — create it again first" >&2; exit 1; }
  echo "safety backup of project $SLUG…"
  BACKUP_KEEP=1000 "$HERE/backup.sh" project "$SLUG"
else
  TARGET="$DATABASE_URL"
  echo "safety backup of the outreach database…"
  BACKUP_KEEP=1000 "$HERE/backup.sh" outreach
  sudo -n systemctl stop fc-outreach-app fc-outreach-worker 2>/dev/null || true
  trap 'sudo -n systemctl start fc-outreach-app fc-outreach-worker 2>/dev/null || true' EXIT
fi

echo "restoring $NAME…"
gunzip -c "$FILE" | psql -v ON_ERROR_STOP=1 --quiet "$TARGET" > /dev/null
echo "restore complete"
