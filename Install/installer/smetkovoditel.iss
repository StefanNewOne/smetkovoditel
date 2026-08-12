; SM-120 — Inno Setup script for a "Setup.exe" installer (part C).
; Produces a wizard that: verifies Docker, creates the Desktop + Start Menu icons, and can build
; & start the system on finish. The APP itself is this repository (Docker builds from it), so the
; installer does not relocate code — it targets the repo folder where this Install\ tree lives.
;
; BUILD: install Inno Setup (https://jrsoftware.org/isinfo.php), open this file in the Inno Setup
; Compiler and press Compile (or run:  iscc Install\installer\smetkovoditel.iss ). Output:
; Install\installer\dist\Смет-Setup.exe
;
; Inno Setup is Unicode, so Cyrillic shortcut names work natively here (unlike WScript.Shell).

#define AppName "Сметководител"
#define Publisher "GoDigital — АЛМА ДИЗАЈН ДООЕЛ Скопје"
#define RepoRoot "..\.."

[Setup]
AppId={{7C0E9B24-5B2A-4E4D-9E3C-SMETKO120APP}
AppName={#AppName}
AppVersion=0.1.0
AppPublisher={#Publisher}
; The app = the repo. Default to the repo folder that contains this script's Install\ tree.
DefaultDirName={code:GetRepoDir}
DisableProgramGroupPage=yes
DisableDirPage=no
UsePreviousAppDir=yes
OutputDir=dist
OutputBaseFilename=Смет-Setup
SetupIconFile={#RepoRoot}\Install\app\smetkovoditel.ico
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
; Uses the Macedonian-capable Unicode default; strings below are provided inline.
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "buildnow"; Description: "Изгради и подигни го системот сега (трае неколку минути)"; GroupDescription: "Прв пат:"

[Icons]
; Desktop + Start Menu shortcuts run the hidden launcher via wscript (no console window).
Name: "{autodesktop}\{#AppName}"; Filename: "{sys}\wscript.exe"; \
  Parameters: """{app}\Install\app\launch-app.vbs"""; WorkingDir: "{app}\Install\app"; \
  IconFilename: "{app}\Install\app\smetkovoditel.ico"; Comment: "Отвори го Сметководител"
Name: "{autoprograms}\{#AppName}\{#AppName}"; Filename: "{sys}\wscript.exe"; \
  Parameters: """{app}\Install\app\launch-app.vbs"""; WorkingDir: "{app}\Install\app"; \
  IconFilename: "{app}\Install\app\smetkovoditel.ico"; Comment: "Отвори го Сметководител"
Name: "{autoprograms}\{#AppName}\Изгаси Сметководител"; Filename: "{sys}\wscript.exe"; \
  Parameters: """{app}\Install\app\stop-app.vbs"""; WorkingDir: "{app}\Install\app"; \
  IconFilename: "{app}\Install\app\smetkovoditel.ico"; Comment: "Изгаси го Сметководител"

[Run]
; Optional first-time build & start (only if the user ticked the task).
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Install\install.ps1"""; \
  WorkingDir: "{app}"; StatusMsg: "Се гради и подига системот..."; \
  Flags: waituntilterminated; Tasks: buildnow

[Code]
// Repo root = two levels up from this compiled script's source (Install\installer\ -> repo).
function GetRepoDir(Param: String): String;
begin
  Result := ExpandFileName(ExpandConstant('{src}') + '\..\..');
  // If Setup.exe was moved elsewhere, fall back to a sensible default.
  if not FileExists(Result + '\Install\app\launch-app.vbs') then
    Result := ExpandConstant('{autopf}\Смет');
end;

// Warn (do not block) if Docker Desktop is not detected — it is the required engine.
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not (FileExists(ExpandConstant('{pf}\Docker\Docker\Docker Desktop.exe'))
       or FileExists(ExpandConstant('{pf32}\Docker\Docker\Docker Desktop.exe'))) then
    MsgBox('Не е пронајден Docker Desktop. Системот бара Docker Desktop да биде инсталиран.' + #13#10 +
           'Инсталирај го од https://www.docker.com/products/docker-desktop/ пред прв старт.',
           mbInformation, MB_OK);
end;
