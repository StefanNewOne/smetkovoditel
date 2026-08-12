# SM-120 — Create Desktop + Start Menu shortcuts so the system opens like an app (no terminal).
# Run once after install.ps1:  powershell -ExecutionPolicy Bypass -File Install\app\install-shortcuts.ps1
$ErrorActionPreference = "Stop"

$appDir  = $PSScriptRoot
$ico     = Join-Path $appDir "smetkovoditel.ico"
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"

if (-not (Test-Path $ico)) {
  Write-Host "Иконата недостасува — ја создавам..." -ForegroundColor Yellow
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $appDir "make-icon.ps1")
}

$wsh = New-Object -ComObject WScript.Shell
$tmpSeq = 0

# WScript.Shell saves the .lnk PATH via the ANSI codepage, so a Cyrillic filename becomes "?".
# Work around it: save to an ASCII temp path, then rename to the real (Cyrillic) name with .NET
# (Unicode-safe). The .lnk does not store its own filename, so the rename is harmless.
function New-Shortcut($linkPath, $vbs, $desc) {
  $script:tmpSeq++
  # Temp must live in an ASCII path — COM Save() can't write into a Cyrillic folder either.
  $tmp = Join-Path $env:TEMP ("_smetko_tmp_$tmpSeq.lnk")
  $sc = $wsh.CreateShortcut($tmp)
  $sc.TargetPath = $wscript
  $sc.Arguments = '"' + (Join-Path $appDir $vbs) + '"'
  $sc.WorkingDirectory = $appDir
  $sc.IconLocation = "$ico,0"
  $sc.Description = $desc
  $sc.Save()
  if (Test-Path -LiteralPath $linkPath) { [System.IO.File]::Delete($linkPath) }
  [System.IO.File]::Move($tmp, $linkPath)
}

# Desktop — main icon.
$desktop = [Environment]::GetFolderPath("Desktop")
New-Shortcut (Join-Path $desktop "Сметководител.lnk") "launch-app.vbs" "Отвори го Сметководител"

# Start Menu folder — open + stop.
$startDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Сметководител"
New-Item -ItemType Directory -Force -Path $startDir | Out-Null
New-Shortcut (Join-Path $startDir "Сметководител.lnk")        "launch-app.vbs" "Отвори го Сметководител"
New-Shortcut (Join-Path $startDir "Изгаси Сметководител.lnk") "stop-app.vbs"   "Изгаси го Сметководител"

Write-Host "OK  Кратенки создадени: десктоп + Start Menu." -ForegroundColor Green
Write-Host "    Двоен клик на 'Сметководител' на десктоп го отвора системот." -ForegroundColor Green
