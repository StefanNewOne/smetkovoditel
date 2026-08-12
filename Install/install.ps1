# SM-120 — First-time local install. Brings up the FULL system locally with your existing data.
# Run once:   powershell -ExecutionPolicy Bypass -File Install\install.ps1
# Daily use afterwards: Install\start.ps1 / Install\stop.ps1
. "$PSScriptRoot\_common.ps1"

Write-Step "GoDigital Finance OS — локална инсталација (SM-120)"

Ensure-Docker

Write-Step "Го симнувам dev стекот (за да нема две бази на ист volume)..."
Stop-DevStack

# The existing data volume must be present — that's what makes this "the same database".
# It is declared `external` in the compose file, so `docker compose up` FAILS if it is missing
# (it does NOT silently create an empty one). Handle a genuinely fresh machine explicitly.
$vol = docker volume ls --format '{{.Name}}' | Select-String -SimpleMatch "smetkovoditel_db_data"
if (-not $vol) {
  Write-Warn2 "Не постои volume 'smetkovoditel_db_data' — ќе започнеш со ПРАЗНА база."
  Write-Warn2 "Ако очекуваш постоечки податоци, прекини (Ctrl+C) и провери со: docker volume ls"
  # Create the empty external volume so the first-ever install works; Prisma migrations below
  # then build the schema. (The volume name is fixed in compose, so there's no typo risk here.)
  & docker volume create smetkovoditel_db_data | Out-Null
}

# First-run config: create .env.install from the example and generate real secrets.
if (-not (Test-Path $EnvFile)) {
  Write-Step "Создавам Install\.env.install со случајни тајни..."
  $charset = @(48..57) + @(65..90) + @(97..122)
  $sessionSecret = -join ($charset | Get-Random -Count 48 | ForEach-Object { [char]$_ })
  $cronSecret    = -join ($charset | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  # Read the example and write .env.install WITHOUT a BOM (a BOM would corrupt the first key).
  $content = [System.IO.File]::ReadAllText($EnvExample, [System.Text.Encoding]::UTF8)
  $content = $content `
    -replace '(?m)^SESSION_SECRET=.*', "SESSION_SECRET=$sessionSecret" `
    -replace '(?m)^CRON_SECRET=.*',    "CRON_SECRET=$cronSecret"
  [System.IO.File]::WriteAllText($EnvFile, $content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Ok "Конфигурацијата е создадена (пошта/Gmail намерно исклучени — безбеден режим)."
} else {
  Write-Ok "Install\.env.install веќе постои — го користам."
}

Write-Step "Градам и подигам контејнери (првиот пат трае неколку минути)..."
Compose up -d --build

Write-Step "Применувам миграции на базата..."
Invoke-Migrate

Write-Step "Подготвувам документи (пренос на постоечки + дозволи за запис)..."
Prepare-Uploads

Write-Step "Градам native апликација (прозорец со твоја икона)..."
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "app\native\build-native.ps1")
} catch { Write-Warn2 "Native градењето не успеа — ќе се користи Edge прозорец како резерва." }

Write-Step "Создавам десктоп и Start Menu икони..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "app\install-shortcuts.ps1")

Write-Step "Чекам апликацијата да стане здрава..."
# Generous window: the first cold boot (Next standalone + DB connect) can exceed the 90s default.
if (Wait-Health 60) {
  Write-Ok "Системот е подигнат: $AppUrl"
  Start-Process $AppUrl
} else {
  Write-Warn2 "Апликацијата сè уште не одговара. Провери логови: Install\logs.ps1 web"
  exit 1
}

Write-Host ""
Write-Ok "Готово! Отвори го системот со иконата 'Сметководител' на десктоп."
Write-Ok "Дневно: десктоп икона (пали) · Start Menu 'Изгаси Сметководител' (гаси)"
Write-Ok "Бекап: Install\backup-db.ps1 · Пренос на хостинг: Install\export-db.ps1"
Write-Host ""
Write-Ok "За ТВОЈА икона во taskbar: Start Menu → 'Инсталирај како апликација' (еднаш)."
