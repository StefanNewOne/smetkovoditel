# SM-113 — unified, legally-complete invoice template + company profile

**Type:** Feature · **Refs:** Master Plan §7 (invoice PDF, D1 issuer identity), B1/B11. Based on a
review of the owner's 26 real Word invoices in `Фактури за Клиенти - Пример`.

## Findings (real invoices vs system vs law)

Real invoices carry: issuer name+address+phone+email; client legal name (quoted) + address; a
Количина/Единечна цена/Вкупно line table; Вкупно→ДДВ 18%→За плаќање totals; a footer (term +
late-interest + no-complaints clauses); Скопје + date; Управител name. **Defects to fix, not copy:**
the recipient block shows ALMA's tax number/bank (not the client's ЕДБ), so the client's ЕДБ is
absent; one invoice mislabels 18% VAT as "ДДВ 0 %".

Legal (МК ЗДДВ чл. 53) requires the **buyer's ЕДБ** on a B2B invoice — the single most important gap.

## Scope (owner-confirmed)

Add to invoices: **client ЕДБ**, **client legal name**, **quantity + unit price** columns. Style:
clean branded (keep the GoDigital design) + legally complete. (Датум на промет deferred.)

## Build

1. **`CompanyProfile` singleton** (issuer identity moved out of the hardcoded `ISSUER` const, per D1):
   name, address, phone, email, taxId, bankName, account, director, invoiceFooter. Seeded with Alma's
   real data. Editable in Подесувања → „Профил на компанија" (writer, audited).
2. **`Client.legalName`** (правно име, optional) + surface `legalName`/`taxId`(ЕДБ)/`address` for edit
   on the client profile („Правни податоци" card) so the 33 existing clients can get an ЕДБ, and in the
   new-client wizard.
3. **Invoice template redesign** (`invoice-document.tsx` + `render-invoice.tsx`): issuer contact block;
   recipient = legalName ?? name + ЕДБ + address; table Опис|Количина|Ед.цена|Износ (qty 1, unit =
   base — matches the real invoices); Основица/ДДВ 18%/За плаќање totals; footer clauses; Скопје+date;
   Управител name. VAT correctly labeled from `VAT_RATE`. Cyrillic-safe (Manrope, already embedded).

## Tests

CompanyProfile seed/read; client legalName persists and edit action updates ЕДБ; invoice PDF renders
to a non-empty buffer with the client ЕДБ present.

## Out of scope

Датум на промет, per-line VAT display, multi-quantity data entry (lines stay single-amount; qty shown
as 1). Logo image swap (owner-delivered) stays the current GO badge.
