#!/usr/bin/env bash
# One-time move of the live data from Neon (Vercel) into the local database.
#   import-from-neon.sh 'postgresql://user:pass@ep-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require'
# Use the Neon *direct* (non-pooled) connection string. Local data is backed up
# first, then replaced with Neon's.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

: "${DATABASE_URL:?DATABASE_URL not set}"
SRC="${1:-${NEON_URL:-}}"
[ -n "$SRC" ] || { echo "usage: import-from-neon.sh <neon connection string>" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "backing up local data first…"
BACKUP_KEEP=1000 "$HERE/backup.sh" outreach

sudo -n systemctl stop fc-outreach-app fc-outreach-worker 2>/dev/null || true
trap 'sudo -n systemctl start fc-outreach-app fc-outreach-worker 2>/dev/null || true' EXIT

echo "copying Neon → local…"
pg_dump --no-owner --no-acl --clean --if-exists --schema=public "$SRC" \
  | psql -v ON_ERROR_STOP=1 --quiet "$DATABASE_URL" > /dev/null
psql -At "$DATABASE_URL" -c "select 'prospects: ' || count(*) from prospects"
echo "import complete"
