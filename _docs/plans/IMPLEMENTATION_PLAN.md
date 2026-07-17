# GoDigital Finance OS — Implementation Plan

**Status:** draft for developer approval · **Owner:** Александар Кекиќ · **Date:** 2026-07-17
**Domain source of truth:** `_docs/architecture/MASTER_PLAN_v2.1_FINAL.md` (v2.1 FINAL)
**Design source of truth:** `_docs/design/handoff/` (Claude Design prototype + tokens)

This plan turns the Master Plan into a build sequence. It follows the Master Plan phases
**Ф1–Ф4 (§10)** and their Definition-of-Done, adds a **Phase 0 foundation**, and seeds the
backlog (`SM-<N>`). Read the relevant Master Plan section (W/B/T/D codes) before starting each
item. Nothing in this plan overrides the Master Plan; where they differ, the Master Plan wins.

---

## 0. Architecture decisions (confirm before Phase 0)

| # | Decision | Default taken | Confirm |
| - | -------- | ------------- | ------- |
| A1 | App framework | **Next.js 15 App Router** full-stack (server actions + route handlers) + Prisma, per Master Plan §11 (`app (Next.js/Node + Prisma)`) | ☐ |
| A2 | Worker/cron | Separate **worker** process (Gmail poll + parse + match) and **cron** scheduler (W1 1st 06:00, W7 daily 07:00) in `apps/worker` | ☐ |
| A3 | Auth | App-managed **session auth** (bcrypt + Postgres session store), few static employees, RBAC via role — not an external IdP (mirrors sibling `GoDigital`) | ☐ |
| A4 | Repo layout | Single Next.js app + `apps/worker`; shared code in `packages/shared` (Zod schemas, `money.ts`, enums from Prisma) | ☐ |
| A5 | Invoice PDF | Server-side `@react-pdf/renderer` with an embedded **Cyrillic** font (Master Plan §7) | ☐ |
| A6 | Attachments | MinIO (S3-compatible) locally; local volume + **daily offsite backup** in prod; retention ≥ 10 y | ☐ |
| A7 | Work tracking | Local backlog `_docs/plans/backlog.md` (`SM-<N>`); swap to Jira/Issues later if adopted | ☐ |

> These are the only open build decisions. The domain (data model, parsers, workflows, rules)
> has **zero open questions** — the Master Plan is final.

---

## Phase 0 — Foundation (enables everything else)

**Goal:** a running, deployable skeleton with the schema, auth shell, design tokens, and the
CI/deploy machinery — before any business logic.

1. **Repo scaffold** — Next.js 15 + TS strict, `apps/worker`, `packages/shared`. Prettier,
   ESLint, `tsconfig` strict, `money.ts` (денари parse/format, `de-DE`).
2. **Commit toolchain** — Husky (`commit-msg` → commitlint, `pre-commit` → lint-staged +
   gitleaks, `pre-push` → lint/typecheck/build), commitizen, `commitlint.config.js` with the
   scopes from CLAUDE.md.
3. **Docker Compose (local)** — Postgres 16, Next.js app, worker, MinIO, Mailhog, Nginx.
   `.env.example` with every variable from CLAUDE.md Category 3. `npm run` one-command up.
4. **Prisma schema** — transcribe **Master Plan ДЕЛ II literally**: all enums, all models, all
   `@@unique` constraints (`[clientId, period, kind]`, `[seqInMonth, period]`, `lineHash`,
   `AdSpendReceipt` dedupe keys). First migration. `AuditLog` append-only (revoke UPDATE/DELETE
   on the app role). Money columns `Int`.
5. **Auth + RBAC** — login/session, `User.role`, server-side role guard helper; audit-log
   middleware (actor, entity, diff) wired so every mutation can log.
6. **App shell + design tokens** — sidebar (8 nav items + open-import badge), header (Gmail sync
   pill, mobile PWA button), Manrope, tokens from the handoff as Tailwind/CSS variables. Period
   status indicator ("Период 2026-07 · ОТВОРЕН").
7. **Deploy skeleton** — `scripts/deploy.sh` (backup → reset → build → `migrate deploy` → health
   → rollback), `docker-compose.prod.yml`, Nginx + Certbot notes in `_docs/deployment/`.

**DoD:** `docker compose up` serves a login → empty dashboard shell on tokens; `prisma migrate`
applies the full schema; `pre-push` gate green; `deploy.sh staging` reaches the VPS (once it
exists).

---

## Phase 1 — Ф1 Јадро (the full monthly cycle, done manually)

**Master Plan §10 Ф1** · covers W1, W3, W5, W6 · **DoD: a whole monthly cycle can be run by hand.**

1. **Clients + Onboarding wizard (§9.2, screens)** — list with channel filter; 5-step wizard
   (basics → channel with live VAT preview + ЕДБ gate B17 → package → extras (AdAccount mapping,
   Actors D2) → confirm). Client profile: package history (versioned, B4), timeline, extras,
   margin, documents.
2. **Service packages** — versioned model (B4); no edit-in-place. Effective dates drive W1.
3. **W1 — Charges (cron 1st 06:00)** — for ACTIVE clients: SERVICE line from active package;
   META_ADS/ACTORS lines = Σ unbilled billable Expenses (empty in Ф1, wired in Ф2); OTHER fixed.
   `INVOICE` → DRAFT + 18% VAT; `CASH_OBLIGATION` → OPEN, no number/VAT. `creditBalance`
   auto-apply (B18). Approve DRAFT → assign number `1-{n}/{M}-{YYYY}` atomically (B1) → PDF +
   email. **Acceptance: T9, T10.**
4. **Charges screen** — month selector, "approve all DRAFT", CREDIT_NOTE, PDF preview.
5. **Invoice PDF template (§7, D1)** — АЛМА ДИЗАЈН entity block, primač with ЕДБ, line table with
   `sourceRefs` sub-descriptions, VAT 18%, повикување на број footer, Cyrillic font.
6. **W3 — Cash collection** — client → open obligations → atomic `Payment(CASH)` +
   `CashLedgerEntry(IN, FISCAL number D6)`; partial OK; overpayment → `creditBalance`.
7. **W6 — Cash expense (mobile PWA)** — camera → OCR prefill → category → atomic `Expense` +
   `CashLedgerEntry` + photo. **No photo = blocked (B5). Acceptance: T11.**
8. **W5 — Contractors/honorari** — register (type, taxMode B8, isTalent); calculation with
   allocations `[{clientId, amount, billable}]`; tax by mode; payout → blagajna/bank entry; D2
   auto-creates one billable `Expense(ACTORS)` per billable allocation (B16). **Acceptance:
   T13, T14.**
9. **Blagajna screen** — journal, stocktake, never-negative guard (B3).

**DoD (Master Plan):** one full month — charge, collect cash, pay a contractor, record a cash
expense — run end-to-end by hand, with T9–T14 green.

---

## Phase 2 — Ф2 Import (Gmail + parsers + matching)

**Master Plan §10 Ф2** · covers W2, W7, §4 · **DoD: T1–T12 green + a week of real statements
with no FAILED.**

1. **Gmail ingestion (§4.1)** — worker polls one mailbox (OAuth2 refresh token) every 10–15 min;
   download PDF attachments; route by sender/filename (`Transaction__*` → Meta, `DpsStatement*`
   → NLB); dedupe by Message-ID; label Processed/Failed. Multi-upload fallback in the UI.
2. **NLB statement parser (§4.2, adapter `NLB_PDF`)** — header + lines; amounts `5.782,00 →
   578200`. **Integrity gate (B14):** balance equation, `parsed == order count`, continuity —
   fail → `FAILED`, zero postings, alarm. **Dedupe (B13):** `(account, statementNumber)` +
   `lineHash`. **Acceptance: T2, T3, T4.**
3. **Classification (priority)** — META_ADS → CARD_TX (→ VendorRule) → CLIENT_PAYMENT (повикување
   на број → `Charge.invoiceNumber`, normalized; fuzzy suggestion fallback) → BANK_FEE → OTHER.
   **Acceptance: T5.**
4. **Meta receipt parser (§4.3)** — regex fields incl. Cyrillic account names; `referenceNumber`
   is the matching key; incomplete → `PARTIAL` + manual row. **Acceptance: T8.**
5. **Matching: receipt ↔ statement line (§4.4)** — key = `referenceNumber == FACEBK code` only;
   name = secondary; **USD/MKD ±6% sanity** (warning outside); book MKD 1:1; match → auto
   `Expense(ADS, CARD, clientId from AdAccount, isBillable = clientId != null)`. Alarms: receipt
   without line > 7 days; FACEBK line without receipt immediately. **Acceptance: T1, T6, T7.**
6. **Import center screen (§9.4)** — NLB list with integrity line; 4 live queues (statement
   lines / receipts without line / FACEBK without receipt / PARTIAL) with resolve actions +
   decrementing counters.
7. **Billable pass-through into W1** — META_ADS/ACTORS lines now sum unbilled billable Expenses;
   `billedOnLineId` prevents re-billing. **Acceptance: T12.**
8. **W7 — Exchange rate (cron 07:00)** — НБРМ USD mid → `ExchangeRate`; fallback + warning > 3
   days.

**DoD (Master Plan):** T1–T12 green; import a real week of statements/receipts with zero FAILED
and correct auto-postings.

---

## Phase 3 — Ф3 Дисциплина (dunning, payroll, corrections, close)

**Master Plan §10 Ф3** · covers W4, W8, VendorRules, payroll, CREDIT_NOTE · **DoD: first month
closed end-to-end.**

1. **W4 — Dunning** — INVOICE reminders at due+7 / +21, OVERDUE at +30; CASH_OBLIGATION internal
   notification only.
2. **VendorRules** — pattern → category mapping for CARD_TX; hit counter; managed in settings.
3. **Payroll** — `Employee` + `PayrollRun` (2 salaried); monthly run.
4. **CREDIT_NOTE / storno** — corrections against issued invoices; links to original.
5. **W8 — Month close** — blockers (no DRAFT/UNMATCHED, lines processed, receipts resolved,
   blagajna == physical stocktake, salaries/honorari PAID) → `CLOSED` → immutable (B9). App-layer
   write rejection on closed periods.

**DoD (Master Plan):** the first real month is closed end-to-end with all blockers satisfied.

---

## Phase 4 — Ф4 Извештаи (reporting + accountant package)

**Master Plan §10 Ф4** · covers reporting + W9 · **DoD: the accountant accepts the package;
margin manually verified for 3 clients.**

1. **Reports screen (§9.7)** — P&L (revenue/expense/profit YTD), margin per client (color by
   threshold), aging (4 buckets), cash flow, blagajna.
2. **W9 — Accountant package** — post-close ZIP: 01 outgoing invoices (PDF + `Kniga_izlezni.xlsx`)
   · 02 incoming expenses (attachments + xlsx, reverse-charge column) · 03 statements · 04
   blagajna (journal + photos) · 05 honorari · 06 salaries.

**DoD (Master Plan):** accountant accepts the ZIP; per-client margin matches manual calc for 3
clients.

---

## Cross-cutting (every phase)

- **Golden-file tests** — commit NLB statements 146/149 + 3 Meta invoices as fixtures; every
  parser/matcher runs against them (CLAUDE.md Category 6).
- **Acceptance tests T1–T14** are the DoD for parsers/matching/W1 — a related PR isn't done until
  its T-test passes.
- **Audit + logging** — every financial mutation writes `AuditLog` and a Pino business event.
- **Atomicity** — cash capture, payment+match, honorar payout each in one `$transaction`.
- **Deploy discipline** — staging verified before production; `deploy.sh` backup + auto-rollback.

---

## Go-live checklist (Master Plan §12 — before the parallel month)

1. ☐ Billing email unified across all ad accounts *(owner — in progress)*
2. ☐ AdAccounts entered and mapped
3. ☐ Clients entered (wizard)
4. ☐ Last invoice number confirmed → numbering continues from it
5. ☐ Opening balances: bank (last statement) + blagajna (stocktake)
6. ☐ Open receivables entered as historical Charges
7. ☐ Contractors entered (type, taxMode, isTalent)
8. ☐ Starter VendorRules set
9. ☐ Logo/design delivered for the invoice template
10. ☐ Gmail OAuth connected; a test message passes the pipeline
11. ☐ One parallel month → compare → system becomes source of truth

---

## Seed backlog

The concrete work items live in `_docs/plans/backlog.md`. Phase 0 seeds `SM-1 … SM-7`, Phase 1
`SM-10 …`, etc. Keep IDs stable; reference them in branches (`feature/SM-<N>-slug`) and commit
footers (`Refs SM-<N>`).
