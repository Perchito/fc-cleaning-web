# shellcheck shell=bash
# Shared by the homeserver scripts. Loads KEY=value lines from the env file
# without executing it as shell (values may contain spaces, e.g. addresses).
load_env() {
  local file="${ENV_FILE:-/etc/fc-outreach/outreach.env}" line k v
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
