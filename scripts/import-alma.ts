/**
 * Alma Dizajn real-data importer (clients + issued invoices Jan–Jul 2026).
 * Reads the two root CSVs, reconciles them, and loads via the historical engine.
 *
 *   npx dotenv -e .env.local -- tsx scripts/import-alma.ts           # dry-run (report only)
 *   npx dotenv -e .env.local -- tsx scripts/import-alma.ts --apply   # write
 *
 * Source files (gitignored — real financial data):
 *   Фактури - Alma DIzajn - SMETKOVODSTVO.csv   issued invoices (legal-entity names)
 *   Фактури - Alma DIzajn - КЕШ_ФАКТУРА.csv      roster: brand, channel, EUR price, legal entity
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ImportCharge, type ImportClient, importHistorical, prisma } from "@smetko/db";

const ROOT = resolve(import.meta.dirname, "..");
const INVOICES = resolve(ROOT, "Фактури - Alma DIzajn - SMETKOVODSTVO.csv");
const ROSTER = resolve(ROOT, "Фактури - Alma DIzajn - КЕШ_ФАКТУРА.csv");
const EUR_MKD = 61.5; // denar is pegged to EUR (~61.5) — used only for cash clients' package amount

function parseCsv(path: string): string[][] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "",
    row: string[] = [],
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') ((field += '"'), i++);
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") (row.push(field), (field = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) (row.push(field), rows.push(row));
  return rows;
}

/** MK thousands-comma number: "30,600" → 30600, "5,508" → 5508. Empty → 0. */
const num = (s: string | undefined) => Number((s ?? "").replace(/[",\s]/g, "")) || 0;

const MONTHS: Record<string, string> = {
  јануар: "01",
  февруари: "02",
  март: "03",
  април: "04",
  мај: "05",
  maj: "05",
  јуни: "06",
  јули: "07",
  август: "08",
  септември: "09",
  октомври: "10",
  ноември: "11",
  декември: "12",
};
function periodOf(mesec: string): string | null {
  const key = mesec.trim().toLowerCase();
  if (/^20\d{2}/.test(key)) return "PRIOR"; // "2025та" / "2025а" — prior-year block
  return MONTHS[key] ? `2026-${MONTHS[key]}` : null;
}

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/ДООЕЛ|Д\.?О\.?О\.?|СКОПЈЕ|КОРП\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const apply = process.argv.includes("--apply");
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  // ── Roster: brand → { channel, eur, legal } ──
  const rosterRows = parseCsv(ROSTER)
    .slice(1)
    .filter((r) => (r[0] ?? "").trim());
  const roster = rosterRows.map((r) => ({
    brand: (r[0] ?? "").trim(),
    channel: (r[1] ?? "").trim().toUpperCase() === "КЕШ" ? ("CASH" as const) : ("INVOICE" as const),
    eur: num((r[2] ?? "").replace(/евра/i, "")),
    legal: (r[4] ?? "").trim(),
  }));
  const rosterByLegal = new Map(roster.filter((r) => r.legal).map((r) => [norm(r.legal), r]));

  // ── Invoices: one row per issued invoice ──
  const invRows = parseCsv(INVOICES).slice(1);
  const charges: ImportCharge[] = [];
  const invoiceClients = new Map<string, { name: string; bases: Map<string, number> }>();
  const seenNumbers = new Set<string>();

  for (const r of invRows) {
    const mesec = (r[0] ?? "").trim();
    const client = (r[3] ?? "").trim();
    if (!client) continue; // blank separator row
    const base = num(r[4]);
    const vat = num(r[5]);
    const number = (r[6] ?? "").trim();
    const paidVat = num(r[7]);
    const period = periodOf(mesec);

    if (period === "PRIOR") {
      warn(`ПРЕЛАНИ (${mesec}): ${client} — прескокнато (нема број / друга година)`);
      continue;
    }
    if (!period) {
      warn(`Непознат месец "${mesec}" за ${client} — прескокнато`);
      continue;
    }
    if (!number) {
      warn(`${client} ${period}: нема број на фактура — прескокнато`);
      continue;
    }
    if (base === 0) {
      warn(`${client} ${number}: нема износ (Сума празна) — прескокнато`);
      continue;
    }
    if (seenNumbers.has(number)) warn(`ДУПЛ број ${number} (${client}) — внесен и двата, провери`);
    seenNumbers.add(number);
    if (vat > 0 && Math.abs(base * 0.18 - vat) > base * 0.02)
      warn(
        `${client} ${number}: ДДВ ${vat} ≠ 18% од ${base} (${Math.round(base * 0.18)}) — внесен како што е`,
      );

    charges.push({
      clientName: client,
      period,
      invoiceNumber: number,
      baseMkd: base,
      vatMkd: vat,
      totalMkd: base + vat,
      // Charges import OPEN — payments are the bank's truth (Master Plan §2); the NLB statement
      // import creates them by matching повикување. The CSV "Наплатено ДДВ" flag is used only in
      // the end-of-run reconciliation (scripts/reconcile-alma.ts), not as the paid status.
      paidMkd: 0,
    });

    const rec = invoiceClients.get(client) ?? { name: client, bases: new Map() };
    rec.bases.set(period, base);
    invoiceClients.set(client, rec);
  }

  // ── Clients: INVOICE (from invoices) + CASH (roster) ──
  const clients: ImportClient[] = [];
  for (const [name, rec] of invoiceClients) {
    const periodsSorted = [...rec.bases.keys()].sort();
    const latestBase = rec.bases.get(periodsSorted[periodsSorted.length - 1]!)!;
    const rMatch = rosterByLegal.get(norm(name));
    clients.push({
      name,
      channel: "INVOICE",
      taxId: null, // historical — ЕДБ added later before new invoices
      monthlyAmountMkd: latestBase,
      packageDescription: "Месечен пакет",
    });
    if (!rMatch) warn(`Клиент "${name}" нема совпаѓање во КЕШ-роштерот (нема EUR/бренд) — ок`);
  }
  for (const r of roster.filter((x) => x.channel === "CASH")) {
    if (invoiceClients.has(r.brand)) continue;
    clients.push({
      name: r.brand,
      channel: "CASH",
      monthlyAmountMkd: Math.round(r.eur * EUR_MKD),
      packageDescription: "Месечно (кеш)",
    });
  }

  // ── Report ──
  const totInvoiced = charges.reduce((s, c) => s + c.totalMkd, 0);
  const totPaid = charges.reduce((s, c) => s + (c.paidMkd ?? 0), 0);
  console.log("════════ ALMA IMPORT — reconciliation ════════");
  console.log(
    `Clients:  ${clients.length}  (INVOICE ${clients.filter((c) => c.channel === "INVOICE").length}, CASH ${clients.filter((c) => c.channel === "CASH").length})`,
  );
  console.log(
    `Invoices: ${charges.length}   Периоди: ${[...new Set(charges.map((c) => c.period))].sort().join(", ")}`,
  );
  console.log(
    `Фактурирано вкупно: ${totInvoiced.toLocaleString("mk-MK")} ден  ·  Наплатено: ${totPaid.toLocaleString("mk-MK")} ден  ·  Отворено: ${(totInvoiced - totPaid).toLocaleString("mk-MK")} ден`,
  );
  console.log(`\n── ${warnings.length} предупредувања ──`);
  warnings.forEach((w) => console.log("  ⚠ " + w));

  const user = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!user) throw new Error("Нема admin корисник — прво `npm run db:seed`.");

  const report = await importHistorical(
    prisma,
    { systemUserId: user.id, clients, charges },
    { apply, historical: true },
  );
  console.log(`\n── Engine (${apply ? "APPLY" : "DRY-RUN"}) ──`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error(`\n✗ ${report.errors.length} грешки — ништо не е запишано.`);
    process.exit(1);
  }
  console.log(apply ? "\n✓ Внесено." : "\n✓ Dry-run ОК. Прегледај, па повтори со --apply.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
