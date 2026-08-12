# SM-120 — shared helpers for the local-install scripts. Dot-sourced by the others:
#   . "$PSScriptRoot\_common.ps1"
# Not meant to be run directly.

# Continue (not Stop): `docker compose` writes progress to stderr, and under EAP=Stop any native
# stderr becomes a terminating error. We check $LASTEXITCODE explicitly instead.
$ErrorActionPreference = "Continue"

# Repo root = parent of the Install/ folder, regardless of where the script is invoked from.
$script:RepoRoot   = Split-Path -Parent $PSScriptRoot
$script:Project    = "smetkovoditel"
$script:ComposeRel = "Install/docker-compose.install.yml"
$script:EnvFile    = Join-Path $PSScriptRoot ".env.install"
$script:EnvExample = Join-Path $PSScriptRoot "env.install.example"
$script:AppUrl     = "http://localhost:3000"
# Host-side DB URL (published port) for running Prisma migrations from the host toolchain.
$script:HostDbUrl  = "postgresql://smetko:smetko@localhost:5434/smetko?schema=public"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "OK  $msg"  -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "!!  $msg"  -ForegroundColor Yellow }

# Run docker compose for this project/stack. Pass args, e.g. Compose up -d --build
function Compose {
  Push-Location $RepoRoot
  try {
    & docker compose -p $Project -f $ComposeRel @args
    if ($LASTEXITCODE -ne 0) { throw "docker compose $($args -join ' ') failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

# True when the Docker daemon is reachable. Discards both native streams (no stderr termination).
function Test-DockerUp {
  & docker info --format '{{.ServerVersion}}' > $null 2>&1
  return ($LASTEXITCODE -eq 0)
}

# Ensure Docker Desktop is running; start it and wait up to ~120s if not.
function Ensure-Docker {
  if (Test-DockerUp) { return }
  Write-Step "Docker не работи — го стартувам Docker Desktop..."
  $paths = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
  )
  $exe = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $exe) { throw "Docker Desktop не е најден. Инсталирај Docker Desktop и пробај повторно." }
  Start-Process $exe
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 3
    if (Test-DockerUp) { Write-Ok "Docker е спремен."; return }
  }
  throw "Docker не се крена на време. Отвори го Docker Desktop рачно и пробај повторно."
}

# Stop the dev stack (docker-compose.yml) so two Postgres containers never share the volume.
function Stop-DevStack {
  Push-Location $RepoRoot
  try {
    if (Test-Path (Join-Path $RepoRoot "docker-compose.yml")) {
      & docker compose -p $Project -f docker-compose.yml down > $null 2>&1
    }
  } finally { Pop-Location }
}

# Poll the app health endpoint until it responds ok, or time out.
function Wait-Health([int]$Retries = 30) {
  for ($i = 1; $i -le $Retries; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
      if ($r.Content -match '"ok"\s*:\s*true') { return $true }
    } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}

# Resolve the running db container id for this stack.
function Get-DbContainer {
  Push-Location $RepoRoot
  try {
    $cid = (& docker compose -p $Project -f $ComposeRel ps -q db).Trim()
  } finally { Pop-Location }
  if (-not $cid) { throw "db контејнерот не работи. Прво: Install\start.ps1" }
  return $cid
}

# Dump the whole DB to a host .sql file via `docker cp` (avoids PowerShell text encoding issues).
function Invoke-PgDump([string]$TargetPath) {
  $cid = Get-DbContainer
  $tmp = "/tmp/smetko-dump.sql"
  & docker exec $cid pg_dump -U smetko -d smetko -f $tmp
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }
  & docker cp "${cid}:${tmp}" $TargetPath
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed (exit $LASTEXITCODE)" }
  & docker exec $cid rm -f $tmp | Out-Null
}

# Run pending Prisma migrations from the host against the published DB port.
function Invoke-Migrate {
  Push-Location $RepoRoot
  try {
    $env:DATABASE_URL = $HostDbUrl
    & npm run migrate:deploy --workspace=@smetko/db
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}
