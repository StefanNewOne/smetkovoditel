# Сметководител како апликација (десктоп икона)

Овој фолдер го прави системот да се отвора **како вистинска native апликација** — двоен клик на
икона, без терминал и **без Edge**.

## Што прави

- **Десктоп икона „Сметководител"** → отвора **native прозорец** (WebView2, своја икона во
  taskbar/alt-tab, нула Edge chrome). Ако системот не е запален, прво го пали автоматски (со кратко
  „Се подигнува…" известување), па го отвора.
- **Start Menu → Сметководител** → истата икона + **„Изгаси Сметководител"** за гасење.

Native апликацијата (`native\SmetkoApp.exe`) и иконите се создаваат автоматски при
`Install\install.ps1`. Рачно (пре)создавање:

```powershell
powershell -ExecutionPolicy Bypass -File Install\app\native\build-native.ps1      # native .exe
powershell -ExecutionPolicy Bypass -File Install\app\install-shortcuts.ps1         # икони
```

## Native апликација (Опција B — стандардно)

`native\SmetkoApp.exe` е вистински Windows `.exe` (WinForms + WebView2) што го прикажува системот
во сопствен прозорец со **твоја икона** — не Edge. Го користи **WebView2 Runtime** што веќе е на
Windows 11; се компајлира со .NET Framework `csc.exe` (не бара dotnet SDK).

| Датотека                  | Улога                                                      |
| ------------------------- | ---------------------------------------------------------- |
| `native\SmetkoApp.cs`     | Изворен код на native прозорецот.                          |
| `native\build-native.ps1` | Компајлира `SmetkoApp.exe` (csc).                          |
| `native\*.dll`            | WebView2 SDK (Core/WinForms/Loader) — потребни за градење. |

## Датотеки (launcher)

| Датотека                            | Улога                                                               |
| ----------------------------------- | ------------------------------------------------------------------- |
| `launch-app.vbs` / `launch-app.ps1` | Палење + отворање (native ако постои, инаку Edge резерва). Скриено. |
| `stop-app.vbs` / `stop-app.ps1`     | Гасење.                                                             |
| `install-shortcuts.ps1`             | Создава десктоп + Start Menu икони (кирилични имиња, Unicode API).  |
| `make-icon.ps1`                     | Ја генерира `smetkovoditel.ico` од брендот.                         |

## Резерва: Edge „app mode" (ако native не е изграден)

Ако `SmetkoApp.exe` недостасува, launcher-от отвора Edge `--app` прозорец. Тогаш taskbar иконата е
на Edge, освен ако системот не е инсталиран како PWA преку **„Инсталирај како апликација"**
(`install-pwa.ps1`). Со native апликацијата ова не е потребно.

## Забелешки

- Docker Desktop сепак е потребен (моторот). Иконата автоматски го стартува ако не работи.
- WebView2 состојбата се чува во `%LOCALAPPDATA%\Smetkovoditel\webview2` — изолирано од Edge.
- За вистински инсталер со чаробник (`Setup.exe`), види `Install\installer\`.
