# shellcheck shell=bash
# Shared by the homeserver scripts. Loads KEY=value lines from the env file
# without executing it as shell (values may contain spaces, e.g. addresses).
load_env() {
  local file="${ENV_FILE:-/etc/perchito/perchito.env}" line k v
  [ -r "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*([A-Z0-9_]+)[[:space:]]*=(.*)$ ]] || continue
    k="${BASH_REMATCH[1]}"
    v="${BASH_REMATCH[2]}"
    v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
    if [[ "$v" =~ ^\"(.*)\"$ || "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
    export "$k=$v"
  done < "$file"
}

# Print "<slug> <database url>" for every project that has a database.
project_dbs() {
  local file="${PROJECTS_FILE:-/etc/perchito/projects.json}"
  [ -r "$file" ] || return 0
  node -e '
    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const [slug, p] of Object.entries(d.projects || {}))
      if (p.db) console.log(slug, `postgresql://${p.db.user}:${p.db.password}@127.0.0.1:5432/${p.db.name}`);
  ' "$file"
}
