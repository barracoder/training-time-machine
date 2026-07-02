# Training Time Machine

*Your training data, on your machine.*

A dark-themed analysis website for your training data, imported into the local
MySQL database by [this repo's import tools](../docs/extract.md). Explore
dashboards, trends, a GitHub-style calendar, a global route heatmap,
per-activity maps and profiles, records, gear totals, and goal progress.

![screenshot placeholder](docs/screenshot.png)

## Requirements

- Node.js 20+
- The local MySQL 8 database running and populated: start the database
  container with `docker compose up` at the repo root, then load your
  activities with the [import tools](../docs/extract.md)

## Setup

```bash
cd website
npm install
```

## Development

```bash
npm run dev
```

Runs two processes via `concurrently`:

- API (Express + tsx watch) on **http://localhost:5178**
- Vite dev server on **http://localhost:5177** (proxies `/api` to 5178)

Open http://localhost:5177.

## Production

```bash
npm run build   # typechecks frontend + server, bundles the SPA into dist/
npm start       # Express serves the built SPA and the API on port 5178
```

Open http://localhost:5178.

## Tests

```bash
npm test
```

Integration tests (vitest + supertest) exercise every API endpoint against the
real database, so the database must be running.

## Configuration

| Env var          | Default     | Purpose                       |
| ---------------- | ----------- | ----------------------------- |
| `MYSQL_HOST`     | `127.0.0.1` | MySQL host                    |
| `MYSQL_PORT`     | `3306`      | MySQL port                    |
| `MYSQL_USER`     | database name | MySQL user                  |
| `MYSQL_PASSWORD` | database name | MySQL password              |
| `MYSQL_DATABASE` | `strava`    | Database name (as created by the import tools) |
| `PORT`           | `5178`      | API / production server port  |

If the database is unreachable, API endpoints return
`503 {"error": "database_unavailable", "message": "..."}`.

## API reference

All endpoints are under `/api` and return JSON. All queries are parameterized.

| Endpoint                    | Query params                                            | Returns                                                                 |
| --------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/summary`          | none                                                    | All-time totals, per-type breakdown, 12 most recent activities          |
| `GET /api/monthly`          | `type` (optional activity type)                         | Per-month aggregates (count, distance, time, elevation, calories, speed) |
| `GET /api/weekly`           | `type`                                                  | Per-ISO-week aggregates                                                  |
| `GET /api/yearly`           | `type`                                                  | Per-year aggregates incl. longest activity                               |
| `GET /api/cumulative`       | none                                                    | Per-year cumulative distance series (day-of-year → km)                   |
| `GET /api/years`            | none                                                    | Years with activities, descending                                        |
| `GET /api/calendar`         | `year` (required)                                       | Daily totals for the calendar heatmap                                    |
| `GET /api/types`            | none                                                    | Distinct activity types                                                  |
| `GET /api/activities`       | `search`, `type`, `from`, `to`, `sort`, `dir`, `page`, `pageSize` | Paginated, sortable, filterable activity list with `total`     |
| `GET /api/activities/:id`   | none                                                    | Full activity row + gear join + parsed `fields` JSON + point count       |
| `GET /api/activities/:id/points` | `max` (default 500, cap 5000)                      | Downsampled GPS track with cumulative distance, elapsed time, segment speed |
| `GET /api/heatmap`          | none                                                    | All GPS points aggregated to a ~50 m grid: `[lat, lon, weight][]`        |
| `GET /api/records`          | none                                                    | Longest ride, biggest climb, fastest ≥5 km, best day/week/month/year, distance milestones, per-gear totals |
| `GET /api/gear`             | none                                                    | Gear catalogue with usage totals                                         |
| `GET /api/goals`            | none                                                    | Goals with computed current-period progress                              |
| `GET /api/athlete`          | none                                                    | Athlete profile                                                          |

## Pages

- **Dashboard**: headline cards, distance-per-month bars, cumulative distance
  per year comparison, recent activities
- **Trends**: monthly/weekly aggregates with metric + type selectors,
  year-over-year table with deltas
- **Calendar**: GitHub-style daily-distance grid with year selector
- **Activities**: searchable / filterable / sortable paginated table
- **Activity detail**: full stats (columns + archive `fields`), route map,
  elevation, speed, and sensor profiles
- **Heatmap**: every activity's GPS points on one map (server-side grid
  aggregation keeps it fast)
- **Records**: personal bests, distance milestones, per-gear totals, goals
  with progress
