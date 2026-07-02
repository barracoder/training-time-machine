# strava-mcp

An [MCP](https://modelcontextprotocol.io) server that serves your **Strava bulk export** — activities, GPS/heart-rate streams, profile, stats, routes and goals — to MCP clients (Claude Code, Claude Desktop, etc.). Everything is read locally from the export archive; no Strava API access or network needed.

## Tools

| Tool | Description |
| --- | --- |
| `get_athlete` | Profile from the export, plus bikes and shoes |
| `get_athlete_stats` | Per-type totals: last 4 weeks, year-to-date, all-time |
| `list_activities` | List/filter activities by date, type or name, with paging |
| `get_activity` | Every recorded field for one activity (speeds, elevation, weather, gear...) |
| `get_activity_streams` | Time-series from the activity's GPX: GPS, altitude, HR/cadence/power if recorded |
| `list_routes` | Saved routes |
| `list_goals` | Distance/time goals |

## Setup

### 1. Get your Strava export

Strava → Settings → [My Account → Download or Delete Your Account](https://www.strava.com/athlete/delete_your_account) → **Request Your Archive**. You'll get a `strava-YYYYMMDD.zip` by email.

### 2. Extract it

```sh
unzip strava-YYYYMMDD.zip -d /path/to/strava-mcp/data
```

`data/` in this repo is gitignored and is the default location; any directory works via the `STRAVA_EXPORT_DIR` env var or a CLI argument.

### 3. Install and build

```sh
npm install
npm run build
```

### 4. Register with your MCP client

Claude Code:

```sh
claude mcp add strava -- node /path/to/strava-mcp/dist/index.js
```

Or in any MCP client's JSON config:

```json
{
  "mcpServers": {
    "strava": {
      "command": "node",
      "args": ["/path/to/strava-mcp/dist/index.js", "/path/to/export/dir"]
    }
  }
}
```

## Notes

- **Export quirks**: `activities.csv` repeats some column names; duplicates are exposed with a ` 2` suffix — e.g. `Distance` is km, `Distance 2` is meters. Export timestamps are UTC.
- **Streams**: parsed from the per-activity GPX files. The rare `.fit` upload in an export is not parsed (GPX only); gzipped files are handled. Responses are downsampled to `max_points` (default 200) evenly spaced samples.
- **Privacy**: the export contains personal data (email, GPS tracks, messages). Keep `data/` out of version control — the `.gitignore` here already excludes it.
