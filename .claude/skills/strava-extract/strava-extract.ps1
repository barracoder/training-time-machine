# Import a Strava bulk-export archive into the local MySQL database.
#
# Usage:
#   .claude/skills/strava-extract/strava-extract.ps1 [path-to-strava-export.zip | extracted-dir]
#
# With no argument, uses the newest Strava archive in ~/Downloads
# (Strava names them export_<athlete-id>.zip, older ones strava-*.zip).
# Starts the MySQL container (docker-compose.yml) if it isn't running,
# builds the project if needed, then runs the importer. Re-running
# replaces all previously imported data.
param(
    [string]$Archive
)

$ErrorActionPreference = "Stop"
$RepoDir = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")

if (-not $Archive) {
    $newest = Get-ChildItem (Join-Path $HOME "Downloads") -Include "export_*.zip", "strava-*.zip" -Recurse -Depth 0 -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newest) {
        $Archive = $newest.FullName
        Write-Host "No archive given; using newest download: $Archive"
    }
}
if (-not $Archive -or -not (Test-Path $Archive)) {
    Write-Error "Usage: strava-extract.ps1 [strava-export.zip | extracted-dir] (no export_*.zip or strava-*.zip found in ~/Downloads)"
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is required to run MySQL (see docker-compose.yml)"
    exit 1
}

Push-Location $RepoDir
try {
    docker compose up -d --wait mysql
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed" }
    if (-not (Test-Path "node_modules")) { npm install }
    npm run build --silent
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
    node dist/extract.js $Archive
    if ($LASTEXITCODE -ne 0) { throw "import failed" }
}
finally {
    Pop-Location
}
