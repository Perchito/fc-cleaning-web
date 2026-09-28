#!/usr/bin/env bash
# Dump databases to $STORAGE_DIR/backups/ as gzipped SQL, keeping the newest
# $BACKUP_KEEP (default 14) of each. Run nightly by fc-outreach-backup.timer,
# or on demand from the control panel.
#   backup.sh                   outreach + wedding-gallery + docuseal + every project db
#   backup.sh outreach          only the outreach database
#   backup.sh wedding-gallery   only the self-hosted Supabase stack's db
#   backup.sh docuseal          only DocuSeal's /data (SQLite + attachments)
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

target="${1:-all}"
if [ "$target" = all ] || [ "$target" = outreach ]; then
  dump "$DATABASE_URL" fc-outreach
fi
if [ "$target" = all ] || [ "$target" = wedding-gallery ]; then
  dump_docker supabase-db postgres postgres wedding-gallery
fi
if [ "$target" = all ] || [ "$target" = docuseal ]; then
  dump_docuseal
fi
if [ "$target" = all ] || [ "$target" = project ]; then
  while read -r slug url; do
    [ -n "$slug" ] || continue
    if [ "$target" = project ] && [ "$slug" != "${2:-}" ]; then continue; fi
    dump "$url" "project-$slug"
  done < <(project_dbs)
fi
