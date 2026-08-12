# SM-120 — Stop the system (data preserved). Invoked hidden via stop-app.vbs (desktop icon).
. "$PSScriptRoot\..\_common.ps1"
Compose stop | Out-Null
