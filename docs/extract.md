# Extract module

Imports a Strava bulk-export archive into the local MySQL database used by
the MCP server and the website.

## Getting the archive

Request it at <https://www.strava.com/athlete/download_my_account>
(**Request Your Archive** — this does not affect your account). Strava
emails an `export_XXXXXXX.zip` containing, among other files:

| Export file | Imported into |
| --- | --- |
| `activities.csv` | `activities` (typed columns + full raw row as JSON) |
| `activities/*.gpx` | `activity_points` (full-resolution streams) |
| `profile.csv` | `athlete` |
| `bikes.csv`, `shoes.csv` | `gear` |
| `routes.csv` | `routes` |
| `goals.csv` | `goals` |

Media, messages, followers etc. are present in the zip but not imported.

## Running

The convenience script handles everything (start MySQL, build, import):

```sh
.claude/skills/strava-extract/strava-extract.sh ~/Downloads/export_XXXXXXX.zip
# or with no argument: uses the newest export_*.zip / strava-*.zip in ~/Downloads
```

Or run the steps manually:

```sh
docker compose up -d --wait     # MySQL 8 on 127.0.0.1:3306
npm install && npm run build
node dist/extract.js ~/Downloads/export_XXXXXXX.zip   # zip or extracted dir
```

In Claude Code, the `strava-extract` skill
(`.claude/skills/strava-extract/`) wraps the same script — just say
"import my new Strava export".

## Semantics

- **Replace, not merge**: the importer drops and recreates all tables, so
  re-running with a newer export gives you exactly that export's contents.
- **Timestamps are UTC** — parsed from the export's `"Jul 2, 2026, 5:03:49 PM"`
  format, stored as `DATETIME`.
- **Duplicate CSV columns** (Strava repeats `Distance`, `Elapsed Time`, etc.)
  are disambiguated with a ` 2` suffix in the `fields` JSON; the typed
  `distance_m` column prefers the detailed metres value.
- **GPX only**: activity streams are parsed from GPX (including gzipped
  `.gpx.gz`). Binary `.fit` files are skipped with a warning — their summary
  row still imports, only the track points are missing.
- **Manual/trainer activities** have no track file; they import with
  summary data and zero points.

## Performance

~500 activities with 1.25M track points import in roughly a minute
(batched 1000-row inserts).

## Troubleshooting

See the [strava-extract skill](../.claude/skills/strava-extract/SKILL.md)
troubleshooting section; the short version:

- **`ECONNREFUSED`** → MySQL isn't up: `docker compose up -d --wait`
- **Port 3306 taken** → change the mapping in `docker-compose.yml` and set
  `MYSQL_PORT`
- **`does not look like an extracted Strava export`** → point it at the zip
  itself or the directory that directly contains `activities.csv`
