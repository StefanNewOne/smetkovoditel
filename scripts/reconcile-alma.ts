/**
 * Reconciliation: the CSV "Наплатено ДДВ" flag (Alma's own record) vs the actual bank truth after
 * the NLB statement import (§2). Surfaces where they disagree, and the incoming bank payments that
 * did not auto-match a повикување (→ manual matching in the Import center, SM-78).
 *   npx dotenv -e .env.local -- tsx scripts/reconcile-alma.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@smetko/db";

const CSV = resolve(import.meta.dirname, "..", "Фактури - Alma DIzajn - SMETKOVODSTVO.csv");
const num = (s: string | undefined) => Number((s ?? "").replace(/[",\s]/g, "")) || 0;

function csvPaidNumbers(): Set<string> {
  const rows = readFileSync(CSV, "utf8").split(/\r?\n/).slice(1);
  const paid = new Set<string>();
  for (const line of rows) {
    // naive split is fine here: the only quoted fields are the amounts (no commas we need)
    const c = line.split(",");
    // columns: Месец,Извод,Датум,Коминтет,Сума,ДДВ,Број,НаплатеноДДВ,...
    // amounts are quoted so indices shift; re-parse with a tolerant quoted-CSV split
    const cells =
      line.match(/(".*?"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "")) ?? c;
    const number = (cells[6] ?? "").trim();
    const paidVat = num(cells[7]);
    if (/^\d-\d{1,4}\/\d{4}$/.test(number) && paidVat > 0) paid.add(number); // valid invoice numbers only
  }
  return paid;
}

async function main() {
  const csvPaid = csvPaidNumbers();
  const charges = await prisma.charge.findMany({
    where: { kind: "INVOICE", invoiceNumber: { not: null } },
    select: { invoiceNumber: true, status: true, total: true, paidAmount: true },
  });
  const bankPaid = new Set(charges.filter((c) => c.status === "PAID").map((c) => c.invoiceNumber!));

  const agree = [...csvPaid].filter((n) => bankPaid.has(n));
  const csvOnly = [...csvPaid].filter((n) => !bankPaid.has(n)); // CSV says paid, no bank match
  const bankOnly = [...bankPaid].filter((n) => !csvPaid.has(n)); // bank paid, CSV not flagged

  const inLines = await prisma.statementLine.findMany({
    where: { direction: "IN", processed: false },
    select: { amount: true, reference: true, classifiedAs: true },
  });
  const unmatchedIn = inLines.reduce((s, l) => s + l.amount, 0);

  const mkd = (den: number) => (den / 100).toLocaleString("mk-MK");
  console.log("════════ РЕКОНСИЛИЈАЦИЈА (CSV vs банка) ════════");
  console.log(`Фактури вкупно: ${charges.length}`);
  console.log(
    `CSV обележани платени: ${csvPaid.size}   ·   Банкарски спарени (PAID): ${bankPaid.size}`,
  );
  console.log(`\n✓ Се совпаѓаат (платени во CSV И спарени од банка): ${agree.length}`);
  console.log(
    `\n⚠ CSV вели платено, но НЕМА банкарска уплата (${csvOnly.length}) — за истражување:`,
  );
  console.log("   " + csvOnly.sort().join(", "));
  console.log(`\nℹ Банка спари, но CSV не обележал платено (${bankOnly.length}):`);
  console.log("   " + bankOnly.sort().join(", "));
  console.log(
    `\n💰 Влезни банкарски уплати БЕЗ спарен повик: ${inLines.length} линии · Σ ${mkd(unmatchedIn)} ден`,
  );
  console.log(
    "   (клиенти платиле без точен повикување на број → рачно спарување во Import центар, SM-78)",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
