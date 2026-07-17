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
| SM-34 | Feature      | Matching receipt ↔ statement line (±6% sanity, MKD 1:1, auto Expense)                                                                    | §4.4            | ☐      |
| SM-35 | Feature      | Import center screen (integrity line + 4 live queues)                                                                                    | §9.4            | ☐      |
| SM-36 | Modification | Wire billable ADS/ACTORS pass-through into W1 (billedOnLineId B15)                                                                       | §5, B15         | ☐      |
| SM-37 | Feature      | W7 exchange-rate cron (НБРМ USD mid, fallback)                                                                                           | W7              | ☐      |
| SM-38 | Testing      | Golden verified LIVE vs real 146/149 + 3 Meta receipts (19/19: T1/T2/T4/T5/T6/T8); synthetic unit tests committed; matching (T7) → SM-34 | §13, T1–T8      | ◐      |

## Phase 3 — Ф3 Дисциплина

| ID    | Type    | Title                                                        | Master Plan ref | Status |
| ----- | ------- | ------------------------------------------------------------ | --------------- | ------ |
| SM-50 | Feature | W4 dunning (invoice reminders + OVERDUE; cash internal note) | W4              | ☐      |
| SM-51 | Feature | VendorRules management + CARD_TX auto-categorization         | §4.2            | ☐      |
| SM-52 | Feature | Payroll (Employee + PayrollRun)                              | W5              | ☐      |
| SM-53 | Feature | CREDIT_NOTE / storno corrections                             | §3, B9          | ☐      |
| SM-54 | Feature | W8 month close (blockers → CLOSED → immutable B9)            | W8, B9          | ☐      |

## Phase 4 — Ф4 Извештаи

| ID    | Type    | Title                                                      | Master Plan ref | Status |
| ----- | ------- | ---------------------------------------------------------- | --------------- | ------ |
| SM-70 | Feature | Reports (P&L, margin per client, aging, cash flow)         | §9.7            | ☐      |
| SM-71 | Feature | W9 accountant ZIP package (6 sections, xlsx exports)       | W9              | ☐      |
| SM-72 | Testing | End-to-end verification + margin cross-check for 3 clients | §10 Ф4          | ☐      |
