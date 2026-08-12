# SM-120 — Локална инсталација („Install" пакет) пред go-live

**Type:** Maintenance / Infrastructure
**Refs:** SM-120 · Master Plan §11 (deployment), §4.1 (worker/cron)
**Status:** Implemented & verified locally (2026-08-12) — awaiting commit/merge

> Verified: `Install/install.ps1` builds web+worker, reuses the existing DB volume (43 clients / 243
> charges / 787 statement lines / 90 payments intact), all 5 services healthy, `/api/health` →
> `{"ok":true,"db":"up"}`, login renders, worker cron registered (Europe/Skopje), Gmail/email OFF.
> Incidental fixes required by the built image (also fix production): missing `apps/web/public/`,
> `HOSTNAME=0.0.0.0` bind, and health probe `localhost` → `127.0.0.1` (IPv6 refusal).

---

## 1. Цел (developer request)

Сопственикот сака да го **работи целиот систем локално еден месец** (реален внес, усогласување,
фактури) пред да го качи на хостинг. Треба:

1. **Еден клик инсталација** — целиот систем (web + worker + db + minio) се крева локално како
   вистински сервер, не dev режим.
2. Сето поврзано со инсталацијата да живее во **посебен фолдер `Install/`**, без да се менува
   постоечкиот проект/код.
3. Локалниот систем да ја **чува истата база** што веќе постои (43 клиенти, 243 задолженија, 787
   изводни ставки…), за да може при go-live таа податочна состојба да се пренесе 1:1 на хостингот.

### Одлуки од developer (2026-08-12)

| Прашање                            | Одлука                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| „Иста база"                        | **Ист Docker volume** (`smetkovoditel_db_data`) + `export-db` скрипт за пренос при go-live |
| Излезна е-пошта во локалниот месец | **Безбедно** — нема праќање на реални клиенти                                              |
| Worker (Gmail увоз + cron)         | **Вклучен** — целосен систем                                                               |

---

## 2. Изводливост — да ✅

Инфраструктурата веќе постои; ова е адаптација, не нов развој:

- `apps/web/Dockerfile`, `apps/worker/Dockerfile` — готови production build-ови.
  `next.config` веќе има `output: "standalone"`.
- `docker-compose.prod.yml` — целосен стек (db + web + worker + minio + nginx). Локалната
  варијанта е истиот стек **без nginx/TLS/домен**.
- `/api/health` постои; migrate/seed скриптите постојат.
- Реалните податоци се веќе во volume-от `smetkovoditel_db_data`.

**Разлика dev → инсталација:** изградена апликација (брза, стабилна, `restart: unless-stopped`),
worker и cron активни, еден скрипт за палење — наместо рачно `npm run dev`.

---

## 3. Безбедност на е-поштата (решено by-design, без измена на код)

`createMailSender()` / `createGmailClient()` (`apps/web/lib/gmail-client.ts`) враќаат **`null`
кога `GMAIL_*` креденцијалите отсуствуваат** → dunning/фактурни мејлови се **no-op**, а Gmail
увозот е no-op. Значи:

- Локалната инсталација **не поставува `GMAIL_*`** → **нула ризик** од случаен мејл до реален
  клиент. Нема потреба од измена на апликацискиот код.
- **Рачниот увоз преку UI** (како што се внесени тековните 787 ставки) продолжува да работи без
  Gmail.
- Cron **W1 (задолжување)** и **W7 (курс)** работат без Gmail (само создаваат интерни
  DRAFT-записи / курс; не праќаат пошта).

**Trade-off:** автоматскиот Gmail увоз нема да работи локално додека не се внесат `GMAIL_*`. Тоа е
прифатливо — увозот целиот месец беше рачен. Ако подоцна се сака автоматски увоз локално **со**
задржана безбедност на поштата, се додава мал `MAIL_OUTBOUND=off` guard (една линија во
`createMailSender`) — **опционо, надвор од обемот на v1**.

---

## 4. Дизајн на `Install/` (нови датотеки; постоечкиот проект недопрен)

```
Install/
├── README.md                      # чекор-по-чекор упатство (македонски)
├── docker-compose.install.yml     # db + web + worker + minio + mailhog (без nginx/TLS)
├── env.install.example            # committed примерок (placeholder-и)
├── .env.install                   # gitignored реални локални вредности (се создава од примерокот)
├── install.ps1                    # прв пат: провери Docker → build → migrate → start → отвори прелистувач
├── start.ps1                      # секојдневно палење
├── stop.ps1                       # гасење
├── update.ps1                     # git pull → rebuild → migrate → restart
├── export-db.ps1                  # pg_dump → dump за пренос на хостинг (go-live)
└── backup-db.ps1                  # локален бекап (реални пари/фактури — важно)
```

### 4.1 `docker-compose.install.yml` — клучни одлуки

- **Иста база:** volume се референцира **external** со експлицитно име `smetkovoditel_db_data`,
  па `db` сервисот ги користи ПОСТОЕЧКИТЕ податоци (не празна нова база).
  ```yaml
  volumes:
    db_data:
      external: true
      name: smetkovoditel_db_data
  ```
- **db** — `postgres:16-alpine`, mount `db_data`, публикува `5434:5432` (за постоечки алатки
  како `db:studio`). Останува **единствената** Postgres — dev `docker-compose.yml` и оваа не смеат
  да работат истовремено (двата на истиот volume = ризик од корупција). `install.ps1`/`start.ps1`
  прво го симнуваат dev стекот.
- **web** — build од `apps/web/Dockerfile`, `env_file: Install/.env.install`, `depends_on: db`,
  публикува `3000:3000`, healthcheck на `/api/health`, `restart: unless-stopped`.
- **worker** — build од `apps/worker/Dockerfile`, ист `env_file`, `restart: unless-stopped`.
- **minio** — **без публикување на host портови** (заобиколува конфликт со сестринскиот проект на
  9000/9001). Апликацијата го достигнува преку интерната мрежа (`minio:9000`); прилозите се
  послужуваат преку `/api/attachments` (proxy), не директно до браузер. (Опц. `9010:9000` ако
  треба конзола.)
- **mailhog** — задржан во стекот за иден email-preview (SMTP adapter, ако се посака). Не е
  потребен за v1 бидејќи поштата е исклучена.
- Сите сервиси на една `bridge` мрежа; internal DNS (`db`, `minio`).

### 4.2 `env.install.example` (committed) — суштина

```
NODE_ENV=production
DATABASE_URL=postgresql://smetko:smetko@db:5432/smetko?schema=public
APP_URL=http://localhost:3000
SESSION_SECRET=<32+ chars — генерирај>
CRON_SECRET=<генерирај>
# Gmail НАМЕРНО празно → нула излезна пошта, безбеден локален режим
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_SENDER=
# Object storage — интерно кон minio
S3_ENDPOINT=http://minio:9000
S3_BUCKET=smetko-attachments
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
STORAGE_DIR=/app/uploads
NBRM_RATE_URL=
```

> CLAUDE.md забранува менување на `.env.*` освен `.env.example`. Затоа НЕ го допираме `.env.local`;
> `Install/.env.install` е **нова** датотека (gitignored), генерирана од committed примерокот.
> `.gitignore` добива ред `Install/.env.install`.

### 4.3 Скрипти (PowerShell — Windows 11 домаќин)

- **`install.ps1`** — (1) провери/стартувај Docker Desktop; (2) `down` на dev стекот; (3) провери
  дека volume `smetkovoditel_db_data` постои (инаку предупреди); (4) ако нема `.env.install`,
  копирај од примерокот и генерирај `SESSION_SECRET`/`CRON_SECRET`; (5)
  `docker compose -f Install/docker-compose.install.yml -p smetkovoditel up -d --build`; (6)
  `prisma migrate deploy` во web контејнерот; (7) чекај health; (8) отвори `http://localhost:3000`.
- **`start.ps1` / `stop.ps1`** — секојдневно `up -d` / `stop`.
- **`update.ps1`** — `git pull` → `up -d --build` → `migrate deploy`.
- **`export-db.ps1`** — `pg_dump` во `Install/exports/smetko-YYYYMMDD-HHMMSS.sql` (за go-live
  преносот на хостинг).
- **`backup-db.ps1`** — локален бекап (истата команда, друга папка + ротација).

Забелешка: проектот е `-p smetkovoditel` за да се совпадне со постоечкото име на volume-от.

---

## 5. Патека кон go-live (за да е „истата база" реалност)

1. Локален месец → сите податоци во `smetkovoditel_db_data`.
2. При подготовка на хостинг: `Install/export-db.ps1` → `.sql` dump.
3. На серверот (Master Plan §11 + `_docs/deployment/production.md`): `docker-compose.prod.yml`,
   `prisma migrate deploy`, потоа **restore на dump-от** во продукциската база.
4. Постоечкиот `scripts/deploy.sh` продолжува да важи за понатамошни деплои.

Резултат: целата локална работа преминува 1:1 на хостингот.

---

## 6. Допири надвор од `Install/` (минимални, во согласност со CLAUDE.md)

| Датотека      | Промена                       | Причина                                                         |
| ------------- | ----------------------------- | --------------------------------------------------------------- |
| `.gitignore`  | +1 ред `Install/.env.install` | тајни не се commit-аат                                          |
| (ништо друго) | —                             | кодот, `docker-compose*.yml`, `.env.local` остануваат недопрени |

`next.config` веќе е `standalone` → **нула** промени таму. Апликацискиот код: **нула** промени за
v1.

---

## 6a. „Како апликација" — десктоп икона (developer request, 2026-08-12)

Барање: да се отвора со икона на десктоп, без терминал, но сè друго (вклучително hosting деплојот)
да остане исто. Одлука: **B + C**, автоматско палење само на клик.

- **B — app-mode прозорец (`Install/app/`):** десктоп + Start Menu икони со кириличен бренд-икон;
  кликот пали хидно (`launch-app.vbs` → `launch-app.ps1`): splash → `Ensure-Docker` → `Compose up
-d` (идемпотентно) → `Wait-Health` → отвора **Edge `--app`** во изолиран профил
  (`%LOCALAPPDATA%\Smetkovoditel\browser-profile`) — сопствен прозорец/taskbar, без адресна лента.
  `install.ps1` ги создава иконите на крај.
- **C — `Setup.exe` (`Install/installer/smetkovoditel.iss`):** Inno Setup чаробник (проверка на
  Docker, десктоп/Start Menu икони, опционо build+start, деинсталер). Inno е Unicode → кирилични
  имиња природно. Се компајлира еднаш со Inno Setup (не е committed .exe).

Технички наоди при имплементација:

- Docker пишува прогрес на **stderr** → под `EAP=Stop` руши; сите скрипти користат `EAP=Continue`
  - експлицитни `$LASTEXITCODE`.
- Windows PowerShell 5.1 бара **UTF-8 BOM** на `.ps1` за кирилица; `.env.install` се пишува **без
  BOM** (BOM би ја расипал првата променлива).
- `WScript.Shell` ги зачувува `.lnk` патеките преку ANSI codepage → кирилица станува „?"; заобиколка:
  зачувај во ASCII `%TEMP%`, па `[IO.File]::Move` во кириличното име (Unicode-safe).
- `Stop-DevStack` не се вика во дневните операции (launch/start/update) — истото project име би го
  соборило install стекот; се вика само во `install.ps1` (прв пат).

## 6b. Native апликација (Опција B — developer request, 2026-08-12)

Edge `--app` (дури и инсталиран како PWA) на developer-овата машина продолжи да ја покажува Edge
иконата во taskbar. По барање, додадена е **вистинска native апликација**:

- `Install/app/native/SmetkoApp.cs` — WinForms + **WebView2** прозорец на `http://localhost:3000`,
  наслов „Сметководител", икона поставена програмски + `/win32icon` (гарантирано наша икона, нула
  Edge chrome). WebView2 состојба во `%LOCALAPPDATA%\Smetkovoditel\webview2`.
- `build-native.ps1` — компајлира со **.NET Framework `csc.exe`** (без dotnet SDK); WebView2 SDK
  DLL-овите (Core/WinForms/Loader, net462) се committed; `SmetkoApp.exe` + копијата на иконата се
  gitignored (build артефакти). Користи го **WebView2 Runtime** што е пред-инсталиран на Win11.
- `launch-app.ps1` прво ја бара native `SmetkoApp.exe`; ако недостасува → Edge резерва. `install.ps1`
  ја гради при инсталација. Верификувано: десктоп иконата отвора native прозорец (0 Edge процеси; 6
  `msedgewebview2` render процеси од нашиот UDF).

## 7. Опсег / вон опсег

**Во опсег (v1):** `Install/` пакетот, реупотреба на постоечка база, безбеден режим (без пошта,
без Gmail), worker+cron активни, go-live export/restore патека, README.

**Вон опсег (можни follow-up ставки):** email preview преку Mailhog SMTP adapter (нов dep
`nodemailer` — бара одобрување); `MAIL_OUTBOUND=off` guard за безбеден автоматски Gmail увоз
локално; native (без-Docker) инсталер.

---

## 8. Прифатни критериуми

1. Од чист старт, `Install/install.ps1` крева работечки систем на `http://localhost:3000` со
   **постоечките податоци** видливи (43 клиенти).
2. Web и worker се изградени production контејнери со `restart: unless-stopped`.
3. Нема host-port конфликт со сестринскиот проект (minio internal-only).
4. Не се праќа никаква реална е-пошта (нема `GMAIL_*`).
5. `export-db.ps1` создава валиден `.sql` dump што се restore-ира во чиста база без грешки.
6. `.env.install` е gitignored; `_docs/architecture/MASTER_PLAN…` и `.env.local` недопрени.
7. README дава чекор-по-чекор на македонски што сопственикот може да го следи сам.

---

## 9. Ризици

- **Двоен Postgres на ист volume** → корупција. Ублажување: скриптите го симнуваат dev стекот пред
  старт; едно compose-проект име.
- **Rebuild време** (првиот build е неколку минути). Ублажување: layer cache; `start.ps1` не
  rebuild-а.
- **Заборавен безбеден режим** ако подоцна се внесат `GMAIL_*`. Ублажување: јасно предупредување во
  README + опциониот `MAIL_OUTBOUND=off` guard.
