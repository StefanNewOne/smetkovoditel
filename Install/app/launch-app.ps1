# SM-120 — App launcher. Shows a small splash, ensures the stack is up, then opens the system in
# a chromeless app-mode window (Edge/Chrome --app). Invoked hidden via launch-app.vbs (desktop icon).
. "$PSScriptRoot\..\_common.ps1"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $EnvFile)) {
  [System.Windows.Forms.MessageBox]::Show(
    "Системот не е инсталиран. Прво изврши Install\install.ps1.", "Сметководител") | Out-Null
  exit 1
}

# Small "starting…" splash so the click gives immediate feedback (first start can take ~1 min).
$splash = New-Object System.Windows.Forms.Form
$splash.FormBorderStyle = "None"; $splash.StartPosition = "CenterScreen"
$splash.Size = New-Object System.Drawing.Size(380, 130)
$splash.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#3b76d1")
$splash.TopMost = $true; $splash.ShowInTaskbar = $false
$ico = Join-Path $PSScriptRoot "smetkovoditel.ico"
if (Test-Path $ico) { $splash.Icon = New-Object System.Drawing.Icon($ico) }
$lbl = New-Object System.Windows.Forms.Label
$lbl.Text = "Се подигнува Сметководител…"
$lbl.Dock = "Fill"; $lbl.TextAlign = "MiddleCenter"
$lbl.ForeColor = [System.Drawing.Color]::White
$lbl.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$splash.Controls.Add($lbl)
$splash.Show(); $splash.Refresh(); [System.Windows.Forms.Application]::DoEvents()

try {
  Ensure-Docker
  Compose up -d | Out-Null   # idempotent: instant if already running
  $ready = Wait-Health 40
} finally {
  $splash.Close(); $splash.Dispose()
}

# Preferred: the native WebView2 shell (real app window, our icon, no Edge). Built by
# native\build-native.ps1 (done during install).
$native = Join-Path $PSScriptRoot "native\SmetkoApp.exe"
if (Test-Path $native) {
  Start-Process $native
  return
}

# Fallback (if the native shell was not built): a chromeless Edge/Chrome app window.
$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$exe = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($exe) {
  # Dedicated profile so the app always opens its own window (even if the user's browser is
  # already running), isolated from normal browsing.
  $profileDir = Join-Path $env:LOCALAPPDATA "Smetkovoditel\browser-profile"
  New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

  # If the system was installed as an app (install-pwa.ps1 recorded its id), open the INSTALLED
  # app via --app-id so the taskbar/alt-tab show OUR icon. Otherwise fall back to a --app window.
  $appIdFile = Join-Path $PSScriptRoot ".pwa-appid.txt"
  $appId = if (Test-Path $appIdFile) { (Get-Content $appIdFile -Raw).Trim() } else { $null }
  if ($appId) {
    Start-Process $exe -ArgumentList "--app-id=$appId", "--user-data-dir=$profileDir"
  } else {
    Start-Process $exe -ArgumentList @(
      "--app=$AppUrl",
      "--user-data-dir=$profileDir",
      "--no-first-run",
      "--window-size=1400,900"
    )
  }
} else {
  Start-Process $AppUrl   # default browser (also covers the "not ready yet" case)
}
