#!/usr/bin/env bash
# Start the Training Time Machine website (installs and builds on first run).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

command -v docker >/dev/null 2>&1 && docker compose -f ../docker-compose.yml up -d --wait
[[ -d node_modules ]] || npm install
[[ -d dist ]] || npm run build
echo
echo "Opening http://localhost:${PORT:-5178} — keep this window open while you browse."
case "$(uname -s)" in
  Darwin) (sleep 2 && open "http://localhost:${PORT:-5178}") & ;;
  Linux) command -v xdg-open >/dev/null 2>&1 && (sleep 2 && xdg-open "http://localhost:${PORT:-5178}") & ;;
esac
npm start
