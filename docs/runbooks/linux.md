# Linux runbook

Tested against Ubuntu/Debian-style systems; adapt package commands for your
distribution.

## 0. Prerequisites

```sh
# Git and unzip
sudo apt-get update && sudo apt-get install -y git unzip curl

# Node.js ≥ 18 (via nvm, avoids distro-package version problems)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install --lts

# Docker Engine + compose plugin (https://docs.docker.com/engine/install/)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # then log out/in (or `newgrp docker`)
```

Verify: `node -v` (≥ 18), `docker compose version`.

## 1. Clone and build

```sh
git clone <this-repo> ~/strava-mcp
cd ~/strava-mcp
npm install && npm run build
```

## 2. Extract module — import your data

Request your archive at <https://www.strava.com/athlete/download_my_account>,
save the emailed `strava-YYYYMMDD.zip`, then:

```sh
./scripts/strava-extract.sh ~/Downloads/strava-YYYYMMDD.zip
```

This starts MySQL (Docker, port 3306 on 127.0.0.1, data in the
`strava-mysql-data` volume) and imports everything. Verify:

```sh
docker exec strava-mysql mysql -ustrava -pstrava strava -e "SELECT COUNT(*) FROM activities;"
npm test   # 26 tests, integration tests use a separate strava_test database
```

## 3. MCP server

```sh
# Claude Code
claude mcp add strava -- node ~/strava-mcp/dist/index.js
```

For Claude Desktop, add to `~/.config/Claude/claude_desktop_config.json`:

```json
{"mcpServers": {"strava": {"command": "node", "args": ["/home/YOU/strava-mcp/dist/index.js"]}}}
```

## 4. Website

```sh
cd ~/strava-mcp/website
npm install
npm run build
npm start          # http://localhost:5178
```

Optional systemd user service (`~/.config/systemd/user/strava-web.service`):

```ini
[Unit]
Description=Strava Time Machine
After=docker.service

[Service]
WorkingDirectory=%h/strava-mcp/website
ExecStart=/usr/bin/env npm start
Restart=on-failure

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload && systemctl --user enable --now strava-web
```

## Uninstall

```sh
claude mcp remove strava
docker compose -f ~/strava-mcp/docker-compose.yml down -v   # -v deletes the database
rm -rf ~/strava-mcp
```
