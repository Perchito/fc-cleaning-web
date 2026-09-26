#!/usr/bin/env bash
# FC Home Server — one-shot setup for Ubuntu 22.04 / 24.04.
#
#   git clone https://github.com/Perchito/fc-cleaning-web.git ~/fc-cleaning-web
#   cd ~/fc-cleaning-web && sudo bash homeserver/install.sh
#
# Installs and wires up, all on this machine:
#   - Node.js 22 (if missing) and PostgreSQL 17 (if missing)
#   - database `fc_outreach` + schema (api/outreach/_lib/schema.sql)
#   - storage at /srv/fc-outreach/storage (files/ + backups/ + projects/)
#   - systemd services: fc-outreach-app (dashboard + API, :4517),
#     fc-outreach-worker (AI via Claude Code), fc-panel (control panel, :8090),
#     fc-storage (storage API for project buckets, :9100),
#     fc-outreach-backup.timer (nightly pg_dump of every database)
#   - a Postgres admin role the panel uses to create a database per project
#   - /etc/fc-outreach/outreach.env with generated passwords/secrets
# Safe to re-run: existing database, env file and data are kept.
#
# Options:  --user NAME   run services as NAME (default: the user who ran sudo)
#           --tailscale   also install Tailscale for private remote access
#           --db-network  let project databases accept connections from your
#                         LAN / Tailscale (password auth, project roles only)
set -euo pipefail

APP_USER="${SUDO_USER:-}"
WITH_TAILSCALE=0
DB_NETWORK_FLAG=0
while [ $# -gt 0 ]; do
  case "$1" in
    --user) APP_USER="$2"; shift 2 ;;
    --tailscale) WITH_TAILSCALE=1; shift ;;
    --db-network) DB_NETWORK_FLAG=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash homeserver/install.sh" >&2; exit 1; }
[ -n "$APP_USER" ] && [ "$APP_USER" != root ] || { echo "Run via sudo from your normal account, or pass --user NAME" >&2; exit 1; }
id "$APP_USER" >/dev/null 2>&1 || { echo "no such user: $APP_USER" >&2; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
ETC=/etc/fc-outreach
ENV_FILE="$ETC/outreach.env"
STORAGE=/srv/fc-outreach/storage
DB_NAME=fc_outreach
DB_USER=fc_outreach
as_user() { sudo -u "$APP_USER" -H "$@"; }
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
rand() { openssl rand -hex "${1:-24}"; }

step "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg openssl gzip >/dev/null

step "Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "node $(node -v)"

step "PostgreSQL"
if ! command -v pg_dump >/dev/null || ! systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
  apt-get install -y -qq postgresql-common >/dev/null
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  apt-get install -y -qq postgresql-17 >/dev/null
fi
systemctl enable --now postgresql >/dev/null
echo "$(psql --version)"

step "Environment file ($ENV_FILE)"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$ETC"
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS="$(rand 18)"
  OPS_PASS="$(rand 9)"
  PANEL_PASS="$(rand 9)"
  cat > "$ENV_FILE" <<EOF
# FC Home Server — environment for the outreach app, AI worker and control panel.
# Edit here or in the control panel (Settings). Restart the services after changes.

# ── database (local PostgreSQL) ──
DB_DRIVER=pg
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME

# ── outreach dashboard login (/ops, HTTP Basic auth) ──
OPS_USER=fc
OPS_PASS=$OPS_PASS

# ── control panel ──
PANEL_PASS=$PANEL_PASS
PANEL_PORT=8090
# Public URL of the dashboard if you expose it (e.g. via Cloudflare Tunnel); used for the panel's "Open" button.
OPS_PUBLIC_URL=

# ── app server ──
PORT=4517
DAILY_AT=08:00
DAILY_TZ=Europe/London
DAILY_JOBS=cron,discover
CRON_SECRET=$(rand 24)

# ── storage (files + database backups) ──
STORAGE_DIR=$STORAGE
BACKUP_KEEP=14

# ── iCloud mail (Apple ID + app-specific password) ──
ICLOUD_SMTP_USER=
ICLOUD_SMTP_PASS=
DIGEST_TO=

# ── AI (off until you turn it on) ──
OUTREACH_AI=off
AI_BACKEND=worker
WORKER_SECRET=$(rand 24)
SITE_URL=http://127.0.0.1:4517
ANTHROPIC_API_KEY=
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "created with fresh passwords"
else
  echo "kept existing file"
fi
# settings added after the first release — appended to older env files on re-run
ensure_env() { grep -q "^$1=" "$ENV_FILE" || echo "$1=$2" >> "$ENV_FILE"; }
ensure_env PG_ADMIN_URL "postgresql://fc_admin:$(rand 18)@127.0.0.1:5432/postgres"
ensure_env PROJECTS_FILE "$ETC/projects.json"
ensure_env STORAGE_API_PORT 9100
ensure_env STORAGE_PUBLIC_URL ""
ensure_env STORAGE_MAX_UPLOAD_MB 5120
ensure_env DB_NETWORK off
ensure_env DB_PUBLIC_HOST ""
if [ "$DB_NETWORK_FLAG" = 1 ]; then sed -i 's/^DB_NETWORK=.*/DB_NETWORK=on/' "$ENV_FILE"; fi
. "$REPO/homeserver/scripts/lib.sh"
ENV_FILE="$ENV_FILE" load_env

step "Database"
DB_PASS_FROM_URL="$(node -e 'console.log(decodeURIComponent(new URL(process.argv[1]).password))' "$DATABASE_URL")"
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql -qc "create role $DB_USER login"
fi
# keep the role's password in sync with DATABASE_URL (covers a re-created env file)
sudo -u postgres psql -qc "alter role $DB_USER with login password '${DB_PASS_FROM_URL//\'/\'\'}'"
if ! sudo -u postgres psql -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi
PGOPTIONS="-c client_min_messages=warning" psql -v ON_ERROR_STOP=1 -q "$DATABASE_URL" -f "$REPO/api/outreach/_lib/schema.sql" >/dev/null
sudo -u postgres psql -qc "revoke all on database $DB_NAME from public"
echo "database $DB_NAME ready ($(psql -tAc "select count(*) from information_schema.tables where table_schema='public'" "$DATABASE_URL") tables)"

step "Project databases (admin role)"
# fc_admin creates/drops a role + database per project from the panel. It is not
# a superuser; hs_projects groups the project roles so pg_hba can allow only them
# over the network.
ADMIN_PASS="$(node -e 'console.log(decodeURIComponent(new URL(process.argv[1]).password))' "$PG_ADMIN_URL")"
sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'fc_admin') then create role fc_admin login createdb createrole; end if;
  if not exists (select 1 from pg_roles where rolname = 'hs_projects') then create role hs_projects nologin; end if;
end \$\$;
alter role fc_admin with login createdb createrole password '${ADMIN_PASS//\'/\'\'}';
grant hs_projects to fc_admin with admin option;
SQL
[ -f "$PROJECTS_FILE" ] || { echo '{ "projects": {} }' > "$PROJECTS_FILE"; }
chown "$APP_USER:$APP_USER" "$PROJECTS_FILE"; chmod 600 "$PROJECTS_FILE"
echo "ok"

if [ "$DB_NETWORK" = on ]; then
  step "Database network access (LAN + Tailscale)"
  HBA="$(sudo -u postgres psql -tAc 'show hba_file')"
  if ! grep -q "fc-homeserver" "$HBA"; then
    cat >> "$HBA" <<HBAEOF
# fc-homeserver: project databases from LAN / Tailscale (project roles only).
# fc_admin manages the project roles, which makes it an indirect member of
# hs_projects — reject it explicitly so it stays local-only.
host  all  fc_admin      0.0.0.0/0       reject
host  all  fc_admin      ::/0            reject
host  all  +hs_projects  10.0.0.0/8      scram-sha-256
host  all  +hs_projects  172.16.0.0/12   scram-sha-256
host  all  +hs_projects  192.168.0.0/16  scram-sha-256
host  all  +hs_projects  100.64.0.0/10   scram-sha-256
HBAEOF
  fi
  sudo -u postgres psql -qc "alter system set listen_addresses = '*'"
  systemctl restart postgresql
  echo "project databases reachable on port 5432 from private networks"
fi

step "Storage ($STORAGE)"
install -d -m 750 -o "$APP_USER" -g "$APP_USER" /srv/fc-outreach "$STORAGE" "$STORAGE/files" "$STORAGE/backups" "$STORAGE/projects"
echo "ok"

step "App dependencies + dashboard build"
chown -R "$APP_USER:$APP_USER" "$REPO"
as_user bash -c "cd '$REPO' && npm ci --no-audit --no-fund --loglevel=error && npm run --silent build:ops >/dev/null"
chmod +x "$REPO"/homeserver/scripts/*.sh
echo "built dist/ops"

step "systemd services"
NODE_BIN="$(command -v node)"
USER_PATH="$APP_HOME/.local/bin:$APP_HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"

cat > /etc/systemd/system/fc-outreach-app.service <<EOF
[Unit]
Description=FC Outreach app (dashboard + API + daily jobs)
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
User=$APP_USER
WorkingDirectory=$REPO
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $REPO/homeserver/app-server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fc-outreach-worker.service <<EOF
[Unit]
Description=FC Outreach AI worker (headless Claude Code)
After=fc-outreach-app.service
Wants=fc-outreach-app.service

[Service]
User=$APP_USER
WorkingDirectory=$REPO
EnvironmentFile=$ENV_FILE
Environment=PATH=$USER_PATH
ExecStart=$NODE_BIN $REPO/worker/outreach-worker.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fc-panel.service <<EOF
[Unit]
Description=FC Home Server control panel
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
SupplementaryGroups=systemd-journal
WorkingDirectory=$REPO
EnvironmentFile=$ENV_FILE
Environment=PATH=$USER_PATH
ExecStart=$NODE_BIN $REPO/homeserver/panel/server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fc-storage.service <<EOF
[Unit]
Description=Home Server storage API (project buckets)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$REPO
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $REPO/homeserver/storage-api/server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fc-outreach-backup.service <<EOF
[Unit]
Description=FC Outreach database backup
After=postgresql.service

[Service]
Type=oneshot
User=$APP_USER
ExecStart=$REPO/homeserver/scripts/backup.sh
EOF

cat > /etc/systemd/system/fc-outreach-backup.timer <<EOF
[Unit]
Description=Nightly FC Outreach database backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

step "Permissions for the control panel"
SYSTEMCTL="$(command -v systemctl)"
{
  echo "# Lets the FC control panel (running as $APP_USER) manage its own services only."
  for u in fc-outreach-app fc-outreach-worker fc-panel fc-storage postgresql fc-outreach-backup.timer cloudflared tailscaled; do
    for a in start stop restart enable disable; do
      echo "$APP_USER ALL=(root) NOPASSWD: $SYSTEMCTL $a $u"
    done
  done
  echo "$APP_USER ALL=(root) NOPASSWD: $SYSTEMCTL stop fc-outreach-app fc-outreach-worker"
  echo "$APP_USER ALL=(root) NOPASSWD: $SYSTEMCTL start fc-outreach-app fc-outreach-worker"
  echo "$APP_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart fc-outreach-app fc-outreach-worker"
  echo "$APP_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart --no-block fc-panel"
} > /etc/sudoers.d/fc-outreach.tmp
chmod 440 /etc/sudoers.d/fc-outreach.tmp
visudo -cf /etc/sudoers.d/fc-outreach.tmp >/dev/null
mv /etc/sudoers.d/fc-outreach.tmp /etc/sudoers.d/fc-outreach
echo "ok"

systemctl daemon-reload
systemctl enable --now fc-outreach-app fc-panel fc-storage fc-outreach-backup.timer >/dev/null
systemctl enable fc-outreach-worker >/dev/null
systemctl restart fc-outreach-app fc-panel fc-storage
if as_user env PATH="$USER_PATH" bash -c 'command -v claude' >/dev/null; then
  systemctl restart fc-outreach-worker
  WORKER_NOTE="running"
else
  WORKER_NOTE="not started — install Claude Code + 'claude login' as $APP_USER, then start it from the panel"
fi

if [ "$WITH_TAILSCALE" = 1 ] && ! command -v tailscale >/dev/null; then
  step "Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
  echo "run: sudo tailscale up"
fi

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  UFW_NOTE="ufw is active — allow LAN access with: sudo ufw allow from 192.168.0.0/16 to any port 4517,8090,9100,5432 proto tcp"
fi

IP="$(hostname -I | awk '{print $1}')"
sleep 2
cat <<EOF

────────────────────────────────────────────────────────────
  FC Home Server is set up.

  Control panel    http://$IP:$PANEL_PORT
                   password: $PANEL_PASS
  Outreach (/ops)  http://$IP:$PORT/ops
                   user: $OPS_USER   password: $OPS_PASS
  AI worker        $WORKER_NOTE
  Storage API      http://$IP:$STORAGE_API_PORT/v1/<project>/…
  Project DBs      $([ "$DB_NETWORK" = on ] && echo "$IP:5432 (LAN / Tailscale)" || echo "this machine only (re-run with --db-network to open to your LAN)")

  Settings file    $ENV_FILE   (also editable in the panel)
  Storage          $STORAGE
  ${UFW_NOTE:-}

  Next: open the panel → Settings → fill in ICLOUD_SMTP_USER / ICLOUD_SMTP_PASS,
  then Database → "Move data from Neon" to bring your existing prospects over.
  For your other repos: Projects → New project (a database + storage bucket each).
────────────────────────────────────────────────────────────
EOF
