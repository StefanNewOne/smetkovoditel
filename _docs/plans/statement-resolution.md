# Feature Plan — Statement Resolution screen (Уплати + Трошоци)

**Status:** draft for developer approval · **Date:** 2026-07-20
**Backlog:** SM-81 (screen) · SM-82 (parser payer + auto-suggest) · SM-83 (expense categorize + learn)
**Master Plan refs:** §9.4 (Import center), §4.2 (classification + VendorRules), B6 (card/bank photo
optional), B9 (period guard), B10 (integer денари)

Rebuilds the two right-hand Import queues ("Уплати за спарување", "Извод-линии за решавање") into a
dedicated **Решавање** screen with richer resolution, per developer request. Confirmed decisions:
one new screen with two sections · parser extracts the payer and auto-suggests the client · new
expense categories via migration + "remember vendor" auto-learn.

## What the two queues are (confirmed)

- **Уплати за спарување** — incoming statement lines (`direction=IN`, `processed=false`) not yet
  booked to a charge (client paid without / with a wrong повикување на број).
- **Извод-линии за решавање** — outgoing operating expenses (`direction=OUT`, `CARD_TX`/`OTHER`,
  `processed=false`): fuel, представи/ресторани, marketing, other. Distinct from client-payment IN
  lines and Meta ADS OUT lines (already matched).

## Constraint discovered

The current NLB parser does **not** extract a payer name for IN transfers, and the 49 open payments
carry no `counterpartyName`/`counterpartyAccount`. Auto-suggesting the paying client therefore
requires a parser enhancement + a backfill of the already-ingested 152 statements. The extraction is
**additive metadata** — it does not touch amount/direction, so the integrity gate (B14) and the
golden tests are structurally unaffected; all 152 statements stay 100%.

---

## SM-82 — Parser: extract payer/counterparty name + auto-suggest client

1. `buildLines` (apps/web/lib/pdf/nlb-parse.ts): add `counterpartyName` to `NlbLine` — the cleaned
   name tokens from the transaction's `joined` text (generalize the existing CARD_TX `merchant`
   extraction to IN transfers: strip account/повик/шифра/bankRef/amount tokens, keep the name).
2. Map into `StatementLine.counterpartyName` in `ingestParsedStatement` (w2.ts).
3. **Re-verify**: `nlb-real` (all 152 integrity-OK) + `golden` tests stay green (unchanged, since
   amount/direction are untouched). Add an assertion that a known payment exposes its payer name.
4. **Backfill**: a guarded one-off (`/api/cron/reparse-names` or a script) re-parses the stored
   PDFs and updates `counterpartyName` on existing lines — idempotent, no re-posting.
5. Auto-suggest: `suggestClientForPayment(line)` — fuzzy match `counterpartyName`/`counterpartyAccount`
   against `Client.name` (normalized, same `norm()` as import-alma) → a client suggestion. Combined
   with the existing exact-amount charge suggestion. Suggestion only; human confirms (§4.2).

## SM-83 — Expense categorize + vendor learning (migration)

1. **Migration** (packages/db): add `ExpenseCategory` values `REPRESENTATION` (кафани/ресторани) and
   `MARKETING` (non-Meta marketing). Additive, reversible; existing rows unaffected.
2. Workflow `categorizeStatementLine(lineId, category, opts, userId)` (w2.ts) — one `$transaction`:
   create `Expense` (category, amount = line.amount, date, `paymentChannel` = CARD if `cardLast4`
   else BANK, `statementLineId`, `isBillable=false`, no photo — B6), mark line `processed`, write
   audit. Period-guarded (B9). Idempotent (processed line rejected).
3. **Learn**: `opts.rememberVendor` → upsert a `VendorRule` (pattern from `counterpartyName`/merchant
   → category) so future CARD_TX lines auto-categorize on import (existing pipeline, §4.2). Report
   how many pending lines the new rule would also match.

## SM-81 — Решавање screen (two sections)

New route `apps/web/app/(app)/resolve/page.tsx` + `resolve-view.tsx`; sidebar nav entry. Server data
via `getResolveCenter()` (lib/resolve.ts):

- **Секција Уплати** — rows = unmatched IN lines. Each shows amount + payer (new) + client suggestion
  - exact-amount charge suggestion; a **client picker** filters the invoice dropdown to that client's
    open charges only (fixes "shows all invoices"); one-click match via `manualMatchStatementLine`.
- **Секција Трошоци** — rows = unmatched OUT CARD_TX/OTHER lines. Each shows merchant/description +
  amount; a **category picker** + optional "запомни го продавачот" → `categorizeStatementLine`; keep
  "Игнорирај" for genuine noise.

The Import screen keeps upload + statements + the alarm queues (receipts/FACEBK/partial). The two
resolution queues move to the new screen (Import cross-links to it with counts).

## Sequencing (low-risk first)

1. **SM-83 migration + categorize + learn** — additive, no parser risk. Ships the Трошоци flow.
2. **SM-81 screen** — Уплати (manual client filter) + Трошоци sections. Immediate value.
3. **SM-82 parser payer + backfill + auto-suggest** — riskiest; verified against all 152 + golden
   before merge. Layers auto-suggest onto the Уплати section.

## Tests (Category 6)

- `categorizeStatementLine`: creates Expense, marks line processed, idempotent, period-guarded,
  VendorRule learn matches siblings (integration).
- Parser: `counterpartyName` populated for a sample IN payment; **all 152 still integrity-OK**;
  golden unchanged.
- `suggestClientForPayment`: exact/none/ambiguous name match (unit).
- Resolve screen data (`getResolveCenter`) integration.

## Out of scope / open

- "кафани/ресторани" → `REPRESENTATION`; "маркетинг" → `MARKETING` (confirmed add). Fuel → `FUEL`.
- Auto-suggest is best-effort (names are messy); never auto-applies — always human-confirmed.
