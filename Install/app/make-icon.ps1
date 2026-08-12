# SM-120 — Generate Install\app\smetkovoditel.ico from the brand logo. Run once; the .ico is
# committed so day-to-day use needs no image tooling.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$logo = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "_docs\design\handoff\logo.jpg"
$icoPath = Join-Path $PSScriptRoot "smetkovoditel.ico"
if (-not (Test-Path $logo)) { throw "Logo not found: $logo" }

$src = [System.Drawing.Image]::FromFile($logo)
try {
  $sizes = 16, 32, 48, 64, 128, 256
  $pngs = @()
  foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::White)
    $ratio = [Math]::Min($s / $src.Width, $s / $src.Height)
    $w = [int]($src.Width * $ratio); $h = [int]($src.Height * $ratio)
    $g.DrawImage($src, [int](($s - $w) / 2), [int](($s - $h) / 2), $w, $h)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += , ($ms.ToArray())
    $bmp.Dispose(); $ms.Dispose()
  }

  # Assemble a PNG-embedded .ico (ICONDIR + ICONDIRENTRY[] + PNG payloads).
  $out = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($out)
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $data = $pngs[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$data.Length); $bw.Write([UInt32]$offset)
    $offset += $data.Length
  }
  foreach ($data in $pngs) { $bw.Write($data) }
  $bw.Flush()
  [System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())
  $bw.Dispose(); $out.Dispose()
  Write-Host "OK  Икона создадена: $icoPath" -ForegroundColor Green
} finally { $src.Dispose() }
