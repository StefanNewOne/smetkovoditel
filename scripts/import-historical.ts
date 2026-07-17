/**
 * SM-79 CLI: load historical clients + monthly charges + opening balances from CSV files in
 * `_import/` (see _import/README.md). Dry-run by default; pass --apply to write.
 *
 *   npx tsx scripts/import-historical.ts            # dry-run (validate + report)
 *   npx tsx scripts/import-historical.ts --apply    # write to the DB
 *
 * The DB is chosen by DATABASE_URL (load .env.local: `npx dotenv -e .env.local -- tsx scripts/…`).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ImportCharge,
  type ImportClient,
  type ImportInput,
  importHistorical,
  prisma,
} from "@smetko/db";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = resolve(ROOT, "_import");

/** Minimal CSV parser with quoted-field support. Returns array of row objects keyed by header. */
function parseCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((h) => h.trim());
  return rows
    .slice(1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** MK number → number. "35.400,00" / "35.400" / "35400" → 35400. Empty → 0. */
function num(s: string | undefined): number {
  if (!s) return 0;
  return Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!existsSync(DIR)) {
    console.error(`Missing ${DIR}. Copy the templates from _import/*.example and fill them.`);
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!user) {
    console.error("No admin user found — run `npm run db:seed` first.");
    process.exit(1);
  }

  const clients: ImportClient[] = parseCsv(resolve(DIR, "clients.csv")).map((r) => ({
    name: r.name!,
    taxId: r.taxId || null,
    channel: (r.channel || "INVOICE").toUpperCase() === "CASH" ? "CASH" : "INVOICE",
    monthlyAmountMkd: num(r.monthlyAmount),
    contactEmail: r.contactEmail || null,
    paymentTermDays: r.paymentTermDays ? Number(r.paymentTermDays) : undefined,
    packageDescription: r.packageDescription || null,
  }));

  const charges: ImportCharge[] = parseCsv(resolve(DIR, "charges.csv")).map((r) => ({
    clientName: r.clientName!,
    period: r.period!,
    invoiceNumber: r.invoiceNumber || null,
    baseMkd: num(r.base),
    vatMkd: num(r.vat),
    totalMkd: num(r.total),
    paidMkd: num(r.paid),
  }));

  let opening: Record<string, string> = {};
  if (existsSync(resolve(DIR, "opening.csv")))
    opening = parseCsv(resolve(DIR, "opening.csv"))[0] ?? {};

  const input: ImportInput = {
    systemUserId: user.id,
    clients,
    charges,
    openingBankMkd: opening.bankOpening ? num(opening.bankOpening) : undefined,
    openingBankDate: opening.bankDate || undefined,
    openingCashMkd: opening.cashOpening ? num(opening.cashOpening) : undefined,
  };

  console.log(
    `Parsed ${clients.length} clients, ${charges.length} charges. Mode: ${apply ? "APPLY" : "DRY-RUN"}`,
  );
  const report = await importHistorical(prisma, input, { apply });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error(`\n✗ ${report.errors.length} error(s) — nothing written. Fix and re-run.`);
    process.exit(1);
  }
  console.log(apply ? "\n✓ Applied." : "\n✓ Dry-run OK. Re-run with --apply to write.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
