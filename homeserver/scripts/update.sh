#!/usr/bin/env bash
# Pull the latest code from GitHub, reinstall deps, rebuild the dashboard,
# re-apply the (idempotent) schema and restart the services.
# Run from the control panel ("Update from GitHub") or by hand.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"

BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
echo "→ git pull ($BRANCH)"
git fetch --quiet origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"
git log -1 --format='  now at %h %s'

echo "→ npm ci"
npm ci --no-audit --no-fund --loglevel=error

echo "→ build dashboard"
npm run --silent build:ops > /dev/null

echo "→ apply schema"
PGOPTIONS="-c client_min_messages=warning" psql -v ON_ERROR_STOP=1 --quiet "$DATABASE_URL" -f api/outreach/_lib/schema.sql > /dev/null

echo "→ restart services"
sudo -n systemctl restart fc-outreach-app fc-outreach-worker
echo "done — the panel restarts itself next"
sudo -n systemctl restart --no-block fc-panel
