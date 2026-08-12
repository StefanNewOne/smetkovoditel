# SM-120 — Daily stop. Powers the system off (data is kept in the volume).
. "$PSScriptRoot\_common.ps1"

Write-Step "Го гасам системот..."
Compose stop
Write-Ok "Запрен. Податоците се зачувани. Пали пак со: Install\start.ps1"
