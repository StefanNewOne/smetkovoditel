# SM-120 — Daily start. Powers the system back on (no rebuild). Use install.ps1 for first run.
. "$PSScriptRoot\_common.ps1"

Ensure-Docker

if (-not (Test-Path $EnvFile)) {
  Write-Warn2 "Нема Install\.env.install — прво изврши: Install\install.ps1"
  exit 1
}

Write-Step "Го палам системот..."
Compose up -d

Write-Step "Чекам здравје..."
if (Wait-Health) {
  Write-Ok "Подигнат: $AppUrl"
  Start-Process $AppUrl
} else {
  Write-Warn2 "Не одговара. Логови: Install\logs.ps1 web"
  exit 1
}
