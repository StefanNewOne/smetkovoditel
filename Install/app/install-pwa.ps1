# SM-120 — Install the system as a real app (PWA) once, so the taskbar/Start Menu/alt-tab show OUR
# icon instead of Edge's. A non-installed Edge --app window always uses the browser icon; only an
# INSTALLED app carries its own identity. Run this once:
#   powershell -ExecutionPolicy Bypass -File Install\app\install-pwa.ps1
. "$PSScriptRoot\..\_common.ps1"
Add-Type -AssemblyName System.Windows.Forms

Ensure-Docker
Write-Step "Подигам систем (потребно за инсталација)..."
Compose up -d | Out-Null
if (-not (Wait-Health 40)) {
  [System.Windows.Forms.MessageBox]::Show("Системот не одговара. Пробај повторно за момент.",
    "Сметководител") | Out-Null
  exit 1
}

$profileDir = Join-Path $env:LOCALAPPDATA "Smetkovoditel\browser-profile"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$exe = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
  [System.Windows.Forms.MessageBox]::Show("Не е пронајден Edge/Chrome за инсталација.",
    "Сметководител") | Out-Null
  exit 1
}

# Open a NORMAL window (with toolbar) so the install control is visible in the address bar.
Start-Process $exe -ArgumentList "--user-data-dir=$profileDir", "$AppUrl"

$msg = @"
Во прозорецот што се отвори, инсталирај го системот како апликација:

1) Кликни на иконата за инсталација во десниот дел на адресната лента
   (мониторче со стрелка), ИЛИ менито ⋯ горе десно → „Апликации".
2) Избери „Инсталирај" → „Инсталирај".

Потоа затвори го тој прозорец. Од сега, иконата „Сметководител" на
десктоп ќе го отвора системот со ТВОЈАТА икона во taskbar.
"@
[System.Windows.Forms.MessageBox]::Show($msg, "Инсталирај како апликација",
  [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null

# After the user installs, Chromium creates <profile>\Default\Web Applications\...\<app-id>\ where the
# app-id is a 32-char [a-p] string. Record it so the launcher can open the INSTALLED app via
# --app-id (which carries our icon), instead of a plain --app window (Edge icon).
$wa = Join-Path $profileDir "Default\Web Applications"
$appId = $null
if (Test-Path $wa) {
  $appId = (Get-ChildItem $wa -Recurse -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^[a-p]{32}$' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
}
$appIdFile = Join-Path $PSScriptRoot ".pwa-appid.txt"
if ($appId) {
  Set-Content -Path $appIdFile -Value $appId -Encoding ascii
  [System.Windows.Forms.MessageBox]::Show(
    "Инсталацијата успеа. Од сега иконата 'Сметководител' на десктоп го отвора системот со твоето лого во taskbar.",
    "Готово", [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
} else {
  [System.Windows.Forms.MessageBox]::Show(
    "Не открив инсталирана апликација. Ако не кликна 'Инсталирај', пробај повторно.`n(Системот и понатаму работи преку десктоп иконата.)",
    "Забелешка", [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
}
