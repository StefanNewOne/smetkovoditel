# Backlog — GoDigital Finance OS (Сметководител)

Local-first work tracking. Each item has a stable ID `SM-<N>`. Reference it in the branch name
(`feature/SM-<N>-slug`), commit footer (`Refs SM-<N>`), and PR (`Closes SM-<N>`). See
`IMPLEMENTATION_PLAN.md` for phase context and `../architecture/MASTER_PLAN_v2.1_FINAL.md` for
the domain spec.

Legend — **Type:** Feature / Modification / Bug / Anomaly / Maintenance / Testing / Documentation.
**Status:** ☐ todo · ◐ in progress · ☑ done.

## Phase 0 — Foundation

| ID   | Type        | Title                                                                                         | Master Plan ref | Status |
| ---- | ----------- | --------------------------------------------------------------------------------------------- | --------------- | ------ |
| SM-1 | Maintenance | Repo scaffold: Next.js 15 + TS strict, `apps/worker`, `packages/shared`, `money.ts`           | §11             | ☑      |
| SM-2 | Maintenance | Commit toolchain: Husky + commitlint + lint-staged + commitizen (+ gitleaks pending)          | —               | ◐      |
| SM-3 | Maintenance | Docker Compose (Postgres/MinIO/Mailhog) + `.env.example` — app/worker Dockerfiles pending     | §11             | ◐      |
| SM-4 | Feature     | Prisma schema transcribed literally from Master Plan ДЕЛ II (23 tables) + init migration SQL  | ДЕЛ II          | ☑      |
| SM-5 | Feature     | Session auth (iron-session + bcrypt) + login/guard + seed. RBAC + AuditLog middleware pending | §9.8            | ◐      |
| SM-6 | Feature     | App shell + design tokens (sidebar, header, Manrope, period indicator, 8 screens)             | handoff         | ☑      |
| SM-7 | Maintenance | `scripts/deploy.sh` skeleton — prod compose + Nginx/Certbot docs pending                      | §11             | ◐      |

## Phase 1 — Ф1 Јадро

| ID    | Type    | Title                                                                                                                       | Master Plan ref | Status |
| ----- | ------- | --------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| SM-10 | Feature | Clients list + 5-step onboarding wizard (VAT preview, ЕДБ gate B17)                                                         | §9.2            | ☑      |
| SM-11 | Feature | Versioned service packages (B4) + client profile (history, margin, timeline)                                                | §3, B4          | ☑      |
| SM-12 | Feature | W1 charge generation (INVOICE/CASH_OBLIGATION, creditBalance apply)                                                         | W1, B12, B18    | ☑      |
| SM-13 | Feature | Invoice numbering `1-{n}/{M}-{YYYY}` atomic at issuance (B1)                                                                | §6, B1          | ☑      |
| SM-14 | Feature | Charges screen (month nav, run W1, approve-all + per-row, PDF preview). CREDIT_NOTE → SM-53                                 | §9.3            | ☑      |
| SM-15 | Feature | Invoice PDF template with Cyrillic font (§7, D1) — @react-pdf, Manrope embedded                                             | §7, D1          | ☑      |
| SM-16 | Feature | W3 cash collection (atomic Payment + CashLedgerEntry, FISCAL D6)                                                            | W3              | ☑      |
| SM-17 | Feature | W6 mobile cash-expense (photo gate B5, atomic; OCR prefill deferred)                                                        | W6, B5          | ☑      |
| SM-18 | Feature | W5 contractors/honorari + D2 auto ACTORS Expense (B16)                                                                      | W5, D2, B16     | ☑      |
| SM-19 | Feature | Blagajna screen (journal, stocktake, never-negative B3)                                                                     | §9.5, B3        | ☑      |
| SM-20 | Testing | Ф1 verified LIVE vs Postgres: T9/T10/T12/T13/T14 + B1/B3/B5/B12/B15 (20/20). Maintained Vitest+Testcontainers suite pending | T9–T14          | ◐      |

## Phase 2 — Ф2 Import

| ID    | Type         | Title                                                                                                                                    | Master Plan ref | Status |
| ----- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| SM-30 | Feature      | Gmail ingestion worker (OAuth2, routing, Message-ID dedupe, labels)                                                                      | §4.1            | ☐      |
| SM-31 | Feature      | NLB PDF parser + integrity gate (B14) + dedupe (B13)                                                                                     | §4.2, B13/B14   | ☑      |
| SM-32 | Feature      | Statement line classification (priority pipeline)                                                                                        | §4.2            | ☑      |
| SM-33 | Feature      | Meta receipt parser (Cyrillic, referenceNumber key)                                                                                      | §4.3            | ☑      |
| SM-34 | Feature      | Matching receipt ↔ statement line (±6% sanity, MKD 1:1, auto Expense)                                                                    | §4.4            | ☑      |
| SM-35 | Feature      | Import center screen (integrity line + 4 live queues)                                                                                    | §9.4            | ☑      |
| SM-36 | Modification | Wire billable ADS/ACTORS pass-through into W1 (billedOnLineId B15)                                                                       | §5, B15         | ☑      |
| SM-37 | Feature      | W7 exchange-rate cron (НБРМ USD mid, fallback)                                                                                           | W7              | ☐      |
| SM-38 | Testing      | Golden verified LIVE vs real 146/149 + 3 Meta receipts (19/19: T1/T2/T4/T5/T6/T8); synthetic unit tests committed; matching (T7) → SM-34 | §13, T1–T8      | ◐      |

## Phase 3 — Ф3 Дисциплина

| ID    | Type    | Title                                                                      | Master Plan ref | Status |
| ----- | ------- | -------------------------------------------------------------------------- | --------------- | ------ |
| SM-50 | Feature | W4 OVERDUE marking (done+verified) + cron; email reminders → SM-30 (Gmail) | W4              | ◐      |
| SM-51 | Feature | VendorRules management + CARD_TX auto-categorization                       | §4.2            | ☑      |
| SM-52 | Feature | Payroll (Employee + PayrollRun)                                            | W5              | ☑      |
| SM-53 | Feature | CREDIT_NOTE / storno corrections                                           | §3, B9          | ☑      |
| SM-54 | Feature | W8 month close (blockers → CLOSED → immutable B9)                          | W8, B9          | ☑      |

## Phase 4 — Ф4 Извештаи

| ID    | Type    | Title                                                      | Master Plan ref | Status |
| ----- | ------- | ---------------------------------------------------------- | --------------- | ------ |
| SM-70 | Feature | Reports (P&L, margin per client, aging, cash flow)         | §9.7            | ☑      |
| SM-71 | Feature | W9 accountant ZIP package (6 sections, xlsx exports)       | W9              | ☑      |
| SM-72 | Testing | End-to-end verification + margin cross-check for 3 clients | §10 Ф4          | ☑      |

## Progress — 2026-07-17 (completion & full test coverage)

Per `completion-and-testing.md`. All work packages landed; the suite is green from a clean
checkout (`docker compose up -d db` → unit + integration + E2E).

| ID    | Change                                                                                                                                   | Status |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| SM-20 | Vitest + Docker-Postgres integration harness; T9/T10/T11/T12/T13/T14 + B1/B3/B5/B8/B12/B15/B16/B18 codified                              | ☑      |
| SM-38 | Redacted committed golden fixtures (146/149 + 3 Meta) + golden test; W2 matching (T7) + integrity (B14) + dedupe (B13) integration       | ☑      |
| SM-37 | W7 НБРМ USD mid cron: parser, upsert, fallback+staleness, guarded endpoint, worker wired                                                 | ☑      |
| SM-30 | Gmail ingestion pipeline (routing/dedupe/labelling) + REST adapter + endpoint + worker. Live OAuth deferred to go-live                   | ◐      |
| SM-50 | Tiered reminders (due+7/+21/+30), dedup via `reminder.sent`, Gmail sender, dunning endpoint                                              | ☑      |
| SM-5  | RBAC guards (typed 401/403) wired into all 8 mutating action files; AuditLog trail verified                                              | ☑      |
| SM-2  | `gitleaks` pre-commit hook                                                                                                               | ☑      |
| SM-3  | web + worker Dockerfiles (multi-stage, non-root)                                                                                         | ☑      |
| SM-7  | `docker-compose.prod.yml`, full `deploy.sh` (backup→migrate→health→rollback), Nginx/Certbot + staging/production runbooks, `/api/health` | ☑      |
| —     | Playwright E2E (login → dashboard) against a seeded `smetko_e2e` DB                                                                      | ☑      |
| SM-73 | `npm run dev` loads the root `.env.local` via `dotenv-cli` (was: `next dev` ran from `apps/web` and never saw the root env)              | ☑      |

**Test totals:** 27 unit + 60 integration + 2 E2E = **89 green**. Lint/typecheck/build pass.
**Remaining for go-live (needs secrets/VPS, not code):** connect Gmail OAuth (SM-30 live step),
fill `<vps-ip>`/`<url>` placeholders, install `gitleaks` binary on dev machines.

## Audit fixes — 2026-07-17 (from full-system review)

| ID    | Type    | Change                                                                                                                                                                                                                                                                                                      | Status |
| ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| SM-74 | Bug     | ±6% USD rate sanity now computed in `runMatching` vs НБРМ mid; out-of-band → `match.alarm` warn + `rateSanityOk` in audit. Booked MKD unchanged (§4.4)                                                                                                                                                      | ☑      |
| SM-75 | Bug     | Statement continuity gate — opening == prior (N-1) closing; mismatch → FAILED, posts nothing (B14)                                                                                                                                                                                                          | ☑      |
| SM-76 | Bug     | Period guards: W2 match leaves closed-period payments unprocessed; W4 markOverdue excludes closed periods (B9)                                                                                                                                                                                              | ☑      |
| SM-77 | Bug     | Billable allocation on a non-talent contractor is rejected in `calcHonorar` (D2) — no silent cost loss                                                                                                                                                                                                      | ☑      |
| SM-78 | Feature | Import-center queue resolution: re-run matching, manual match a payment line to a charge, ignore a noise line (§9.4)                                                                                                                                                                                        | ☑      |
| SM-79 | Feature | Bulk historical importer (clients + packages + charges w/ real numbers + payments + opening balances) + CSV CLI + templates; numbering continues from imported max; idempotent; dry-run                                                                                                                     | ☑      |
| SM-80 | Bug     | NLB parser hardened to 100% on real statements (was 121/152). pdf-parse flattens the Задолжување/Побарување columns → direction was guessed; new positional parser (parseNlbFromPdf) reads token X-coordinates for column-accurate direction; ingestStatementPdf path; text parser kept for golden fixtures | ☑      |

**Not bugs (verified against Master Plan, flagged by the automated review but correct):** VAT on
ADS/ACTORS invoice lines (whole invoice is 18%-VATed — standard MK treatment); a unique
`ContractorPayment(contractor, period)` would be wrong (multiple honorari per month are legal).
**Cosmetic/deferred:** Dashboard KPIs and client "Маргина YTD" show "—" (marked Во изградба).

## Statement resolution — 2026-07-20 (developer request)

Per `statement-resolution.md`. A dedicated **Решавање** screen for the two Import queues, with a
client-filtered payment matcher and expense categorization + vendor learning.

| ID    | Type         | Title                                                                                                                                                                                     | Master Plan ref | Status |
| ----- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| SM-81 | Feature      | Решавање screen: Уплати (client-filtered invoice pick) + Трошоци (categorize) sections; Import keeps alarm queues                                                                         | §9.4            | ☑      |
| SM-82 | Modification | NLB parser captures payer **account** (Cyrillic names garbled by the PDF font; lineHash byte-stable) + backfill (733 lines) + account→client suggest learned from matched-payment history | §4.2            | ☑      |
| SM-83 | Feature      | `categorizeStatementLine` → Expense (B6, B9 atomic) + VendorRule "remember vendor"; migration adds REPRESENTATION/MARKETING                                                               | §4.2, B6        | ☑      |

## Responsive layout — 2026-07-20 (developer request)

Per `responsive.md`. The shell forced `min-w-[1180px]` with no breakpoints → every screen overflowed
smaller viewports. Fixed in three levels (A stop-overflow, B stacking, C mobile sidebar).

| ID    | Type         | Title                                                                                          | Ref | Status |
| ----- | ------------ | ---------------------------------------------------------------------------------------------- | --- | ------ |
| SM-84 | Modification | Responsive layout: drop min-w-[1180px], stack 2-col grids, scroll/stack tables, drawer sidebar | UI  | ☑      |

Levels A (stop overflow), B (stack under lg), C (mobile drawer sidebar under md) all landed.

## Revision 1 — owner system review (2026-07-20)

Per `revision-1.md`. Deferred to the end: attention-queue/FACEBK redesign, the `4080012325273`
identification.

| ID    | Type         | Title                                                                                          | Ref  | Status |
| ----- | ------------ | ---------------------------------------------------------------------------------------------- | ---- | ------ |
| SM-85 | Feature      | Client fixed number + start date + giro accounts (schema, wizard, profile, backfill)           | §3   | ☐      |
| SM-86 | Feature      | Delete (cascade + free statement lines + audit) & deactivate client; KESH↔clients recon report | §3   | ☐      |
| SM-87 | Modification | Dual numbering: internalRef `1-{clientNo}/{month}-{year}` + issue-date-on-approval             | B1   | ☐      |
| SM-88 | Feature      | Monthly/quarterly `billingCycle` packages; W1 fires on cycle boundary (АБАУТ ХЕР)              | §3   | ☐      |
| SM-89 | Feature      | Charges split CASH/INVOICE + per-section ИЗВРШИ + delete-draft + НАПЛАТИ / НАПЛАТА КЕШ         | §9.3 | ☐      |
| SM-90 | Feature      | Решавање: client name from giro account + learn-on-match; new Трошоци expenses list            | §9.4 | ☐      |
| SM-91 | Feature      | Settings: VendorRule CRUD (add/delete vendor→category)                                         | §4.2 | ☐      |
| SM-92 | Feature      | Blagajna expense source (cash vs card/bank→statement) + НАПЛАТА КЕШ (cash clients, owed/paid)  | §2   | ☐      |
| SM-93 | Modification | Import center: statements pagination / show-all + total count                                  | §9.4 | ☐      |

**SM-82 finding:** the NLB PDF renders Cyrillic in a custom font that pdf-parse decodes to private
glyphs (payer _names_ are unreadable). The payer _account_ is plain ASCII, so it is the reliable
key: the parser captures it (at/below the amount, outside the classify window — stored only, never
in the lineHash), and the resolve screen learns `payer-account → client` from each matched payment.
14/49 open payments got a correct suggestion immediately; coverage grows as more payments match.

## Screen review — 2026-07-29 (developer request)

Owner walked the ТРОШОЦИ / ТЕКОВНИ ТРОШОЦИ / ИЗВЕШТАИ / DASHBOARD screens. Duplicate-expense
scare investigated and cleared (every expense traces 1:1 to a distinct bank line — no double-count).

| ID     | Type         | Title                                                                                                                      | Ref         | Status |
| ------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| SM-99  | Bug          | Трошоци rendered custom category keys (`CAT_…`) — resolve label from `Category.label`, static map fallback                 | §4.2, SM-99 | ☑      |
| SM-100 | Modification | Тековни трошоци defaulted to the in-progress month (read ~0) → default to last complete month + month stepper              | SM-100      | ☑      |
| SM-103 | Feature      | Live Dashboard (KPIs, Задолжено vs наплатено, Топ должници, Редици за внимание) per handoff §1 — see `SM-103-dashboard.md` | §9.1        | ☑      |

**ИЗВЕШТАИ „missing clients" (not a bug):** margin-per-client is period-scoped. 2026-07 had 11 of 33
active clients charged because W1 for July had not been re-run after a dev-data rebuild (29 earlier
July charges were gone with no delete-audit). Re-ran W1 for 2026-07 → +22 DRAFT charges (11 skipped),
all 33 active clients now present. The 2 churned clients (#39, #40) remain correctly excluded.
