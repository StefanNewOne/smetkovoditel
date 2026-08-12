# SM-120 — Update to the latest code: pull, rebuild, migrate, restart. Data is preserved.
. "$PSScriptRoot\_common.ps1"

Ensure-Docker

Write-Step "Повлекувам најнов код (git pull)..."
Push-Location $RepoRoot
try {
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Warn2 "git pull не помина чисто — реши рачно, па пробај повторно."; exit 1 }
} finally { Pop-Location }

Write-Step "Градам и рестартирам..."
Compose up -d --build

Write-Step "Применувам миграции..."
Invoke-Migrate

Write-Step "Чекам здравје..."
if (Wait-Health) { Write-Ok "Ажурирано и подигнато: $AppUrl" }
else { Write-Warn2 "Не одговара по ажурирање. Логови: Install\logs.ps1 web"; exit 1 }
