# Revision 1 — developer system review (2026-07-20)

Owner-driven revision after the first walkthrough. Confirmed decisions are captured here; the
Master-Plan conflicts that were raised are resolved by explicit owner choice below.

## Confirmed decisions

1. **Delete client — allowed even with history.** Owner has real duplicates (e.g. АБАУТ ХЕР vs
   Abouther.mk) that must be physically removed. Delete cascades the client's charges / payments /
   expenses / packages / templates / ad-accounts, and **frees any linked bank statement lines**
   (reset `processed=false`, clear `linkedType/Id`) so they can be re-matched to the correct client.
   Guarded: impact preview + typed confirmation + AuditLog. Deactivate = `status` non-ACTIVE (W1
   already skips non-ACTIVE clients).
2. **Dual invoice numbering.** Keep the existing (imported) fiscal numbers unchanged on Jan–Jul
   invoices. Add a **fixed client number** and a second reference `1-{clientNo}/{month}-{year}` on
   every charge (`internalRef`). From **August** onward the invoice's number is the new scheme.
   Accounting keeps both, so no confusion. (B12 makes `1-{clientNo}/{month}-{year}` unique for
   INVOICE; credit notes get a distinct suffix.)
3. **Issue date = the day the invoice is approved** (DRAFT → OPEN), not generation day.
4. **Start date** per client (wizard) → drives W1 (no charges before start; anchors the quarterly
   cycle).
5. **Monthly / quarterly packages** (`billingCycle`). Quarterly = one invoice, one number, full
   3-month amount; W1 only fires at cycle start. Cash quarterly may be paid in 2–3 installments
   (partial payments already supported). Reference client: АБАУТ ХЕР (1000 € + VAT / 3 months).
6. **Charges split into CASH and INVOICE**, each with an **ИЗВРШИ** button generating DRAFTs (cash
   becomes DRAFT too). Every DRAFT gets an **ИЗБРИШИ** next to **ОДОБРИ**.
7. **Invoice: НАПЛАТИ** — pick the statement number + the concrete incoming payment line to match
   (reuses `manualMatchStatementLine`). Credit note stays available for invoices but is secondary.
   **Cash: НАПЛАТА КЕШ** — same flow as Blagajna; enter the cash amount the client paid against that
   obligation.
8. **Payer identification by жиро-сметка.** Statements carry payer accounts (ASCII, reliable);
   Cyrillic payer names are garbled by the PDF font. Store each client's giro account(s) (owner
   fills from the КЕШ_ФАКТУРА doc); match incoming payment `counterpartyAccount → client` and show
   the client name. The app also learns account→client from each manual match.
9. **Categorized expenses need a screen** (currently invisible). Card purchases show the readable
   merchant; transfers (OTHER) have no readable name — manual label + remember-by-account.
10. **Settings: VendorRule CRUD** (add/delete vendor→category rules).
11. **Blagajna expense source** = CASH or CARD/BANK. Card/bank → reconcile to the statement line for
    the day (the statement is the record, B6). Cash → blagajna entry with mandatory photo (B5).
12. **Statements pagination / show-all** in the import center.

## Deferred to the end (owner's request)

- "Редици за внимание" + "FACEBK без receipt" — explain/redesign later.
- Identify the `4080012325273` string (owner to point at the exact screen).

---

## Implementation plan (backlog SM-85 … SM-93)

### SM-85 — Client number + start date + giro accounts (schema + wizard + profile)

- Migration: `Client.number Int @unique`, `Client.startDate DateTime?`; new `ClientBankAccount`
  (clientId, account, label) for one-or-more giro accounts.
- Backfill: assign sequential numbers to the 40 existing clients (editable after).
- Wizard: start date field; client number (auto next, editable); optional giro account(s).
- Profile: show/edit number, start date, accounts.

### SM-86 — Delete + deactivate client

- `deactivateClient` → status non-ACTIVE (audit).
- `deleteClient` → transaction: free linked statement lines, delete payments/expenses/charges/
  lines/packages/templates/adAccounts, then the client; audit the full impact. UI: impact preview +
  typed-name confirmation.
- KESH_FAKTURA ↔ current-clients reconciliation report (helper for the manual cleanup).

### SM-87 — Dual numbering + issue-date-on-approval

- Migration: `Charge.internalRef String?`.
- Helper `internalRef(clientNo, period)` → `1-{clientNo}/{M}-{YYYY}`.
- Backfill internalRef for all existing charges (invoiceNumber unchanged).
- `approveInvoice`: set `issueDate = now()`; from period ≥ 2026-08 set `invoiceNumber` to the new
  scheme; always set `internalRef`. Show both in charges list, profile, and PDF (legal + internal).

### SM-88 — Quarterly packages

- Migration: `BillingCycle` enum + `ServicePackage.billingCycle`.
- Wizard: monthly/quarterly choice.
- W1: for quarterly clients, generate only when the period is on the cycle boundary from startDate;
  amount = the 3-month package amount; one invoice/number; cash partials allowed.

### SM-89 — Charges screen: split + ИЗВРШИ + delete draft + НАПЛАТИ / НАПЛАТА КЕШ

- Two sections (INVOICE / CASH) with per-section ИЗВРШИ (generate DRAFTs; cash → DRAFT).
- Delete-draft action (safe: no number consumed, B1).
- Invoice НАПЛАТИ → statement + incoming-line picker → `manualMatchStatementLine`; credit note
  demoted to secondary.
- Cash НАПЛАТА КЕШ → amount entry → W3 payment; reflects in the charge.

### SM-90 — Решавање: client names + expenses list

- Payments: resolve client from `counterpartyAccount` via client giro accounts + learned history;
  show the name. On manual match, remember the account for that client.
- New **Трошоци** list (filter category/period). Card lines show merchant; OTHER show account + a
  manual label, learn by account.

### SM-91 — Settings: VendorRule CRUD (add/delete).

### SM-92 — Blagajna: expense source + cash collection

- Expense capture: CASH (photo, blagajna) vs CARD/BANK (reconcile to the day's statement line).
- НАПЛАТА КЕШ: filter to CASH clients; show owed/paid per client; record → charge.

### SM-93 — Import center: statements pagination / show-all + total count.

## Sequencing

Foundation first (SM-85 → SM-87 → SM-88 schema/numbering/packages), then screens (SM-89 → SM-92),
then SM-93. SM-86 (delete) can land early so the owner can start cleaning duplicates.
