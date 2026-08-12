' Install Smetkovoditel as a PWA (one-time), hidden console. SM-120.
Set sh = CreateObject("WScript.Shell")
d = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & d & "install-pwa.ps1""", 0, False
