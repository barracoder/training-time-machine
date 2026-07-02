# strava-mcp

An [MCP](https://modelcontextprotocol.io) server for the [Strava API](https://developers.strava.com/), giving MCP clients (Claude Code, Claude Desktop, etc.) read access to your activities, profile, stats and segments.

## Tools

| Tool | Description |
| --- | --- |
| `get_athlete` | Authenticated athlete's profile (name, weight, FTP, gear) |
| `get_athlete_stats` | Recent / YTD / all-time ride, run and swim totals |
| `list_activities` | List activities with date filters and paging |
| `get_activity` | Full activity detail (splits, segment efforts, gear) |
| `get_activity_streams` | Time-series data: heart rate, power, pace, GPS, altitude |
| `get_activity_zones` | Heart rate / power zone distribution for an activity |
| `list_starred_segments` | Segments you've starred |
| `get_segment` | Segment detail including your PR |

## Setup

### 1. Create a Strava API application

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an application.
2. Set **Authorization Callback Domain** to `localhost`.
3. Note the **Client ID** and **Client Secret**.

### 2. Install and build

```sh
npm install
npm run build
```

### 3. Authorize (one time)

The token shown on the API settings page only has `read` scope, so a proper OAuth flow is needed to read activities. This starts a local server on port 8723, opens the Strava consent page, and prints your refresh token:

```sh
STRAVA_CLIENT_ID=<id> STRAVA_CLIENT_SECRET=<secret> npm run auth
```

Copy the printed `STRAVA_REFRESH_TOKEN` — the server refreshes short-lived access tokens from it automatically. Default scopes are `read,activity:read_all,profile:read_all`; override with `STRAVA_SCOPES`.

### 4. Register with your MCP client

Claude Code:

```sh
claude mcp add strava \
  --env STRAVA_CLIENT_ID=<id> \
  --env STRAVA_CLIENT_SECRET=<secret> \
  --env STRAVA_REFRESH_TOKEN=<token> \
  -- node /path/to/strava-mcp/dist/index.js
```

Or in any MCP client's JSON config:

```json
{
  "mcpServers": {
    "strava": {
      "command": "node",
      "args": ["/path/to/strava-mcp/dist/index.js"],
      "env": {
        "STRAVA_CLIENT_ID": "<id>",
        "STRAVA_CLIENT_SECRET": "<secret>",
        "STRAVA_REFRESH_TOKEN": "<token>"
      }
    }
  }
}
```

## Notes

- **Rate limits**: default Strava apps get 200 requests per 15 minutes and 2,000 per day. The server surfaces a clear error on HTTP 429.
- **Token rotation**: Strava rotates refresh tokens on every refresh, but the previous token stays valid until used, so a static `STRAVA_REFRESH_TOKEN` in config keeps working across restarts.
- **Scopes**: read-only by default. No write scopes are requested, so the server cannot create or modify activities.
