# CLAUDE.md — GoDigital Finance OS (Сметководител)

This file is the living constitution of this repository. Claude Code reads it automatically
on every session. All rules defined here are non-negotiable unless the developer explicitly
overrides one for a specific task.

> **Fill in once:** replace `<staging-url>` / `<production-url>` / `<vps-ip>` with real values
> when the server exists. Everything else is ready to use.

---

## What This Repository Is

**GoDigital Finance OS** (internal codename **Сметководител**) is the internal financial
operating system for **АЛМА ДИЗАЈН ДООЕЛ Скопје** (brand **GoDigital**) — a Macedonian
digital marketing agency. It replaces spreadsheets and manual bookkeeping with a single
system that owns the full money cycle: monthly charging, bank-statement import + matching,
Meta Ads 1:1 re-billing, the cash ledger, contractor payroll with billable allocations,
reporting, and monthly close.

This is a **private, single-entity internal tool** used by a handful of named employees.
However, it handles **real money, VAT, invoices, and a legal fiscal/accounting trail**, so it
is engineered to the standard a regulated, customer-facing financial product requires — not
the standard of an internal spreadsheet. There is no "we'll harden this later" path.

The complete system specification is authoritative and lives in the repo:
**`_docs/architecture/MASTER_PLAN_v2.1_FINAL.md`** (data model, parsers, workflows W1–W9,
business rules B1–B18, acceptance tests T1–T14, resolved decisions D1–D6). **This is the
primary build document. When this file and the Master Plan disagree on domain behaviour, the
Master Plan wins — flag the conflict to the developer.**

### What the system covers

| Domain             | Modules                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Charging (Charges) | Monthly `INVOICE` / `CASH_OBLIGATION` / `CREDIT_NOTE` per client; numbering; PDF + email  |
| Bank import        | NLB PDF statement parsing, integrity gate, classification, matching (W2)                   |
| Meta Ads pipeline  | Gmail receipt ingestion, parse, 1:1 re-bill to clients, USD sanity-only matching          |
| Cash ledger        | Blagajna: fiscal receipts (D6), cash income/expense, mobile PWA capture (W6)               |
| Contractors        | Honorari with tax modes + billable allocations that auto-feed client invoices (D2)         |
| Payroll            | 2 salaried employees, monthly payroll runs                                                 |
| Reporting          | P&L, margin per client, aging, cash flow, accountant ZIP package (W9)                      |
| Month close        | Period locking, immutability, corrections via CREDIT_NOTE / storno (W8)                    |

### The four money flows (Master Plan §2 — the spine of the system)

```
Bank IN     → NLB statement          → invoice + повикување на број
Bank/Card OUT → NLB statement        → statement line (+ optional vendor invoice)
Cash IN     → blagajna journal       → fiscal receipt (existing device — D6) / каса-прими
Cash OUT    → blagajna journal       → каса-исплати + contract/invoice + MANDATORY photo for cash
```

**Rule #1 (non-negotiable): no movement of money without a record, no record without a document.**

### Legal / billing entity (Master Plan D1, §7.1)

```
АЛМА ДИЗАЈН ДООЕЛ Скопје
Даночен број (ЕДБ): 4032023558371
Жиро сметка:         210-0768360001-38 · НЛБ Банка АД Скопје
```

This entity data lives in configuration (`AppSettings` / seed), never hardcoded in business
logic. Logo/visual identity is delivered by the owner before the end of Phase 1.

### Repository

`https://github.com/StefanNewOne/smetkovoditel`

### Deployment target

VPS (min. 2 vCPU / 4 GB) — Nginx reverse proxy + TLS, Docker Compose, SSH deploy.
Timezone `Europe/Skopje`, locale `mk-MK`. See Master Plan §11.

---

## Model Strategy

Greenfield financial system — architecture and correctness dominate. Default to the
strongest model for design and money-touching logic.

### Model Roles

| Role       | Model             | Model ID                    | When to use                                                                 |
| ---------- | ----------------- | --------------------------- | --------------------------------------------------------------------------- |
| Architect  | Claude Opus 4.8   | `claude-opus-4-8`           | Data-model changes, parsers, matching, workflows, money math, migrations.   |
| Builder    | Claude Sonnet 4.6 | `claude-sonnet-4-6`         | Feature implementation from an approved plan, UI, CRUD, wiring.             |
| Quick edit | Claude Haiku 4.5  | `claude-haiku-4-5-20251001` | 1–5 line changes the developer explicitly labels as trivial.                |

### Switching Rule

When a request looks architectural or touches money movement, Claude Code suggests:

> "This looks like an architectural / money-touching decision — I'd run it better on Opus.
> Switch or continue?"

The developer always makes the final call. Never switch models silently.

### Written Plan Rule

For any multi-file feature, parser, workflow (W1–W9), or schema change, the architect writes
a plan in `_docs/plans/` **before** implementation begins. Implementation does not start until
the developer explicitly approves the plan.

---

## Documentation Structure

All documentation lives at the project root in `_docs/`:

```
_docs/
├── architecture/
│   ├── MASTER_PLAN_v2.1_FINAL.md   ← full system spec (SOURCE OF TRUTH for the build)
│   ├── system-overview.md          ← high-level architecture decisions (write during Ф1)
│   └── adr/                         ← Architecture Decision Records
├── plans/
│   ├── IMPLEMENTATION_PLAN.md       ← phased build plan (Ф1–Ф4) — read before starting a phase
│   └── <feature>.md                ← feature plans written before implementation begins
├── deployment/
│   ├── local.md                    ← Docker Compose local setup
│   ├── staging.md                  ← staging deploy guide + HTTPS setup
│   └── production.md               ← production deploy guide + HTTPS + backup runbook
└── design/
    └── handoff/                    ← Claude Design output — READ-ONLY for Claude Code
        ├── README.md               ← design system, screens, tokens (source of truth for UI)
        ├── finance-os-prototype.dc.html   ← interactive prototype (8 screens + 3 overlays)
        └── logo.jpg
```

Rules:

- Plans are written before implementation, never after; kept updated, never left stale.
- `_docs/architecture/MASTER_PLAN_v2.1_FINAL.md` is **read-only reference** — never edited by
  Claude Code. It is the reverse-verified spec (against real NLB statements 146/149 and 3 Meta
  invoices). Domain changes are proposed to the developer, not written into it.
- `_docs/deployment/` always includes HTTPS setup for both staging and production.
- The backlog is the source of truth for work items; `_docs/` is the source of truth for
  design and architecture.

---

## Work Tracking

This project uses a **local-first backlog** — no paid issue tracker. Work items live in
`_docs/plans/backlog.md`, each with a stable ID `SM-<N>` (Smetkovoditel).

### Item Reference Convention

When the developer references an item by ID (e.g. `SM-42`), Claude Code must:

1. Read the item in `_docs/plans/backlog.md` (title, scope, acceptance criteria) in full.
2. Cross-reference it with `_docs/architecture/MASTER_PLAN_v2.1_FINAL.md` (the relevant W/B/T
   codes) and any `_docs/plans/<feature>.md`.
3. Before writing code, confirm the understood scope if there is any ambiguity.
4. Create a feature branch `feature/SM-42-short-slug`.
5. Reference the ID in every commit footer: `Refs SM-42`.
6. Open the PR with `Closes SM-42` in the description.

### Item Types

| Situation                           | Type          | Code review / tests required |
| ----------------------------------- | ------------- | ---------------------------- |
| New functionality                   | Feature       | Yes                          |
| Scoped change to existing behaviour | Modification  | Yes                          |
| Bug found during development        | Bug           | Yes                          |
| Bug found after go-live             | Anomaly       | Yes                          |
| Refactor / DB / infra maintenance   | Maintenance   | Yes                          |
| Testing-only work                   | Testing       | No                           |
| Documentation-only                  | Documentation | No                           |

Every PR references a backlog item. No drive-by commits. Vague items are clarified before
work begins — if acceptance criteria are missing, ask the developer.

> **Fill in once:** if the agency later adopts Jira/GitHub Issues for this repo, replace this
> section with the Jira/Issues variant (branch naming and `Refs`/`Closes` conventions carry
> over unchanged) — see the sibling `GoDigital` repo for the Jira version.

---

## MCP Servers

No paid MCP connectors are required for this project. `.claude/settings.json` is committed;
`.claude/settings.local.json` is gitignored.

**Gmail is NOT an MCP integration here.** Gmail ingestion (Meta receipts + NLB statements) and
outbound invoice/reminder email run inside the application worker via the **Gmail API with an
OAuth2 offline refresh token** (Master Plan §4.1, §11) — not through a Claude MCP server. Do
not route production Gmail access through an MCP connector.

---

## Tool Permissions

| Category                 | Tools / Commands                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto-approved**        | read-only file ops, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `docker compose up`, `docker compose ps`, `git status`, `git diff`, `git log` |
| **Require confirmation** | `git push`, `git rebase`, `git merge`, any migration run, any deploy command, `rm`, any package install                                                 |
| **Forbidden**            | `git push --force` to `main` or `develop`, `rm -rf` outside the repo, modifying any `.env.*` other than `.env.example`, editing `_docs/architecture/MASTER_PLAN_v2.1_FINAL.md` or anything under `_docs/design/` |

---

## Engineering Posture

This repository moves real money and produces legal documents (invoices, fiscal cash records,
the accountant package). Every PR is judged against this standard — there is no demo-grade path.

1. **Financial integrity is structural, not aspirational.** Every денар has a defined path and
   a document. Double-billing (B15/B16) and duplicate imports (B13/B14) are made **structurally
   impossible** by unique constraints and source-ref accounting, not by careful coding.

2. **Money is `Int` денари. Float is forbidden in money math.** All amounts are integer денари
   (`5.782,00` MKD → `578200`). No `Float` columns for money, no floating-point arithmetic on
   amounts, no `number` money in TypeScript without an integer-денари contract. (B10)

3. **Audit every mutation.** Actor (userId + name), entity, action, before/after diff (JSON),
   and timestamp — written to `AuditLog` on every financial entity. Audit rows are append-only:
   no `UPDATE`, no `DELETE`.

4. **One source of truth per money flow.** Bank IN/OUT = the NLB statement. Cash = the blagajna
   journal. Never let the same movement be entered twice from two flows (Master Plan §2).

5. **Closed periods are immutable.** A `CLOSED` period cannot be edited. Corrections happen only
   via `CREDIT_NOTE` / storno in an open period (B9, W8). Never mutate posted history.

6. **Every auto-posting is traceable and reversible before close.** Auto-created Expenses,
   payments, and matches carry a source reference (`sourceRefs`, `statementLineId`,
   `contractorPaymentId`, …) and can be unwound until the period is closed.

7. **External formats never post wrong — they fall into a manual queue.** The only external
   dependencies are the Meta and NLB PDF layouts. A format change never books incorrectly; it
   drops to `PARTIAL` / `FAILED` and a human-visible queue row (Master Plan §13).

8. **Generic client-facing errors.** Stack traces never reach the browser. Detailed errors stay
   server-side, keyed by a correlation ID.

9. **Treat all client, contractor, and employee data as PII.** No PII in logs, URLs, query
   strings, error messages, or analytics. No card numbers, tax IDs, or amounts in logs.

10. **Observability per feature.** Structured JSON logs, business-event logging, correlation IDs
    across the worker/cron boundary — written with the feature, not after.

11. **Rollback path per feature.** Backwards-compatible migrations or an explicit rollback
    procedure in the PR. Deploy backs up the DB and auto-rolls back on health-check failure.

12. **No internal shortcuts.** If a control would only be acceptable for a demo (skipping the
    statement integrity gate, disabling the photo requirement, hardcoding a rate), do not take
    it. Raise it to the developer with the safer alternative and the cost trade-off.

When a shortcut is genuinely required (incident, deadline), the developer explicitly opts in
with a follow-up backlog item capturing the debt. Claude Code never takes these silently.

---

## Domain Rules (Finance OS invariants)

These encode the Master Plan's business rules (B1–B18) and resolved decisions (D1–D6). They
take precedence over generic guidance when in conflict. Every one of these is a testable
contract — see Category 6 and the acceptance tests T1–T14.

### Money & currency

- **STRICTLY MKD (D3).** Every client, every charge, every obligation is in MKD. EUR does not
  exist in the model or the flows. USD exists **only** as a sanity check on the exchange rate
  during Meta matching (`ExchangeRate`, code `USD`) — never as a billed or booked amount.
- **Amounts are integer денари (B10).** Display with `de-DE` grouping (`30.000`); store and
  compute as `Int`.
- **VAT and legal parameters are configuration (B11).** VAT is 18%; never hardcode `1.18` —
  reference a named constant / settings value. Cash clients: VAT = 0.

### Charges (the central concept — Master Plan §3)

- **Exactly one Charge per client per period per kind (B12)** — enforced by
  `@@unique([clientId, period, kind])`.
- Three kinds: `INVOICE` (numbered, +18% VAT, PDF, emailed), `CASH_OBLIGATION` (no number, no
  VAT, internal, never sent), `CREDIT_NOTE` (correction of an issued invoice).
- **Invoice numbering (B1):** format `1-{n}/{M}-{YYYY}`, where `n` is a global monthly issue
  counter assigned at `DRAFT → OPEN` (issuance), with no gaps even when drafts are cancelled.
  Uniqueness key `@@unique([seqInMonth, period])`. Year is mandatory. Payment matching accepts
  the reference with or without the year (normalized).
- **Service packages are versioned (B4).** A package/amount change creates a new
  `ServicePackage` version (`effectiveFrom`/`effectiveTo`). There is no "edit the amount" —
  edit-in-place of a monthly amount does not exist.
- **Overpayment → `creditBalance` → auto-applied** to the next Charge (B18).
- Cash↔invoice channel switch for a client requires ЕДБ (B17); history is never altered.

### Billable pass-through (Meta Ads + Actors — B15/B16, D2)

- A billable `Expense` of type `ADS`/`ACTORS` **must** have a `clientId`; otherwise it is
  blocked (B2).
- An ADS/ACTORS invoice line equals **Σ of its `sourceRefs`**, and **each Expense is billed at
  most once** — protected by `billedOnLineId` (B15). Re-running W1 never re-bills an Expense.
- Actor line items are generated **automatically** from contractor honorar allocations (D2):
  a billable allocation on an `isTalent` contractor creates **exactly one** billable
  `Expense(ACTORS)` (B16). No double entry — one honorar calculation feeds the blagajna, the
  client invoice, and the per-client margin at once.

### Cash ledger (blagajna — W3, W6)

- **Blagajna is never negative (B3).**
- **A cash expense without a photo is blocked (B5).** Card/bank expenses: photo optional (B6) —
  the statement is the record.
- Cash payout to a contractor requires a `Contractor` record + document (B7).
- Fiscal receipt numbers come from the **existing fiscal device, entered manually** (D6) — the
  system records the number, it does not integrate with the device in v1.
- The mobile cash-expense capture (W6) is atomic: `Expense` + `CashLedgerEntry` + photo in a
  single transaction, or nothing.

### Bank import & matching (W2 — Master Plan §4)

- **Statement integrity is a blocking gate (B14):** `opening + credit − debit == closing`,
  `parsed lines == order count`, and continuity (`this.opening == previous.closing`). Any
  failure → `FAILED`, **zero postings**, alarm.
- **Duplicate statement/line is silently skipped and logged (B13).** Dedupe: whole statement by
  `(account, statementNumber)`; line by `lineHash`. The same file imported N times yields 0
  duplicates.
- Meta matching key is `referenceNumber == FACEBK code` — **only that.** Name match is
  secondary confirmation, never a condition. USD/MKD rate sanity within ±6% → clean match;
  outside → warning + manual confirm. The booked and re-billed amount is the **MKD from the
  statement, 1:1** (never the USD).
- PDF is the primary statement format (D4); parsing is an **adapter pattern** (`format` field) —
  an XML/CSV adapter can be added later without touching the rest of the system.

### People & payroll (W5)

- `NO_WITHHOLDING` tax mode is allowed **only** with `CONTRACTOR_INVOICE` + an actual invoice
  (B8).
- Contractor payment allocations are `[{clientId, amount, billable}]` (D2).

### Import routing (W2 / §4.1)

- One Gmail mailbox receives both Meta receipts and NLB statements. Routing is by
  sender/filename (`Transaction__*` → Meta parser; `DpsStatement*` → NLB parser). Dedupe by
  Gmail Message-ID. Each message is labelled Processed/Failed in Gmail — idempotent and visible.

---

## Category 1 — Git & Versioning

### Branch Strategy

```
main    → production (Release PR only)
develop → staging (feature PRs only)
feature/SM-<N>-<name>  → feature work
bugfix/SM-<N>-<name>   → bug fixes
hotfix/SM-<N>-<name>   → emergency production fixes
```

No direct commits to `main` or `develop`. Ever.

### Two Mandatory PR Gates

**Gate 1 — Feature → Develop (code review)**
- Developer opens a PR from `feature/*` into `develop`.
- Local checks must pass before merge: the `pre-push` hook (lint / typecheck / build) plus
  `npm test` with the Docker stack up (see Category 5). There is no hosted CI.
- Single-developer team: the developer reviews and merges. Reviewer requirement is added on
  team growth. This is the primary code-review checkpoint.

**Gate 2 — Release → Main (production checkpoint)**
- Developer opens a PR from `develop` into `main`; bumps the version manually (below).
- Developer reviews, merges, then runs `bash scripts/deploy.sh production`.
- Prerequisite: staging (`develop`) must be deployed and verified stable first.

### Commit Standard — Conventional Commits

```
<type>(<scope>): <short description>

[optional body — explain why, not what. wrap at 72 chars]

Refs SM-<N>
[optional footer: Closes SM-<N> | BREAKING CHANGE: description]
```

**Types:**

| Type                                                                  | Version bump |
| --------------------------------------------------------------------- | ------------ |
| `feat`                                                                | MINOR        |
| `fix`                                                                 | PATCH        |
| `perf`                                                                | PATCH        |
| `feat!` or `BREAKING CHANGE`                                          | MAJOR        |
| `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore`, `revert` | none         |

**Short description rules:** imperative mood (`add` not `added`), lowercase first letter, no
trailing period, under 72 chars, specific (`fix(import): handle NLB continuity gap on skipped
statement` not `fix: bug`).

**Scopes (defined in `commitlint.config.js`):**

```
charges  invoices  clients  packages  cash  blagajna
import   parser     matching  meta-ads  bank  contractors
payroll  reports    close     settings  auth  worker  cron
db       infra      ci        docs      ui    pdf
```

### Commit Toolchain (always installed)

- **Husky** — git hooks, committed in `.husky/`
- **commitlint** — validates format via `commit-msg`
- **lint-staged** — linters on staged files via `pre-commit`
- **commitizen** — interactive `npm run commit`

Use `npm run commit` instead of `git commit`. Use `--no-verify` only for genuine emergencies;
never a habit.

### Versioning (manual)

Bump the version when cutting a release: edit `version` in `package.json`, summarize the merged
`feat`/`fix` commits in `CHANGELOG.md`, and tag the merge commit on `main`
(`git tag vX.Y.Z && git push origin vX.Y.Z`).

---

## Category 2 — Environments & Docker

### Three Tiers

```
local (Docker, localhost) → staging (<staging-url>) → production (<production-url>)
```

Each tier has its own configuration. Configs are never shared or mixed.

### Environment Config Files

```
.env.example    ← committed, documents ALL variables, no real values
.env.local      ← gitignored, local development values
.env.staging    ← lives in deploy secrets only, never committed
.env.production ← lives in deploy secrets only, never committed
```

Every new environment variable must be added to `.env.example` with a placeholder and a
comment. No exceptions.

### Local Docker Stack

`docker compose up` starts the entire local stack behind Nginx on `localhost`. Single command.

| Role                | Service                       | Tool                     |
| ------------------- | ----------------------------- | ------------------------ |
| Primary database    | PostgreSQL 16                 | `postgres:16-alpine`     |
| App (web + API)     | Next.js (App Router) + Prisma | `apps/web`               |
| Worker              | Gmail polling + PDF parsing   | `apps/worker`            |
| Cron                | W1 (charges), W7 (rate)       | `apps/worker` (scheduler)|
| Object storage      | MinIO (S3-compatible)         | `minio/minio`            |
| Mail capture (local)| Mailhog                       | `mailhog/mailhog`        |
| Reverse proxy       | Nginx                         | `nginx:alpine`           |

**Architecture (Master Plan §11):** a Next.js full-stack app (server actions / route handlers
+ Prisma) is the primary surface; a separate **worker** process handles Gmail ingestion, PDF
parsing, and matching; a **cron** scheduler runs W1 (1st of month 06:00) and W7 (daily 07:00).
Attachments are stored on a local volume (MinIO locally) with a **daily offsite backup**;
retention ≥ 10 years.

**Auth:** session-based, app-managed (few static employees) — not an external IdP. Store
sessions in Postgres/Redis; hash passwords with bcrypt. Re-validate role at the server action /
route handler, never trust the client.

### HTTP / HTTPS

- Local: plain HTTP only.
- Staging / Production: HTTPS required — Let's Encrypt via Certbot on the VPS. Documented in
  `_docs/deployment/staging.md` and `production.md`.

---

## Category 3 — Secrets & Security

1. **No hardcoded secrets** — no keys, passwords, tokens, or credentials in source. Including:

```
DATABASE_URL              PostgreSQL connection string
SESSION_SECRET            session signing
GMAIL_CLIENT_ID           Gmail API OAuth2 (ingestion + outbound)
GMAIL_CLIENT_SECRET       Gmail API OAuth2
GMAIL_REFRESH_TOKEN       offline refresh token (ingestion mailbox)
GMAIL_SENDER              from-address for invoices/reminders
CRON_SECRET               HTTP-triggered cron endpoints
NBRM_RATE_URL             НБРМ USD mid-rate source (W7)
S3_ENDPOINT / S3_KEY / S3_SECRET   object storage (attachments)
BACKUP_TARGET             offsite DB/attachment backup destination
```

2. **Environment variables only** — all secrets loaded from `.env.*`, validated at startup with
   **Zod**. The app refuses to start if a required secret is missing.
3. **Secret scanning** — `gitleaks` runs as a `pre-commit` hook. A commit containing a detected
   secret is blocked immediately.
4. **OAuth tokens & credential files** live outside the web root, referenced by path/env; never
   committed.
5. **HTTPS on servers** — always on staging and production, documented in `_docs/deployment/`.
6. **No secrets in the backlog / prompts** — reference secret names, never values. Never hand
   Claude Code real credentials in a prompt.

---

## Category 4 — Developer Communication

Claude Code must pause and ask the developer before:

1. **Architectural decisions** — two valid approaches with lasting impact.
2. **Scope expansion** — if implementing X reveals Y also needs changing.
3. **Destructive operations** — dropping tables, deleting files, force-pushing, resetting
   branches, hard-resetting environments.
4. **Ambiguous requirements** — a plan or backlog item with two reasonable interpretations, or
   any conflict with the Master Plan.
5. **New dependencies** — before adding any new package.
6. **Deployment environment** — before preparing any staging or production configuration.
7. **Anything touching money math, matching, numbering, or period close** — even from a clear
   plan, restate the invariant being upheld before writing code.

Claude Code should NOT ask about:
- Implementation details that follow directly from an approved plan or clear acceptance criteria.
- Formatting or naming within established conventions in this file.
- Decisions already defined here or in the Master Plan.

---

## Category 5 — CI/CD Pipeline

**Local-first.** There is no hosted CI. The quality gate runs as a Husky `pre-push` hook;
deploy runs from a trusted machine that can reach the VPS. The VPS pulls source from GitHub
(repo hosting is free).

### Quality Gate (local, on every push)

`.husky/pre-push` runs and blocks the push on any failure:

```
lint → typecheck → build
```

Full tests need Docker Postgres, so run them with the stack up before merging:

```
docker compose up -d
npm test
```

`commit-msg` (commitlint) and `pre-commit` (lint-staged + gitleaks) hooks enforce commit format
and staged-file linting as before.

### Deploy Method

Manual, from a machine whose IP the VPS allows:

```
bash scripts/deploy.sh staging      # deploys origin/develop → <staging-url>
bash scripts/deploy.sh production   # deploys origin/main    → <production-url>
```

The script: **backup DB → capture pre-deploy HEAD → `git reset --hard origin/<ref>` →
`docker compose -f docker-compose.prod.yml up -d --build` → reload nginx →
`prisma migrate deploy` → in-container health check → rollback (git + DB restore) on failure.**
Credentials (`VPS_IP`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY`) are read at runtime from
`.env.production`, never committed. Staging must be verified before production.

---

## Category 6 — Testing Standards

### Rules

- Every feature ships with its tests in the same PR — unit, integration, and (where relevant)
  E2E, written alongside the feature.
- Coverage target: **80% for money/parsing/matching code**, **60% for UI**. Financial logic is
  the highest priority; UI can trail.
- Tests must be meaningful — they verify behaviour, not just that they pass. Tautological tests
  are rejected.

### Golden-file fixtures (non-negotiable for parsers/matching)

The **real documents** are committed as test fixtures (Master Plan §11, §13): NLB statements
**146 and 149** and the **3 Meta invoices**. Every parser and matcher runs against these.
A format regression must fail a golden-file test before it can reach `develop`.

### Acceptance tests = definition of done

The Master Plan acceptance tests **T1–T14** are the definition of "done" for the parsers,
matching, and W1. A parser/matching/charging PR is not complete until its corresponding T-test
passes. Examples: T1 (statement 146 + receipt `FQ99UUHFD2` → `AUTO_MATCHED`, Expense ADS 86.500
денари), T4 (statement 149 balance `35.473 − 17.175 == 18.298`, 7 == 7 orders), T9 (invoice
client 30.000 → 35.400 with VAT, number `1-{n}/7-2026`), T12 (same ADS Expense in two W1 runs →
excluded the second time via `billedOnLineId`), T13/T14 (actor allocation → one ACTORS Expense,
a second is structurally impossible).

### Test Types & Tools

| Type        | Scope                                        | Tool                              |
| ----------- | -------------------------------------------- | --------------------------------- |
| Unit        | Money math, parsers, classification, numbering| **Vitest**                        |
| Integration | Real PostgreSQL (Docker), workflows W1–W9     | **Vitest** + Testcontainers/Docker|
| E2E         | Full user flows (charge → approve → PDF)      | **Playwright**                    |

### Coverage Priority (in order)

1. NLB statement parser + integrity gate (B13/B14, T2–T4)
2. Meta receipt parser + matching (T1, T6–T8)
3. W1 charge generation + invoice numbering (B1/B12, T9/T10)
4. Billable pass-through / no double-billing (B15/B16, T12–T14)
5. Cash ledger atomicity + photo gate (B3/B5, T11)
6. Period close immutability (B9, W8)

---

## Category 7 — Code Quality & Linting

1. **Formatter** — **Prettier** for all JS/TS/JSON/CSS. Auto-applied via lint-staged.
   `.prettierrc` committed. No manual formatting debates.
2. **Linter** — **ESLint** with `@typescript-eslint/recommended`. Errors block merge.
3. **Strict typing** — TypeScript `strict: true` everywhere. No `any`. No `@ts-ignore` without a
   comment explaining why.
4. **Money type discipline** — money is integer денари at the type level. Never introduce a
   `number` that mixes денари and cents, and never a `Float` money column. Parse/format денари
   only at the boundary (a single `money.ts` helper).
5. **Shared Zod schemas** — all API input/output and parser-output schemas are the single source
   of truth; backend validates with them, frontend infers types from them.
6. **Dead code** — unused imports, variables, functions removed before merge.
7. **TODO format:**
   ```typescript
   // TODO(scope): description — SM-<N>
   // TODO(matching): add fuzzy fallback for client payment reference — SM-15
   ```
8. **Macedonian vs English in code** — all identifiers, variable names, function names, and
   comments are in **English**. All user-facing strings (UI labels, invoice text, email bodies,
   toasts) are in **Macedonian (Cyrillic)**, verbatim from the design handoff / Master Plan.
   Never mix languages in identifiers. Never translate UI copy to English.

---

## Category 8 — Database Migrations

1. **Immutable** — never modify a committed migration. Create a new one.
2. **Reversible** — review the generated SQL (`up`/`down`) before committing.
3. **Auto-run on deploy** — `prisma migrate deploy` runs from the deploy script, never by hand
   on a live box.
4. **Live in the repo** — migration files versioned alongside the code, in the same PR.
5. **Failed migration = blocked deploy** — a migration failure on staging blocks the production
   Release PR.
6. **Never run against shared environments** without explicit developer confirmation. Local
   Docker DB is fine; staging and production are confirm-required.

### ORM: Prisma

Schema: `prisma/schema.prisma` — **the schema is defined in Master Plan ДЕЛ II and must be used
literally.** All enums, models, and constraints (`@@unique([clientId, period, kind])`,
`@@unique([seqInMonth, period])`, the `@unique` dedupe keys on `AdSpendReceipt` /
`StatementLine.lineHash`, etc.) come straight from the Master Plan.

### Key migration rules for this project

- **Money columns are `Int` денари.** No `Float`/`Decimal` for amounts. `ExchangeRate.midMkd` is
  the only `Float` (a rate, not money) and is USD-only.
- **The dedupe/uniqueness constraints are load-bearing** — they are what make duplicate imports
  (B13) and double-billing (B15/B16) structurally impossible. Never relax one to "make a test
  pass."
- **`AuditLog` is append-only** — no `UPDATE`/`DELETE` grants in the app DB role.
- **Period rows gate mutability** — writes to entities in a `CLOSED` period are rejected at the
  application layer (B9).

---

## Category 9 — Logging & Error Handling

1. **Structured JSON logging** — **Pino**. No `console.log` in production code.
2. **Log levels:** `error` (broke, needs attention) · `warn` (unexpected but recoverable, e.g.
   rate sanity out of ±6%, statement continuity gap) · `info` (significant business events) ·
   `debug` (dev only).
3. **Never log sensitive data** — no passwords, session tokens, tax IDs, card numbers, client
   names in error contexts, or raw amounts tied to a named party.
4. **Every error log includes:** `message`, `stack`, `userId` (if authed), `route`,
   `correlationId` (UUID per request), `timestamp` (ISO 8601).
5. **Client-facing errors** — generic messages only; details stay server-side keyed by
   `correlationId`.
6. **Finance-OS business events (always `info`):**
   ```
   charge.created  charge.approved  charge.paid  charge.creditNoted
   invoice.numbered  invoice.pdf.generated  invoice.emailed  reminder.sent
   import.received  import.parsed  import.failed  import.duplicateSkipped
   statement.integrity.passed  statement.integrity.failed
   line.classified  match.auto  match.manual  match.alarm
   metaReceipt.parsed  metaReceipt.partial
   cash.entry.created  cash.expense.blockedNoPhoto  cash.stocktake
   contractor.paid  actors.expense.created
   payroll.run  period.closed  accountantPackage.exported
   ```

---

## Category 10 — API Documentation

- Every server route / server action documented via an **OpenAPI 3.1** spec generated from the
  shared Zod schemas.
- Accessible locally at `http://localhost:3000/api/docs`.
- Kept up to date in the same PR as the endpoint change.
- API versioning: `/api/v1/` prefix on route handlers.

---

## Category 11 — Dependency Management

- **Justify every new dependency** — reason stated in the PR.
- **Security patches applied promptly.**
- **Dependabot enabled** — flags outdated/vulnerable packages.
- **Prefer well-maintained packages** — widely adopted, active, clear license.

### Approved core dependencies (do not replace without a plan)

```
next@15               full-stack app (App Router)
react@19              UI
typescript@5          strict typing
prisma@6              ORM — schema is source of truth
zod@3                 validation + shared schemas
pino@9                structured logging
tailwindcss@4         styling (design tokens from handoff)
@radix-ui/*           accessible UI primitives
lucide-react          icons (replace prototype unicode placeholders)
@tanstack/react-query@5   server state (client components)
react-hook-form@7     forms (client wizard)
date-fns@3 (tz)       dates in Europe/Skopje
googleapis            Gmail API (ingestion + send)
pdf-parse / pdfjs     NLB + Meta PDF text extraction (parser adapters)
@react-pdf/renderer   invoice PDF generation (Cyrillic-capable, server-side)
bcryptjs@3            password hashing
node-cron@3           in-process scheduler (W1, W7)
vitest / @playwright/test   testing
```

**PDF fonts:** invoice generation must embed a **Cyrillic-capable font** (e.g. the same
**Manrope** used in the design, or a serif for the invoice body). Never rely on a default font
that drops Cyrillic glyphs (Master Plan §7).

---

## Category 12 — Human Oversight

No code reaches `main` without explicit human approval.

- Every PR gets a human review.
- Every merge is a human action.
- Any scope decision belongs to the developer, not to Claude Code.
- Any change to money math, matching, numbering, or period close is reviewed line-by-line.

---

## Category 13 — Design Handoff Protocol

Frontend work is design-driven. The design handoff produced by **Claude Design** lives at
`_docs/design/handoff/` and is **authoritative and read-only** for Claude Code.

### Contents

```
_docs/design/handoff/
├── README.md                       ← design system, tokens, all 8 screens + 3 overlays, interactions
├── finance-os-prototype.dc.html    ← interactive HTML prototype (open in a browser)
└── logo.jpg                        ← brand logo
```

The prototype is a **design reference in HTML**, not production code. The task is to rebuild
these screens in the target stack (Next.js + Prisma + Postgres, Docker on VPS) with proper
patterns. High-fidelity: colors, typography, spacing, copy, and interactions are final intent —
rebuild pixel-close.

### Pre-implementation Checklist

Before writing any frontend code, Claude Code must:

1. Read `_docs/design/handoff/README.md` in full (design tokens + the target screen).
2. Open/inspect `finance-os-prototype.dc.html` for the exact layout and interaction of that
   screen.
3. If a screen's design is missing, warn the developer rather than inventing UI:
   > "No handoff coverage for `<screen>` in `_docs/design/handoff/`. Design is normally produced
   > by Claude Design before implementation. Proceed with a best-effort layout, or wait for the
   > handoff?"

### Design tokens (from the handoff — the source of truth)

- Font **Manrope** (400–800), Cyrillic-capable.
- App bg `#f6f8fb` · cards `#fff` border `1px #e7ecf3` radius 14px.
- Text primary `#1a2333` · secondary `#5b6878` · muted `#8a97ab`.
- Accent (brand blue) `#3b76d1` · hover-tint `#eef4fd` · border-tint `#d3e0f4`.
- Semantic: success `#4caf7d` · danger `#c2483f` · warning `#e8a33d`.
- Status badge map: DRAFT grey · OPEN blue · PARTIAL yellow · PAID green · OVERDUE red.

### Rules

- **Tokens are the source of truth** — never hardcode a color, spacing, radius, or font size
  covered by the handoff. Reference the CSS variable / Tailwind token.
- **The prototype is the tiebreaker** — where spec and prototype differ on look/behaviour, the
  prototype wins. Deviations require developer sign-off.
- **Macedonian UI copy is verbatim** — do not translate, paraphrase, or invent copy. All strings
  go through the i18n layer; no hardcoded literals scattered in components.
- **Claude Code never edits handoff files** — `_docs/design/` is read-only. Changes go back to
  Claude Design.

### Who Does What

| Actor         | Owns                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| Claude Design | The handoff (`_docs/design/handoff/`) — tokens, screens, interactions.      |
| Claude Code   | Rebuilding screens in the target stack; wiring to the data model & workflows.|
| Developer     | Sign-off on any deviation from the handoff; final merge.                     |

---

## Category 14 — UI Completeness

Every screen from the handoff ships in a known, honest state. **Silent stubs are forbidden.** A
handler whose body is only `console.*` / an empty function is not a valid v1 implementation.

Every interactive element must be one of:

| Status                  | Meaning                                                        | Generates acceptance criterion                                   |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `works`                 | Fully functional in v1.                                       | Functional AC ("clicking X performs Y").                         |
| `hidden`                | Gated by a feature flag / permission. Not rendered.           | Visibility AC ("X does not render for role R").                  |
| `disabled-with-tooltip` | Visible but greyed; tooltip explains why.                     | Visual AC ("X renders disabled with the documented tooltip").    |
| `stub-with-toast`       | Visible/tappable; surfaces an explicit "coming soon" toast.   | Behavioural AC ("clicking X surfaces the documented toast").     |

The prototype already models this: "future" actions (Попис, multi-upload, Книжно одобрение, ZIP)
surface an explanatory toast referencing the rule. In production those become real screens per
the Master Plan — do not ship them as silent no-ops.

**Pre-flight question:** _If I removed every backend section, could a reviewer still tell whether
each button works in v1?_ If not, the state isn't declared.

---

## Category 15 — Money & Financial Correctness

The rules that make this a financial system rather than a CRUD app. These extend the Domain
Rules with implementation-level guardrails.

1. **`money.ts` is the only place денари are parsed or formatted.** Input `5.782,00` → `578200`;
   display `578200` → `5.782,00` (`de-DE` grouping). No ad-hoc parsing/formatting in components
   or routes.
2. **VAT is computed from a named constant / setting, never a literal `1.18`/`0.18` inline.**
   Cash charges carry VAT = 0.
3. **Invoice numbers are assigned server-side, atomically, at issuance** (`DRAFT → OPEN`) using a
   single global monthly counter — no gaps, no client-side generation (B1). The counter migrates
   forward from the last real number at go-live.
4. **Matching writes are idempotent** — re-processing the same statement/receipt never creates a
   second Expense/Payment (B13/B15). Assert this with a test that imports the same fixture twice.
5. **Every auto-posting carries its source reference** (`sourceRefs`, `statementLineId`,
   `cashEntryId`, `contractorPaymentId`, `adSpendReceiptId`) and is reversible until the period
   closes.
6. **Writes to a `CLOSED` period are rejected at the service layer** with a typed error, not a
   500. Corrections go through `CREDIT_NOTE` / storno.
7. **Transactions are atomic.** Cash capture (`Expense` + `CashLedgerEntry` + photo), payment +
   match, and honorar (payout + blagajna entry + billable ACTORS Expense) each commit fully or
   not at all — one Prisma `$transaction`.

---

## Category 16 — Import & Parsing Discipline

1. **Parsers are adapters** keyed by `format` (Master Plan §4.2). v1 = `NLB_PDF` and the Meta
   receipt parser. A new bank/format is a new adapter, never a rewrite.
2. **Integrity gate before any posting** (B14). If `opening + credit − debit != closing`, or
   `parsed lines != order count`, or continuity breaks — mark `FAILED`, post nothing, alarm.
3. **Dedupe is layered and silent** (B13): statement `(account, statementNumber)`; line
   `lineHash`; Meta receipt by Gmail Message-ID + `transactionId` + `metaInvoiceNo` +
   `referenceNumber`. Duplicates are skipped and logged, never surfaced as errors.
4. **Incomplete parse → `PARTIAL` / `FAILED` → manual queue row with the source PDF preview.**
   Never guess missing fields.
5. **Classification is by priority** (Master Plan §4.2): META_ADS → CARD_TX → CLIENT_PAYMENT →
   BANK_FEE → OTHER. Unmatched client payments fall back to a fuzzy amount+history *suggestion*,
   never an automatic match.
6. **The booked amount is always the MKD from the NLB statement, 1:1.** USD is used only for the
   ±6% rate sanity check; it is never booked or billed.
7. **Gmail processing is idempotent and visible** — dedupe by Message-ID, label Processed/Failed
   in the mailbox. Re-polling the same message does nothing.

---

## Skills

When a task matches an available skill, use it rather than improvising — skills are consulted
**before** writing code, never after. Relevant here: `/init` (docs), `/code-review` and
`/security-review` (before merging money-touching or auth code), `/verify` and `/run` (drive the
app to confirm a workflow end-to-end), `/simplify` (post-implementation cleanup).

---

_This file is the living constitution of the GoDigital Finance OS (Сметководител) project._
_Last updated: 2026-07-17_
_Stack: Next.js 15 + React 19 + TypeScript + Prisma + PostgreSQL + Tailwind, Docker on VPS._
_Domain spec: `_docs/architecture/MASTER_PLAN_v2.1_FINAL.md` (v2.1 FINAL) — authoritative._
