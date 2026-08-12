# SM-120 — Local DB backup. Real money/invoices live here — run this regularly.
# Writes Install\backups\smetko-YYYYMMDD-HHMMSS.sql and keeps the newest 20.
. "$PSScriptRoot\_common.ps1"

$dir = Join-Path $PSScriptRoot "backups"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $dir "smetko-$stamp.sql"

Write-Step "Правам бекап на базата..."
Invoke-PgDump $out
$sizeKb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Ok "Бекап: $out ($sizeKb KB)"

# Retention: keep the newest 20 backups.
Get-ChildItem $dir -Filter "smetko-*.sql" | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 20 | Remove-Item -Force -ErrorAction SilentlyContinue
