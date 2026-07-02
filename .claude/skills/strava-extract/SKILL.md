---
name: strava-extract
description: Import a downloaded Strava bulk-export zip into the local MySQL database used by the strava MCP server and the analysis website. Use when the user has downloaded a new Strava archive (strava-YYYYMMDD.zip) and wants it loaded/refreshed for querying.
---

# strava-extract

Load a Strava bulk-export archive into MySQL so the `strava` MCP server and the
analysis website in `website/` can query it.

## Steps

1. Locate the archive. If the user didn't give a path, look for the newest
   `strava-*.zip` in `~/Downloads`. If none exists, tell the user how to
   request one: https://www.strava.com/athlete/download_my_account →
   **Request Your Archive** (it arrives by email, usually within a few
   hours; this is separate from account deletion and completely safe).

2. Run the pre-created import script from the repo root
   (`~/Developer/strava-mcp` — or wherever this repo lives):

   ```sh
   scripts/strava-extract.sh [path-to-zip]
   ```

   The script:
   - starts the MySQL container from `docker-compose.yml` if needed (waits for healthy)
   - builds the TypeScript if `dist/` is stale or `node_modules` missing
   - runs `node dist/extract.js <archive>`, which **drops and recreates** the
     strava tables, then loads athlete, gear, activities, GPX track points,
     routes and goals

3. Report the importer's summary (activity count, track-point count, any
   skipped non-GPX files) back to the user.

## Verification

Confirm the load with a quick query:

```sh
docker exec strava-mysql mysql -ustrava -pstrava strava \
  -e "SELECT COUNT(*) activities, (SELECT COUNT(*) FROM activity_points) points FROM activities;"
```

## Troubleshooting

- **Docker not running** → start Docker Desktop, retry.
- **Port 3306 in use** → another MySQL owns the port; either stop it or set
  `MYSQL_PORT` and change the port mapping in `docker-compose.yml`.
- **`unzip` errors** → the archive may be partially downloaded; re-download it.
- **Non-GPX activities skipped** → expected; the importer only parses GPX
  track files (FIT files are skipped, their summary rows still load).
- Connection settings are env-overridable: `MYSQL_HOST`, `MYSQL_PORT`,
  `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` (defaults match
  `docker-compose.yml`: strava/strava@127.0.0.1:3306/strava).
