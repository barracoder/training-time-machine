# Architecture

## Overview

```
                       ┌────────────────────────────────────────────┐
 export_XXXXXXX.zip    │            strava-mcp repository           │
 (your bulk export) ──▶│                                            │
                       │  strava-extract skill (.sh / .ps1)         │
                       │       └─▶ dist/extract.js  ── parses ──┐   │
                       │            (csv.ts, export.ts)         │   │
                       │                                        ▼   │
                       │                 MySQL 8 (docker-compose)   │
                       │                 database: strava           │
                       │                     ▲              ▲       │
                       │        dist/index.js│              │website/server
                       │        (MCP server) │              │(Express API)
                       └─────────────────────┼──────────────┼───────┘
                                             │              │
                                   Claude Code /        browser SPA
                                   Claude Desktop       localhost:5178
                                   (stdio JSON-RPC)
```

Three modules share one MySQL database and never talk to Strava:

1. **Extract** (`src/extract.ts` + the `strava-extract` Claude Code skill in
   `.claude/skills/strava-extract/`, which bundles equivalent bash and
   PowerShell wrapper scripts) — one-shot importer. Parses the export
   with a small RFC 4180 CSV parser (`src/csv.ts`) and a GPX trackpoint parser
   (`src/export.ts`), then bulk-inserts into MySQL. Re-running drops and
   recreates the tables, so a fresh export fully replaces the old one.

2. **MCP server** (`src/index.ts`) — stdio JSON-RPC server built on
   `@modelcontextprotocol/sdk`. Eight read-only tools; the `query` tool
   accepts arbitrary single-statement SELECTs (writes rejected, results
   capped at 200 rows without an explicit LIMIT).

3. **Website** (`website/`) — Express API + React SPA ("Strava Time
   Machine"). See [website/README.md](../website/README.md).

## Database schema

Created by the extractor (`src/extract.ts`); all timestamps are UTC
(`DATETIME`, no timezone conversion — the export itself is UTC).

| Table | Contents | Notes |
| --- | --- | --- |
| `athlete` | One row: id, name, email, sex, weight, city/state/country | From `profile.csv` |
| `gear` | Bikes and shoes: name (PK), kind, brand, model, default sports | From `bikes.csv` + `shoes.csv` |
| `activities` | One row per activity: typed columns for the common numeric fields plus the complete raw export row as a `fields` JSON column | From `activities.csv`; indexes on `start_time`, `type` |
| `activity_points` | Full-resolution GPS/sensor streams: `(activity_id, seq)` PK, time, lat, lon, altitude, heartrate, cadence, watts, temp | Parsed from per-activity GPX files; FIT files are skipped |
| `routes` | Saved route names + filenames | From `routes.csv` |
| `goals` | Distance/time goals with start/end dates and period | From `goals.csv` |

### The `fields` JSON column

Strava's `activities.csv` has ~100 columns, several with duplicate names
(a summary block, then a detailed block). Typed columns cover the useful
numeric ones; everything else is preserved verbatim in `fields`, with
duplicate headers disambiguated by a ` 2` suffix — e.g. `Distance` (km)
vs `Distance 2` (metres). Query it with MySQL JSON functions:

```sql
SELECT name, fields->>'$."Weather Condition"' AS weather
FROM activities WHERE fields->>'$."Weather Condition"' IS NOT NULL;
```

## Connection configuration

All three modules read the same environment variables, defaulting to the
`docker-compose.yml` values:

| Variable | Default |
| --- | --- |
| `MYSQL_HOST` | `127.0.0.1` |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | `strava` |
| `MYSQL_PASSWORD` | `strava` |
| `MYSQL_DATABASE` | `strava` |

The MySQL container binds to `127.0.0.1` only and stores data in the
`strava-mysql-data` Docker volume. Nothing is exposed to the network.

## Testing

- `npm test` (repo root) — unit tests for the CSV/GPX/date parsers, plus
  integration tests that run the extractor against a synthetic fixture
  export (`test/fixtures/export/`) into a separate `strava_test` database
  and drive the MCP server over stdio. Integration tests skip cleanly when
  MySQL is down.
- `cd website && npm test` — API integration tests against the real
  database (shape assertions only, no dataset-specific values).
