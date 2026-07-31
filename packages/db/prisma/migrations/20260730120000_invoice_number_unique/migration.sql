-- B1: legal invoice numbers must be globally unique. Under the 2026-08+ numbering scheme the legal
-- number is derived from client + period (internalRef "1-{clientNo}/{M}-{YYYY}"), so without this two
-- invoices for the same client in the same month would silently carry the identical legal number.
-- Postgres unique indexes treat NULLs as distinct, so CASH_OBLIGATION rows (invoiceNumber IS NULL)
-- are unaffected and may coexist freely.
CREATE UNIQUE INDEX "Charge_invoiceNumber_key" ON "Charge"("invoiceNumber");
