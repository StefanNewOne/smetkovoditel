# SM-120 — Export the local DB for go-live migration to the hosting server.
# Produces Install\exports\smetko-golive-YYYYMMDD-HHMMSS.sql. Copy it to the server and restore
# into the production DB (see Install\README.md "Пренос на хостинг").
. "$PSScriptRoot\_common.ps1"

$dir = Join-Path $PSScriptRoot "exports"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $dir "smetko-golive-$stamp.sql"

Write-Step "Извезувам ја базата за пренос на хостинг..."
Invoke-PgDump $out
$sizeKb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Ok "Извоз: $out ($sizeKb KB)"
Write-Host ""
Write-Host "Следен чекор на серверот (по подигање на docker-compose.prod.yml + migrate deploy):" -ForegroundColor Cyan
Write-Host "  cat smetko-golive-$stamp.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U <user> -d <db>"
