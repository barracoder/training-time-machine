# Start the Training Time Machine website (installs and builds on first run).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose -f ..\docker-compose.yml up -d --wait
}
if (-not (Test-Path "node_modules")) { npm install }
if (-not (Test-Path "dist")) { npm run build }

$port = if ($env:PORT) { $env:PORT } else { 5178 }
Write-Host ""
Write-Host "Opening http://localhost:$port - keep this window open while you browse."
Start-Job { Start-Sleep 2; Start-Process "http://localhost:$using:port" } | Out-Null
npm start
