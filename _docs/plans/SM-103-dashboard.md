# SM-103 — Dashboard (жив почетен екран)

**Type:** Feature · **Master Plan ref:** §9.1, handoff §1 · **Scope:** `ui`, `reports`
**Status:** ✅ Implemented (2026-07-29). `lib/dashboard.ts` + `dashboard/page.tsx` + `dashboard.integration.test.ts` (2 tests green, typecheck + lint clean, real-DB numbers verified).

## Problem

`/dashboard` is a static skeleton: all 4 KPI cards show `—` and the body is a "Во изградба"
placeholder. All the data it needs already exists in the DB (charges, payments, statements, cash
ledger, resolve/import queues) — nothing new to model. This turns the skeleton into the live
home screen described in the design handoff §1.

## Design source (handoff §1 — authoritative)

Three rows, rebuilt pixel-close from `finance-os-prototype.dc.html`:

1. **4 KPI картички** — Салдо банка, Салдо благајна, Задолжено, Наплатено (секоја со под-текст извор/датум).
2. **Ред 2** — панел „Задолжено vs наплатено" (2 progress бара: Фактури=accent, Кеш=жолт + 3 бројки);
   панел „Топ должници" (иницијали-аватар, име, старост на долг, износ црвено).
3. **Ред 3** — „Редици за внимание": 4 кликабилни картички (број + икона + лабела) што водат кон
   Import/Решавање/Задолжувања. Бројачите се живи.

## Data sources (all already exist — read-only aggregation)

New file `apps/web/lib/dashboard.ts` exposes one `getDashboard()` that returns the whole view model.

| KPI / panel                         | Source                                                                                                     | Note                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Салдо банка**                     | latest `BankStatementImport.closingBalance` (order by `statementNumber desc`, `status=PARSED`)             | sub: `НЛБ · извод #N · dd.MM.yyyy`                        |
| **Салдо благајна**                  | `getCashLedger(currentPeriod()).balance` (cumulative IN−OUT, B3 never-negative)                            | sub: „тековно салдо" (v1 — попис-anchored saldo deferred) |
| **Задолжено**                       | Σ `(total − paidAmount)` over charges `status ∈ {OPEN,PARTIALLY_PAID,OVERDUE}`                             | split invoice vs cash for row 2                           |
| **Наплатено**                       | Σ `Payment.amount` where `date` in current month (bank) + cash receipts (`CashLedgerEntry IN` this period) | sub: „тековен месец"                                      |
| **Задолжено vs наплатено**          | invoice-обврски vs кеш-обврски remaining, each as a bar of (наплатено / задолжено)                         | 2 bars + 3 numbers                                        |
| **Топ должници**                    | open charges grouped by client, `Σ remaining desc`, take 5; oldest `dueDate` → age in days                 | reuse aging math from `lib/reports.ts`                    |
| **Редици за внимание** (4 counters) | see below                                                                                                  | each links to its screen                                  |

**Редици за внимание counters:**

1. **Решавање** — `statementLine.count({ processed:false, OR:[{direction:IN}, {direction:OUT, classifiedAs ∈ [CARD_TX,OTHER]}] })` → `/resolve`
2. **FACEBK аларми** — `adSpendReceipt.count({ matchStatus:UNMATCHED })` + unmatched `META_ADS` lines → `/import`
3. **Нецелосни парсирања** — `adSpendReceipt.count({ parseStatus:PARTIAL })` + `bankStatementImport.count({ status:FAILED })` → `/import`
4. **Нацрти за одобрување** — `charge.count({ status:DRAFT, period:currentPeriod() })` → `/charges` _(surfaces the monthly W1 drafts)_

## UI completeness (Category 14 — every element declared)

| Element                     | State   | AC                                                                     |
| --------------------------- | ------- | ---------------------------------------------------------------------- |
| 4 KPI cards                 | `works` | render live values with source subtext; `0` renders as `0`, never `—`  |
| Задолжено vs наплатено bars | `works` | bar width = наплатено/задолжено; 3 numbers below                       |
| Топ должници rows           | `works` | up to 5; empty → „Нема отворени побарувања"                            |
| Attention cards             | `works` | show count; `0` → muted/disabled (not clickable); `>0` → link + accent |
| —                           | —       | no silent stubs; if a source is empty the panel states it              |

## Files

- **new** `apps/web/lib/dashboard.ts` — `getDashboard()` aggregator (server-only, typed view model).
- **rewrite** `apps/web/app/(app)/dashboard/page.tsx` — server component consuming `getDashboard()`, rebuilt to handoff §1. Remove the KPIS placeholder + „Во изградба" panel.
- **new** small presentational bits inline (KPI card, bar, debtor row, attention card) — no new deps (lucide-react icons already approved).
- **new** `apps/web/test/dashboard.integration.test.ts` — seed a client + open charge + a paid charge + a statement + unresolved line, assert KPI totals, top-debtor ordering, and attention counts.

## Money discipline

Read-only screen — **no writes, no money math beyond summation of stored `Int` денари**. All
formatting via `formatMKD` (money.ts boundary, B10). No new invariants; nothing mutates. Bank
balance and booked amounts are the stored MKD 1:1 (D3).

## Out of scope (note, don't silently drop)

- Live sidebar badge counts (handoff mentions decrementing badges) — separate follow-up; this plan
  only builds the dashboard cards. Flag as **SM-104** if wanted.
- Попис-anchored cash saldo (v1 uses cumulative balance).
- Auto-refresh / websockets — `force-dynamic` server render is enough for v1.

## Acceptance

- `/dashboard` shows live values for all 4 KPIs against the current dev DB (e.g. Задолжено = Σ open remaining).
- Топ должници lists real clients ordered by remaining, with day-age.
- Each attention counter matches its screen's queue length and links there; `0` is non-clickable.
- `dashboard.integration.test.ts` green; typecheck + lint clean.
