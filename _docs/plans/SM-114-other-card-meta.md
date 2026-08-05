# SM-114 — book Meta ad spend paid on another card (USD→МКД)

**Type:** Feature · **Refs:** Master Plan §4.4/§5 (Meta re-billing), D3 (МКД booking), B15/B16.

## Context

277 Meta receipts auto-matched to FACEBK lines on the main NLB card (•••8234). 16 receipts are on a
**second card (•••6613)** which produces no NLB statement, so they can never match a statement line —
they sit unmatched. They belong to mapped clients (Astibo, Enterieri, Алекс Дизајн) and are billable.
The owner wants them booked, with the amount **converted USD→МКД** (there is no NLB МКД amount for
this card). `ExchangeRate` is empty, so the owner enters a single rate.

## Decision (owner-confirmed)

- МКД amount = **`round(amountUsd_cents × rate)`**, where `rate` is денари-per-USD entered by the owner
  (one rate applied to all). дени units: cents × (МКД/USD) = МКД·10⁻² = дени. ✓
- Only offered for **"other-card" receipts** — a card is "other" if NONE of its receipts are
  AUTO_MATCHED (data-driven). The 1 receipt on •••8234 is left to auto-match when its statement arrives
  (its correct МКД is the statement amount 1:1, not a conversion).

## Build

1. **`bookOtherCardReceipt(receiptId, rate, userId)`** (`workflows/meta.ts`): atomically claim the
   receipt (UNMATCHED→MANUAL_MATCHED, race-safe), period-guard on the invoice date (B9), resolve the
   client from the mapped ad account, create one billable `Expense(ADS)` with `amount = round(usd×rate)`,
   the Meta PDF as the document, `adSpendReceiptId` set (B15/B16 one-per-receipt via the unique FK),
   `statementLineId` null (no bank line for this card). Audit records `{amountUsd, rate, amountMkd}`.
   Plus `bookAllOtherCardReceipts(rate, userId)` — books every other-card unmatched receipt.
2. **`getMetaOverview`**: enrich orphan rows with `cardLast4`, `usdCents`, mapped `clientId/clientName`,
   and `isOtherCard`. Compute statement cards = distinct `cardLast4` among AUTO_MATCHED receipts.
3. **META screen**: in "Receipts без банкарска линија", a "USD→МКД курс" input; other-card rows show the
   live МКД (usd×rate) + client + a „Книжи" button; a bulk „Книжи ги сите (•••6613)". Statement-card
   rows keep the existing "Спари со линија" flow with a hint that they await a statement.

## Tests

Booking converts correctly (round(usd×rate)), creates one billable ADS expense for the mapped client
with no statement line, is idempotent (second call no-ops), and is period-guarded.

## Out of scope

Per-date/НБРМ rates (W7), importing a statement for card 6613, editing a booked conversion (undo =
delete the expense, existing path).
