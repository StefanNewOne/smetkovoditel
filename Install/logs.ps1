# SM-120 — Tail service logs. Usage: Install\logs.ps1 [web|worker|db|mailhog]  (default: web)
. "$PSScriptRoot\_common.ps1"

$svc = if ($args.Count -ge 1) { $args[0] } else { "web" }
Write-Step "Логови за '$svc' (Ctrl+C за излез)..."
Compose logs -f --tail 100 $svc
