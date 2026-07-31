# Historical import (`_import/`) — SM-79

Load your active clients + their monthly history (Jan 2026 →) from Google Sheets into the system,
preserving real invoice numbers. Real data files here are **gitignored** — only the `*.example`
templates and this README are committed.

## Steps

1. Export three CSVs from your Google Sheet into this folder (copy the templates):
   - `clients.csv` — one row per active client
   - `charges.csv` — one row per client × month (the invoice / cash obligation)
   - `opening.csv` — one row: bank + blagajna opening balances (optional)
2. Dry-run (validates, writes nothing):
   ```
   npm run import:historical
   ```
   Fix any reported errors (they abort the whole run — nothing is half-written).
3. Apply:
   ```
   npm run import:historical -- --apply
   ```
   Idempotent — safe to re-run (existing clients/charges are skipped).

Run `npm run db:seed` first if the DB is empty (creates the admin actor).

## File formats

Amounts are **whole MKD** in MK number format (`35.400` or `35.400,00` or `35400` all = 35.400 ден).
The importer stores them as integer денари (×100). VAT is **taken from your invoices**, never
computed — `base + vat` must equal `total`.

### `clients.csv`

| column               | required     | notes                                    |
| -------------------- | ------------ | ---------------------------------------- |
| `name`               | yes          | client name (unique)                     |
| `taxId`              | INVOICE only | ЕДБ — required for INVOICE clients (B17) |
| `channel`            | yes          | `INVOICE` or `CASH`                      |
| `monthlyAmount`      | yes          | contracted base (MKD)                    |
| `contactEmail`       | no           | for reminders                            |
| `paymentTermDays`    | no           | default 15                               |
| `packageDescription` | no           | invoice line label                       |

### `charges.csv`

| column          | required     | notes                                                                             |
| --------------- | ------------ | --------------------------------------------------------------------------------- |
| `clientName`    | yes          | must match a row in clients.csv                                                   |
| `period`        | yes          | `YYYY-MM` (e.g. `2026-03`)                                                        |
| `invoiceNumber` | INVOICE only | your REAL number, e.g. `1-66/7-2026`. seq is preserved; W1 continues from the max |
| `base`          | yes          | ex-VAT base (MKD)                                                                 |
| `vat`           | yes          | `0` for cash                                                                      |
| `total`         | yes          | must equal base + vat                                                             |
| `paid`          | no           | amount collected so far (MKD); default 0                                          |

Status is derived: `paid >= total` → PAID, `paid > 0` → PARTIALLY_PAID, else OPEN.

### `opening.csv` (optional, one data row)

| column        | notes                                                            |
| ------------- | ---------------------------------------------------------------- |
| `bankOpening` | NLB opening balance (MKD) at import time                         |
| `bankDate`    | `YYYY-MM-DD`                                                     |
| `cashOpening` | blagajna opening balance (MKD) — recorded as one FISCAL IN entry |

## Notes

- Historical payments are recorded as `Payment` rows (so AR/aging is correct) but do **not** create
  per-transaction cash/bank ledger entries — the opening balances already capture the cash position
  (avoids double counting).
- Invoice numbers must be unique within a period (they are, by construction). The importer refuses
  duplicates and any `base+vat≠total` before writing anything.
