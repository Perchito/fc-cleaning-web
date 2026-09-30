#!/usr/bin/env bash
# Dump databases to $STORAGE_DIR/backups/ as gzipped SQL, keeping the newest
# $BACKUP_KEEP (default 14) of each. Run nightly by fc-outreach-backup.timer,
# or on demand from the control panel.
#   backup.sh                   outreach + wedding-gallery + docuseal + every project db
#   backup.sh outreach          only the outreach database
#   backup.sh wedding-gallery   only the self-hosted Supabase stack's db
#   backup.sh docuseal          only DocuSeal's /data (SQLite + attachments)
#   backup.sh invoice-builder   only invoice-builder's /data (SQLite)
#   backup.sh frappe-hr         only Frappe HR (bench backup: db + files)
#   backup.sh config            compose files, patches, .env secrets, tunnel config
#   backup.sh project <slug>    only that project's database (fc-crm, etc.)
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

: "${DATABASE_URL:?DATABASE_URL not set}"
DIR="${STORAGE_DIR:-/srv/fc-outreach/storage}/backups"
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"

rotate() { # <file prefix> [extension]
  find "$DIR" -maxdepth 1 -name "$1-[0-9]*-[0-9]*${2:-.sql.gz}" -printf '%f\n' | sort -r | tail -n +"$((KEEP + 1))" \
    | while read -r f; do rm -f -- "$DIR/$f"; done
}

dump() { # <url> <file prefix>
  local out="$DIR/$2-$STAMP.sql.gz"
  pg_dump --no-owner --no-acl --clean --if-exists "$1" | gzip -9 > "$out.part" || { rm -f "$out.part"; return 1; }
  mv "$out.part" "$out"
  echo "backup written: $out ($(du -h "$out" | cut -f1))"
  rotate "$2"
}

# The self-hosted Supabase stack (wedding-gallery-platform) runs its own
# Postgres inside Docker — a different instance from everything else here,
# so it needs `docker exec pg_dump` instead of a plain connection string.
dump_docker() { # <container> <db user> <db name> <file prefix>
  local out="$DIR/$4-$STAMP.sql.gz"
  docker exec "$1" pg_dump --no-owner --no-acl --clean --if-exists -U "$2" "$3" | gzip -9 > "$out.part" \
    || { rm -f "$out.part"; return 1; }
  mv "$out.part" "$out"
  echo "backup written: $out ($(du -h "$out" | cut -f1))"
  rotate "$4"
}

# DocuSeal (sign.fccleaningcompany.com) keeps everything — SQLite db,
# signed PDFs, and docuseal.env (SECRET_KEY_BASE, needed to decrypt it) —
# under /data in its container, owned by the container's users, so tar it
# from inside as root rather than reading the bind mount from here.
# ponytail: tars the live SQLite (WAL); fine at 3am with ~no writes, switch
# to an sqlite .backup first if it ever gets busy overnight.
dump_docuseal() {
  local out="$DIR/docuseal-$STAMP.tar.gz"
  docker exec docuseal-docuseal-1 tar -czf - -C /data . > "$out.part" || { rm -f "$out.part"; return 1; }
  mv "$out.part" "$out"
  echo "backup written: $out ($(du -h "$out" | cut -f1))"
  rotate docuseal .tar.gz
}

# ponytail: tar of a live SQLite file (no sqlite3 in the image); fine at 07:15 when nobody is invoicing
dump_invoice() {
  local out="$DIR/invoice-builder-$STAMP.tar.gz"
  docker exec invoice-builder tar -czf - -C /data . > "$out.part" || { rm -f "$out.part"; return 1; }
  mv "$out.part" "$out"
  echo "backup written: $out ($(du -h "$out" | cut -f1))"
  rotate invoice-builder .tar.gz
}
# Frappe's own backup (db + uploaded files), restorable with `bench restore`.
dump_frappe_hr() {
  local c=frappe-hr-backend-1 tmp=/tmp/nightly-backup out="$DIR/frappe-hr-$STAMP.tar"
  docker exec "$c" sh -c "rm -rf $tmp && bench --site hr.fccleaningcompany.com backup --with-files --backup-path $tmp >/dev/null" || return 1
  docker exec "$c" tar -cf - -C "$tmp" . > "$out.part" || { rm -f "$out.part"; return 1; }
  docker exec "$c" rm -rf "$tmp"
  mv "$out.part" "$out"
  echo "backup written: $out ($(du -h "$out" | cut -f1))"
  rotate frappe-hr .tar
}
# Compose files, local patches and .env secrets for the docker apps, plus the
# tunnel/project config: what's needed to rebuild the box, not app data.
dump_config() {
  local out="$DIR/config-$STAMP.tar.gz"
  tar -czf "$out.part" --ignore-failed-read --exclude='*.bak*' --exclude=docuseal/data -C / \
    home/perchito/invoice-builder home/perchito/docuseal home/perchito/frappe-hr \
    home/perchito/fc-crm/.env home/perchito/supabase-selfhost/docker/.env \
    home/perchito/wedding-gallery-platform/.env.production.local \
    home/perchito/.cloudflared etc/fc-outreach etc/cloudflared/config.yml 2>/dev/null || { rm -f "$out.part"; return 1; }
  mv "$out.part" "$out"
  echo "backup written: $out ($(du -h "$out" | cut -f1))"
  rotate config .tar.gz
}

# Each backup is independent: one failing (e.g. a stopped container) must not
# skip the rest. The script still exits non-zero so the failure shows in systemd.
failed=0
try() { "$@" || { echo "backup FAILED: $*" >&2; failed=1; }; }
running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]; }

target="${1:-all}"
if [ "$target" = all ] || [ "$target" = outreach ]; then
  try dump "$DATABASE_URL" fc-outreach
fi
if [ "$target" = wedding-gallery ] || { [ "$target" = all ] && running supabase-db; }; then
  try dump_docker supabase-db postgres postgres wedding-gallery
elif [ "$target" = all ]; then
  echo "skipped wedding-gallery: supabase-db not running"
fi
if [ "$target" = all ] || [ "$target" = docuseal ]; then
  try dump_docuseal
fi
if [ "$target" = all ] || [ "$target" = invoice-builder ]; then
  try dump_invoice
fi
if [ "$target" = all ] || [ "$target" = frappe-hr ]; then
  try dump_frappe_hr
fi
if [ "$target" = all ] || [ "$target" = config ]; then
  try dump_config
fi
if [ "$target" = all ] || [ "$target" = project ]; then
  while read -r slug url; do
    [ -n "$slug" ] || continue
    if [ "$target" = project ] && [ "$slug" != "${2:-}" ]; then continue; fi
    try dump "$url" "project-$slug"
  done < <(project_dbs)
fi
exit "$failed"
