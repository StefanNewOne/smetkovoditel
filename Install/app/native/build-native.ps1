# SM-120 — Build SmetkoApp.exe (native WebView2 shell) with the .NET Framework compiler (csc).
# No dotnet SDK required. Produces Install\app\native\SmetkoApp.exe. Run once (and after edits):
#   powershell -ExecutionPolicy Bypass -File Install\app\native\build-native.ps1
$ErrorActionPreference = "Stop"

$dir = $PSScriptRoot
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw ".NET Framework csc.exe не е пронајден: $csc" }

$fwk = Split-Path $csc -Parent
$refs = @(
  (Join-Path $dir "Microsoft.Web.WebView2.Core.dll"),
  (Join-Path $dir "Microsoft.Web.WebView2.WinForms.dll"),
  (Join-Path $fwk "System.dll"),
  (Join-Path $fwk "System.Drawing.dll"),
  (Join-Path $fwk "System.Windows.Forms.dll"),
  (Join-Path $fwk "netstandard.dll")
)
foreach ($r in $refs) { if (-not (Test-Path $r)) { throw "Reference недостасува: $r" } }

$out = Join-Path $dir "SmetkoApp.exe"
$src = Join-Path $dir "SmetkoApp.cs"

# The icon lives one level up (Install\app\smetkovoditel.ico); copy it next to the exe so the app
# can load it at runtime and csc can embed it. (The copy is gitignored — not a committed dup.)
$ico = Join-Path $dir "smetkovoditel.ico"
Copy-Item (Join-Path (Split-Path $dir -Parent) "smetkovoditel.ico") $ico -Force

$args = @(
  "/nologo", "/target:winexe", "/platform:x64", "/optimize+",
  "/out:$out", "/win32icon:$ico"
) + ($refs | ForEach-Object { "/reference:$_" }) + @($src)

Write-Host "==> Компајлирам SmetkoApp.exe..." -ForegroundColor Cyan
& $csc @args
if ($LASTEXITCODE -ne 0) { throw "csc failed (exit $LASTEXITCODE)" }
Write-Host "OK  Изградено: $out ($([math]::Round((Get-Item $out).Length/1KB,1)) KB)" -ForegroundColor Green
