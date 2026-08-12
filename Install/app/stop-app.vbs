' Stop Smetkovoditel hidden (no console window). SM-120.
Set sh = CreateObject("WScript.Shell")
d = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & d & "stop-app.ps1""", 0, False
