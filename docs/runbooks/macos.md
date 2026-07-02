# macOS runbook

## 0. Prerequisites

```sh
# Homebrew (https://brew.sh) if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js ≥ 18 and git (unzip ships with macOS)
brew install node git

# Docker Desktop
brew install --cask docker
open -a Docker    # start it once and finish the setup dialog
```

Verify: `node -v` (≥ 18), `docker compose version`.

## 1. Clone and build

```sh
git clone <this-repo> ~/Developer/strava-mcp
cd ~/Developer/strava-mcp
npm install && npm run build
```

## 2. Extract module: import your data

Request your archive at <https://www.strava.com/athlete/download_my_account>,
save the emailed `export_XXXXXXX.zip`, then:

```sh
./.claude/skills/strava-extract/strava-extract.sh ~/Downloads/export_XXXXXXX.zip
# no argument = newest export_*.zip / strava-*.zip in ~/Downloads
```

This starts MySQL (Docker, 127.0.0.1:3306, data in the `strava-mysql-data`
volume) and imports everything. Verify:

```sh
docker exec strava-mysql mysql -ustrava -pstrava strava -e "SELECT COUNT(*) FROM activities;"
npm test   # 26 tests, integration tests use a separate strava_test database
```

In Claude Code you can instead use the bundled skill: `/strava-extract`.

## 3. MCP server

```sh
# Claude Code
claude mcp add strava -- node ~/Developer/strava-mcp/dist/index.js
```

For Claude Desktop, add to
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{"mcpServers": {"strava": {"command": "node", "args": ["/Users/YOU/Developer/strava-mcp/dist/index.js"]}}}
```

## 4. Website

```sh
cd ~/Developer/strava-mcp/website
npm install
npm run build
npm start          # http://localhost:5178
```

To keep it running across logins, use a LaunchAgent
(`~/Library/LaunchAgents/com.strava-mcp.web.plist`) with
`ProgramArguments = [npm, start]` and
`WorkingDirectory = ~/Developer/strava-mcp/website`, or just run `npm start`
in a terminal tab when you want it.

## Uninstall

```sh
claude mcp remove strava
docker compose -f ~/Developer/strava-mcp/docker-compose.yml down -v  # -v deletes the database
rm -rf ~/Developer/strava-mcp
```
