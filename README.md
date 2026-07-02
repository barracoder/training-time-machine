# Strava Time Machine — your data, on your machine

**This repo is a protest.** In 2026 Strava put API access to your *own* activities behind a paid subscription: without paying, third-party apps — and you — can no longer read your data through the API (new apps get a `403 Application Inactive` until the developer holds an active subscription). Meanwhile Strava monetises the very same data. Your training history is **your** data; limiting your access to it is wrong.

You don't have to pay to get it back. Data-portability law (GDPR Art. 20, UK GDPR, and equivalents elsewhere) guarantees your right to a copy of your personal data, and Strava honours it through its bulk export. This repo turns that export into something better than the API ever was: a local MySQL database, an MCP server so AI assistants can answer questions about your riding, and a full analysis website — all offline, no Strava account required after the download, no subscription, ever.

## Get your data (free, legal, takes minutes)

1. Go to **<https://www.strava.com/athlete/download_my_account>** (Settings → My Account → Download or Delete Your Account).
2. Under *Download Request*, click **Request Your Archive**. This does **not** delete or affect your account.
3. Strava emails you a `strava-YYYYMMDD.zip` (usually within a few hours). It contains `activities.csv`, per-activity GPS files, your profile, gear, routes, goals and more.

## What's in this repo

| Module | Folder | What it does |
| --- | --- | --- |
| **Extract** | [`src/extract.ts`](src/extract.ts), [`scripts/`](scripts/), [`.claude/skills/strava-extract/`](.claude/skills/strava-extract/SKILL.md) | Imports the export zip into MySQL: activities, full GPS/HR/power streams, athlete, gear, routes, goals |
| **MCP server** | [`src/`](src/) | Lets MCP clients (Claude Code, Claude Desktop, ...) query your history: stats, activities, streams, plus arbitrary read-only SQL |
| **Website** | [`website/`](website/) | "Strava Time Machine" — dashboard, trends, calendar heatmap, activity maps, GPS heatmap, records, gear and goal progress |

Everything runs locally. The only network access is OpenStreetMap map tiles in the website.

## Quickstart

Prerequisites: Node.js ≥ 18, Docker (for MySQL), `unzip`. OS-specific guides: [Linux](docs/runbooks/linux.md) · [macOS](docs/runbooks/macos.md) · [Windows](docs/runbooks/windows.md).

```sh
git clone <this-repo> && cd strava-mcp
npm install

# 1. Import your export (starts MySQL via docker compose automatically)
scripts/strava-extract.sh ~/Downloads/strava-YYYYMMDD.zip

# 2. Explore in the browser
cd website && npm install && npm run build && npm start
# → http://localhost:5178

# 3. Ask an AI about your riding (Claude Code)
claude mcp add strava -- node /path/to/strava-mcp/dist/index.js
```

## Documentation

- [Architecture & data flow](docs/architecture.md) — how the three modules fit together, database schema
- [Extract module](docs/extract.md) — importer behaviour, schema details, re-import semantics
- [MCP server](docs/mcp-server.md) — tool reference, client registration, configuration
- [Website](website/README.md) — pages, API reference, development
- Install runbooks: [Linux](docs/runbooks/linux.md) · [macOS](docs/runbooks/macos.md) · [Windows](docs/runbooks/windows.md)

## Testing

```sh
npm test              # extract + MCP server (26 tests; integration tests need MySQL up)
cd website && npm test  # website API (24 tests)
```

## Privacy

Your export contains personal data: email address, GPS tracks of every ride (including from your home), messages and more. This repo is built so none of it leaves your machine:

- The database lives in a local Docker volume; MySQL binds to `127.0.0.1` only.
- `data/`, `*.zip` and `.env` are gitignored — your export can never be committed.
- Test fixtures are entirely synthetic.

## License

MIT
