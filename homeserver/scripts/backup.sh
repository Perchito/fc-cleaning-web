#!/usr/bin/env bash
# Dump databases to $STORAGE_DIR/backups/ as gzipped SQL, keeping the newest
# $BACKUP_KEEP (default 14) of each. Run nightly by fc-outreach-backup.timer,
# or on demand from the control panel.
#   backup.sh                   outreach + wedding-gallery + every project db
#   backup.sh outreach          only the outreach database
#   backup.sh wedding-gallery   only the self-hosted Supabase stack's db
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

rotate() { # <file prefix>
  find "$DIR" -maxdepth 1 -name "$1-[0-9]*-[0-9]*.sql.gz" -printf '%f\n' | sort -r | tail -n +"$((KEEP + 1))" \
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

target="${1:-all}"
if [ "$target" = all ] || [ "$target" = outreach ]; then
  dump "$DATABASE_URL" fc-outreach
fi
if [ "$target" = all ] || [ "$target" = wedding-gallery ]; then
  dump_docker supabase-db postgres postgres wedding-gallery
fi
if [ "$target" = all ] || [ "$target" = project ]; then
  while read -r slug url; do
    [ -n "$slug" ] || continue
    if [ "$target" = project ] && [ "$slug" != "${2:-}" ]; then continue; fi
    dump "$url" "project-$slug"
  done < <(project_dbs)
fi
