# Windows runbook

Commands below are for **PowerShell**. The repo's `scripts/strava-extract.sh`
is a bash script — on Windows either use **Git Bash**/**WSL** to run it
as-is, or follow the native PowerShell equivalents given here.

## 0. Prerequisites

```powershell
# Node.js ≥ 18, git (includes Git Bash)
winget install OpenJS.NodeJS.LTS Git.Git

# Docker Desktop (uses WSL 2; the installer enables it if needed)
winget install Docker.DockerDesktop
```

Start Docker Desktop once and finish its setup. Verify in a new terminal:
`node -v` (≥ 18), `docker compose version`.

## 1. Clone and build

```powershell
git clone <this-repo> $HOME\strava-mcp
cd $HOME\strava-mcp
npm install
npm run build
```

## 2. Extract module — import your data

Request your archive at <https://www.strava.com/athlete/download_my_account>
and save the emailed `strava-YYYYMMDD.zip` to `Downloads`.

**Option A — Git Bash (runs the bundled script):**

```sh
./scripts/strava-extract.sh ~/Downloads/strava-YYYYMMDD.zip
```

**Option B — native PowerShell (same steps, no bash):**

```powershell
docker compose up -d --wait          # MySQL 8 on 127.0.0.1:3306
node dist\extract.js "$HOME\Downloads\strava-YYYYMMDD.zip"
```

(The importer unzips the archive itself; it needs `unzip` on PATH — Git Bash
provides it, or pre-extract the zip with Explorer and pass the folder path
instead.)

Verify:

```powershell
docker exec strava-mysql mysql -ustrava -pstrava strava -e "SELECT COUNT(*) FROM activities;"
npm test   # 26 tests, integration tests use a separate strava_test database
```

## 3. MCP server

```powershell
# Claude Code
claude mcp add strava -- node $HOME\strava-mcp\dist\index.js
```

For Claude Desktop, add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{"mcpServers": {"strava": {"command": "node", "args": ["C:\\Users\\YOU\\strava-mcp\\dist\\index.js"]}}}
```

## 4. Website

```powershell
cd $HOME\strava-mcp\website
npm install
npm run build
npm start          # http://localhost:5178
```

To auto-start, create a Task Scheduler task running `npm start` in
`%USERPROFILE%\strava-mcp\website` at logon, or run it manually.

## Uninstall

```powershell
claude mcp remove strava
docker compose -f $HOME\strava-mcp\docker-compose.yml down -v   # -v deletes the database
Remove-Item -Recurse -Force $HOME\strava-mcp
```
