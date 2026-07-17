# Completion & Full Test Coverage Plan

**Status:** draft for developer approval · **Owner:** Александар Кекиќ · **Date:** 2026-07-17
**Domain source of truth:** `_docs/architecture/MASTER_PLAN_v2.1_FINAL.md`
**Goal:** close the remaining backlog to `☑`, codify every acceptance test (T1–T14) and
business-rule invariant (B-codes) as committed automated tests, and finish infra/deploy
scaffolding — so the system is complete and green from a clean checkout.

This plan supersedes nothing in the Master Plan; where they differ, the Master Plan wins.

---

## Locked decisions (developer, 2026-07-17)

| #   | Decision        | Choice                                                                                                                                                                                                            |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-a | Build order     | **Tests first** — codify T1–T14 + B-invariants as regression before touching feature code, then build the remaining features (each with its tests in the same PR).                                                |
| D-b | SM-30 Gmail     | **Build the code behind an interface + mock/Mailhog tests.** Live OAuth connection deferred to go-live (no real secrets in prompts).                                                                              |
| D-c | Golden fixtures | **Redacted committed fixtures.** Sanitized `.txt` (names/accounts/amounts altered, format + key codes preserved) committed as vitest golden fixtures; the real 146/149 + 3 Meta receipts stay local & gitignored. |
| D-d | Infra/deploy    | **Prepare with placeholders.** Dockerfiles, `docker-compose.prod.yml`, `deploy.sh`, Nginx/Certbot docs written now with `<vps-ip>`/`<url>` placeholders; developer fills real values at go-live.                  |

---

## Current state (baseline)

- **Committed automated tests:** 16 Vitest (money 5, period 4, parsers 7) in `packages/shared`. Green.
- **Verified LIVE-only (not codified):** Ф1 20/20, Import 19/19, golden 19/19 (local script `_fixtures/golden.ts`, gitignored data).
- **No integration (Testcontainers) or E2E (Playwright) tests exist.**
- **Missing features:** SM-30 (Gmail worker), SM-37 (W7 rate cron), SM-50 email reminders (dep SM-30). Partial infra: SM-2 gitleaks, SM-3 Dockerfiles, SM-5 RBAC+audit middleware, SM-7 prod compose/Nginx.
- **Wiring facts:** all workflows/services use the Prisma singleton `import { prisma } from "@smetko/db"`; schema at `packages/db/prisma/schema.prisma`; seed at `packages/db/prisma/seed.ts`. Worker (`apps/worker/src/index.ts`) is a cron scheduler that triggers guarded HTTP endpoints; Gmail/W7 are currently stub logs.

---

## Work packages

Ordered by D-a (tests first). Each WP is one branch/PR referencing its `SM-<N>`.

### WP0 — Integration test harness (enables SM-20, SM-38)

New backlog: **SM-20** (was ◐). Foundation for all integration tests.

- Add `vitest` + a `vitest.config.integration.ts` to `apps/web` (tests importing workflows live here).
- **DB strategy:** Testcontainers Postgres (`@testcontainers/postgresql`) — _new dep, needs confirmation_. `globalSetup` starts an ephemeral PG 16 container, runs `prisma migrate deploy`, seeds the entity/settings baseline, and `provide()`s the connection string; a `setupFiles` sets `process.env.DATABASE_URL` **before** any `@smetko/db` import so the singleton binds to the test DB. Per-test isolation via truncate-between-tests helper.
- Fallback if Docker socket is unavailable on the dev box: point at the compose Postgres (`5434`) on a dedicated `smetko_test` database (matches CLAUDE.md "`docker compose up -d && npm test`").
- Root `npm test` runs shared unit tests; new `npm run test:integration` runs the apps/web suite.
- **DoD:** one smoke integration test creates a client and reads it back against real Postgres.

### WP1 — Ф1 acceptance tests (SM-20 core)

Codify the LIVE-verified Ф1 as committed integration tests:

- **T9/T10** — W1: client 30.000 → INVOICE DRAFT +18% VAT = 35.400; approve → number `1-{n}/7-2026`, atomic, no gaps even when a draft is cancelled (B1); one Charge per client/period/kind (B12); `creditBalance` auto-apply (B18).
- **T11** — W6 cash expense: photo present → atomic `Expense`+`CashLedgerEntry`; **no photo → blocked (B5)**; blagajna never negative (B3).
- **T12/T13/T14** — billable pass-through: honorar billable allocation on `isTalent` → exactly one `Expense(ACTORS)` (B16); W1 sums unbilled billable Expenses; re-run W1 excludes already-billed via `billedOnLineId` (B15); a second ACTORS booking is structurally impossible.
- W3 cash collection atomicity; W5 tax modes incl. B8 (`NO_WITHHOLDING` only with `CONTRACTOR_INVOICE`).
- **DoD:** T9–T14 + B1/B3/B5/B8/B12/B15/B16/B18 green in CI-from-clean.

### WP2 — Parser & matching tests, committed golden (SM-38)

- **Redacted golden fixtures** (D-c): create sanitized `_fixtures/golden/*.txt` committed to the repo; port `_fixtures/golden.ts` into a real vitest golden test (`packages/shared`). Keep the local real-doc script working via a gitignored path override.
- **Matching (T7) integration test** — `runMatching`: receipt `referenceNumber == FACEBK` only; USD/MKD ±6% sanity (clean vs warning); booked amount = MKD from statement 1:1; auto `Expense(ADS, isBillable = clientId != null)`; **idempotent** (import same fixture twice → 0 duplicates, B13; re-match → no second Expense, B15). Alarms: receipt without line >7d; FACEBK line without receipt.
- Statement integrity gate hard cases (B14): balance mismatch, `parsed != order count`, continuity gap → `FAILED`, zero postings.
- **DoD:** T1–T8 (golden) + T7 (matching) green committed; duplicate-import idempotency asserted.

### WP3 — Period close & immutability tests (W8/B9)

- `getCloseBlockers` enumerates all blockers; `closePeriod` flips to `CLOSED`; writes to a closed period rejected at the service layer with a **typed error** (not a 500) via `assertPeriodOpen` (B9); corrections only via CREDIT_NOTE/storno (SM-53).
- **DoD:** close happy-path + every blocker + closed-period write-rejection green.

### WP4 — Reports & W9 package tests (SM-72 hardening)

- P&L, per-client margin, aging buckets, cash flow numeric correctness on a seeded month; W9 ZIP has the 6 sections + xlsx; margin cross-check for 3 clients (matches SM-72 DoD) as an automated assertion.
- **DoD:** report math + package structure asserted.

### WP5 — SM-37 W7 exchange-rate cron

- НБРМ USD mid fetch → `ExchangeRate` (USD-only `Float` rate, never money); daily 07:00; fallback + `warn` when stale >3 days; guarded HTTP endpoint wired into worker (replace the stub log). Uses `NBRM_RATE_URL` env (add to `.env.example`).
- **Tests:** parser of the НБРМ response (fixture), staleness/fallback, endpoint auth. No live network in tests.
- **DoD:** W7 posts a rate from a fixture; stale path warns; `.env.example` updated.

### WP6 — SM-30 Gmail ingestion worker (code + mock tests, D-b)

- `GmailClient` interface (list, getAttachment, addLabel) with a real `googleapis` impl (approved core dep) and an in-memory fake for tests.
- Poller: download PDF attachments → route by sender/filename (`Transaction__*` → Meta, `DpsStatement*` → NLB) → call `ingestReceipt`/`ingestStatement` → dedupe by Gmail Message-ID → label Processed/Failed. Idempotent (re-poll same message = no-op).
- **Tests (mock/Mailhog):** routing table, Message-ID dedupe, PARTIAL/FAILED labelling, idempotency. Live OAuth path guarded by env, untested (deferred to go-live).
- **DoD:** ingestion pipeline green against the fake client; worker stub log replaced.

### WP7 — SM-50 email reminders (dep WP6)

- W4 already marks OVERDUE; add reminder send at due+7/+21 and OVERDUE at +30 via the Gmail send path (`GMAIL_SENDER`); CASH_OBLIGATION = internal notification only.
- **Tests:** schedule selection (which charges get which reminder) against seeded due dates; send routed through the fake mail client.
- **DoD:** correct reminder tiering asserted; no live send in tests.

### WP8 — SM-5 RBAC + AuditLog middleware

- Server-side role guard helper enforced at every mutating server action / route handler; audit-log middleware so every financial mutation writes `AuditLog` (actor, entity, before/after diff) — append-only.
- **Tests:** role rejection (wrong role → typed 403, not 500); audit row written on a representative mutation with correct diff.
- **DoD:** guard + audit asserted; AuditLog append-only respected.

### WP9 — E2E (Playwright)

New dep `@playwright/test` (approved core dep, needs install confirmation). Core flows:

- Login → dashboard; client onboarding wizard (VAT preview, ЕДБ gate B17); run W1 → approve → invoice PDF; cash collection; mobile cash-expense photo gate; month close blockers.
- **DoD:** the Master Plan "whole monthly cycle by hand" path is green E2E against the Docker stack.
- Coverage target per CLAUDE.md Cat 6: 80% money/parsing/matching, 60% UI.

### WP10 — Infra & toolchain (SM-2, SM-3, SM-7) — placeholders (D-d)

- **SM-2:** `gitleaks` pre-commit hook.
- **SM-3:** `apps/web` + `apps/worker` Dockerfiles (multi-stage, non-root).
- **SM-7:** `docker-compose.prod.yml`, complete `scripts/deploy.sh` (backup → capture HEAD → reset → build → nginx reload → `migrate deploy` → health check → rollback), `_docs/deployment/{staging,production}.md` with Nginx + Certbot/HTTPS. All infra values as `<placeholders>`; `.env.example` kept complete.
- **DoD:** `docker build` succeeds for both images; deploy script lints/dry-runs; docs complete. No real VPS contact.

---

## Sequencing

```
WP0 → WP1 → WP2 → WP3 → WP4        (codify existing behaviour as regression — D-a "tests first")
        ↓
WP5 (W7) → WP6 (Gmail) → WP7 (reminders)   (build remaining features + their tests)
        ↓
WP8 (RBAC/audit) → WP9 (E2E) → WP10 (infra)  (hardening + scaffolding)
```

Each WP is committed on its own `feature/SM-<N>-slug` branch into `develop` with tests in the
same PR (CLAUDE.md Cat 6). Money/matching/numbering/close changes get the invariant restated in
the PR (Cat 4 #7) — but WP1–WP4 mostly _observe_ existing logic, not change it.

## New dependencies (require confirmation before install — CLAUDE.md Cat 4/11)

| Package                                         | WP  | Justification                                                                                                 |
| ----------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------- |
| `@testcontainers/postgresql` + `testcontainers` | WP0 | Ephemeral real-Postgres for integration tests (Cat 6 names Testcontainers). Fallback: compose DB, no new dep. |
| `@playwright/test`                              | WP9 | Approved core dep (Cat 11) for E2E.                                                                           |
| `googleapis`                                    | WP6 | Approved core dep (Cat 11) for Gmail API.                                                                     |

## Risks / notes

- **Prisma singleton binds `DATABASE_URL` at import** — the test harness must set env before the first `@smetko/db` import (`setupFiles` + `provide/inject`). This is the main harness subtlety.
- **Redacted fixtures must preserve the exact byte layout** the parsers depend on (column runs, `FACEBK`, повикување на број) or golden tests give false failures — sanitize values, never structure.
- **No live Gmail/НБРМ/VPS calls in tests** — all external I/O behind interfaces with fakes/fixtures.
- Coverage gates (80/60) enforced once suites exist; add to config in WP9.

---

## Definition of done (whole plan)

1. `npm test` (unit) + `npm run test:integration` + `npm run test:e2e` all green from a clean checkout with `docker compose up -d`.
2. T1–T14 and B1–B18 invariants each have at least one committed asserting test.
3. Backlog SM-2/3/5/7/20/30/37/38/50 all `☑` (SM-30 live-OAuth step documented as go-live task).
4. `docker build` succeeds for web + worker; deploy script + deployment docs complete with placeholders.
