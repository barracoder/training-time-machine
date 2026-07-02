# MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server (stdio
transport) that gives MCP clients (Claude Code, Claude Desktop, or anything
MCP-compatible) read access to your imported Strava history.

## Prerequisites

The MySQL database must be running and populated; see the
[extract module](extract.md). Then:

```sh
npm install && npm run build
```

## Registering

Claude Code:

```sh
claude mcp add strava -- node /path/to/training-time-machine/dist/index.js
```

Claude Desktop / generic JSON config:

```json
{
  "mcpServers": {
    "strava": {
      "command": "node",
      "args": ["/path/to/training-time-machine/dist/index.js"]
    }
  }
}
```

If you changed the database settings from the docker-compose defaults,
pass them in the `env` block:

```json
"env": { "MYSQL_PORT": "3307" }
```

## Tools

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_athlete` | none | Profile row plus bikes and shoes |
| `get_athlete_stats` | none | Per-type totals (count, km, hours, elevation) for last 4 weeks / year-to-date / all time |
| `list_activities` | `after`, `before` (ISO dates), `type`, `query` (name search), `page`, `per_page` | Paged activity summaries, most recent first, with `total` count |
| `get_activity` | `activity_id` | Every column incl. the raw `fields` JSON (weather, power, temps, ...) |
| `get_activity_streams` | `activity_id`, `max_points` (default 200) | Evenly downsampled GPS/altitude/HR/cadence/watts/temp time series |
| `list_routes` | none | Saved routes |
| `list_goals` | none | Distance/time goals |
| `query` | `sql` | Any single read-only `SELECT` (or `WITH ... SELECT`). Writes rejected; capped at 200 rows unless the query has its own `LIMIT` |

Example prompts once registered:

- *"What was my longest ride ever, and show me its elevation profile?"*
- *"Compare my monthly distance this year vs last year."*
- *"Which bike have I ridden the most kilometres on?"* (the model will use
  `query` with a JOIN on `gear`)

## Behaviour notes

- Errors come back as MCP tool errors with a readable message; if MySQL is
  down the message tells you to run `docker compose up -d`.
- The server exits when its client disconnects (stdin closes). It never
  lingers.
- Everything is read-only by design: the `query` tool accepts a single
  statement that must start with `SELECT`/`WITH` and contain no statement
  separators.

## Development

Source lives in `src/`:

| File | Purpose |
| --- | --- |
| `index.ts` | Server + tool definitions |
| `db.ts` | Shared MySQL pool/config (env-overridable) |
| `csv.ts` | RFC 4180 CSV parser (also used by the extractor) |
| `export.ts` | Export-archive reader + GPX stream parser (used by the extractor) |
| `extract.ts` | The importer CLI |
| `*.test.ts` | Tests (`npm test`) |
