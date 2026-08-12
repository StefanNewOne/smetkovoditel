# SM-120 — Create Desktop + Start Menu shortcuts so the system opens like an app (no terminal).
# Run once after install.ps1:  powershell -ExecutionPolicy Bypass -File Install\app\install-shortcuts.ps1
#
# Uses the Unicode Shell API (IShellLinkW + IPersistFile) directly. WScript.Shell writes .lnk
# paths AND fields (Description, IconLocation) via the ANSI codepage, so Cyrillic turns into "?".
# IShellLinkW is Unicode end-to-end — correct names, tooltips and icons.
$ErrorActionPreference = "Stop"

$appDir  = $PSScriptRoot
$ico     = Join-Path $appDir "smetkovoditel.ico"
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"

if (-not (Test-Path $ico)) {
  Write-Host "Иконата недостасува — ја создавам..." -ForegroundColor Yellow
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $appDir "make-icon.ps1")
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
internal class CShellLink { }

[ComImport, Guid("000214F9-0000-0000-C000-000000000046"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int cch, IntPtr fd, uint flags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetHotkey(out short w);
    void SetHotkey(short w);
    void GetShowCmd(out int i);
    void SetShowCmd(int i);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch, out int i);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int i);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, uint dw);
    void Resolve(IntPtr hwnd, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
}

[ComImport, Guid("0000010b-0000-0000-C000-000000000046"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPersistFile {
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string f, uint mode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string f, [MarshalAs(UnmanagedType.Bool)] bool remember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);
}

public static class Shortcut {
    public static void Create(string path, string target, string args, string workDir, string icon, string desc) {
        IShellLinkW link = (IShellLinkW)new CShellLink();
        link.SetPath(target);
        link.SetArguments(args);
        link.SetWorkingDirectory(workDir);
        link.SetIconLocation(icon, 0);
        link.SetDescription(desc);
        ((IPersistFile)link).Save(path, true);
    }
}
"@

function New-Shortcut($linkPath, $vbs, $desc) {
  if (Test-Path -LiteralPath $linkPath) { [System.IO.File]::Delete($linkPath) }
  [Shortcut]::Create($linkPath, $wscript, '"' + (Join-Path $appDir $vbs) + '"', $appDir, $ico, $desc)
}

# Desktop — main icon.
$desktop = [Environment]::GetFolderPath("Desktop")
New-Shortcut (Join-Path $desktop "Сметководител.lnk") "launch-app.vbs" "Отвори го Сметководител"

# Start Menu folder — open + stop.
$startDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Сметководител"
New-Item -ItemType Directory -Force -Path $startDir | Out-Null
New-Shortcut (Join-Path $startDir "Сметководител.lnk")        "launch-app.vbs" "Отвори го Сметководител"
New-Shortcut (Join-Path $startDir "Изгаси Сметководител.lnk") "stop-app.vbs"   "Изгаси го Сметководител"
New-Shortcut (Join-Path $startDir "Инсталирај како апликација.lnk") "install-pwa.vbs" "Инсталирај го системот како апликација (своја икона во taskbar)"

Write-Host "OK  Кратенки создадени: десктоп + Start Menu." -ForegroundColor Green
Write-Host "    Двоен клик на 'Сметководител' на десктоп го отвора системот." -ForegroundColor Green
