#!/usr/bin/env bash
# Import a Strava bulk-export archive into the local MySQL database.
#
# Usage:
#   .claude/skills/strava-extract/strava-extract.sh [path-to-strava-export.zip | extracted-dir]
#
# With no argument, uses the newest Strava archive in ~/Downloads
# (Strava names them export_<athlete-id>.zip, older ones strava-*.zip).
# Starts the MySQL container (docker-compose.yml) if it isn't running,
# builds the project if needed, then runs the importer. Re-running
# replaces all previously imported data.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE="$(ls -t "$HOME"/Downloads/export_*.zip "$HOME"/Downloads/strava-*.zip 2>/dev/null | head -1 || true)"
  [[ -n "$ARCHIVE" ]] && echo "No archive given; using newest download: $ARCHIVE"
fi
if [[ -z "$ARCHIVE" || ! -e "$ARCHIVE" ]]; then
  echo "Usage: $0 [strava-export.zip | extracted-dir]" >&2
  echo "(no export_*.zip or strava-*.zip found in ~/Downloads)" >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required to run MySQL (see docker-compose.yml)" >&2; exit 1; }

cd "$REPO_DIR"
docker compose up -d --wait mysql
[[ -d node_modules ]] || npm install
npm run build --silent
node dist/extract.js "$ARCHIVE"
