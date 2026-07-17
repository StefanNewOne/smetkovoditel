import type { PrismaClient } from "@prisma/client";

/**
 * Bulk historical importer (SM-79). Loads active clients + their monthly history (Jan 2026 →) from
 * a structured input — bypassing the W1 counter so REAL invoice numbers are preserved, and
 * back-filling periods, payments and opening balances the go-live checklist (§12) needs.
 *
 * Design rules:
 *  - Money in the input is whole MKD (денари visible on the invoice, e.g. 35400) → ×100 stored денари (B10).
 *  - No VAT is computed here — the caller supplies base/vat/total from the real invoices (validated
 *    base+vat==total). We never guess a legal figure.
 *  - Idempotent: a client (by taxId, else name) and a charge (by clientId+period+kind) are skipped
 *    if already present. Safe to re-run.
 *  - Dry-run by default: validates everything and returns a report; writes only when opts.apply.
 *  - Historical payments record AR/aging (Payment rows) but create NO cash/bank ledger entries —
 *    the opening balances already capture the cash position at import time (avoids double counting).
 */
export interface ImportClient {
  name: string;
  taxId?: string | null;
  channel: "INVOICE" | "CASH";
  monthlyAmountMkd: number;
  contactEmail?: string | null;
  paymentTermDays?: number;
  packageDescription?: string | null;
  packageEffectiveFrom?: string; // YYYY-MM-DD, default 2026-01-01
}

export interface ImportCharge {
  clientName: string;
  period: string; // YYYY-MM
  invoiceNumber?: string | null; // real number "1-{n}/{M}-{YYYY}"; blank for CASH_OBLIGATION
  baseMkd: number;
  vatMkd: number; // 0 for cash
  totalMkd: number; // must equal base + vat
  paidMkd?: number; // default 0
  issueDate?: string; // YYYY-MM-DD, default period start
  dueDate?: string; // YYYY-MM-DD, default issue + term
}

export interface ImportInput {
  systemUserId: string;
  clients: ImportClient[];
  charges: ImportCharge[];
  openingBankMkd?: number;
  openingBankDate?: string; // YYYY-MM-DD
  openingCashMkd?: number;
  bankAccountNumber?: string; // default D1
}

export interface ImportReport {
  ok: boolean;
  errors: string[];
  clientsCreated: number;
  clientsSkipped: number;
  periodsCreated: number;
  chargesCreated: number;
  chargesSkipped: number;
  paymentsCreated: number;
  openingBankSet: boolean;
  openingCashSet: boolean;
}

const mkd = (n: number) => Math.round(n * 100); // MKD → денари
const D1_ACCOUNT = "210-0768360001-38";
const periodStartDate = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1));
};
/** Extract seqInMonth (the {n}) from "1-{n}/{M}-{YYYY}". */
const seqFromNumber = (num: string): number | null => {
  const m = num.replace(/\s/g, "").match(/^\d+-(\d+)\//);
  return m ? Number(m[1]) : null;
};

export async function importHistorical(
  db: PrismaClient,
  input: ImportInput,
  opts: { apply: boolean },
): Promise<ImportReport> {
  const report: ImportReport = {
    ok: false,
    errors: [],
    clientsCreated: 0,
    clientsSkipped: 0,
    periodsCreated: 0,
    chargesCreated: 0,
    chargesSkipped: 0,
    paymentsCreated: 0,
    openingBankSet: false,
    openingCashSet: false,
  };
  const err = (m: string) => report.errors.push(m);

  // ── Validate (fail the whole run on any error; never half-import money) ──
  if (!input.systemUserId) err("systemUserId is required (actor for audit).");
  const clientByName = new Map(input.clients.map((c) => [c.name, c]));
  for (const c of input.clients) {
    if (!c.name) err("Client with empty name.");
    if (c.channel === "INVOICE" && !c.taxId) err(`Client ${c.name}: INVOICE requires ЕДБ (B17).`);
    if (!Number.isFinite(c.monthlyAmountMkd) || c.monthlyAmountMkd < 0)
      err(`Client ${c.name}: bad monthlyAmount.`);
  }
  const seenNumbers = new Set<string>();
  for (const ch of input.charges) {
    if (!clientByName.has(ch.clientName))
      err(`Charge references unknown client "${ch.clientName}".`);
    if (!/^\d{4}-\d{2}$/.test(ch.period))
      err(`Charge ${ch.clientName}: bad period "${ch.period}".`);
    if (mkd(ch.baseMkd) + mkd(ch.vatMkd) !== mkd(ch.totalMkd))
      err(`Charge ${ch.clientName}/${ch.period}: base+vat ≠ total.`);
    if ((ch.paidMkd ?? 0) > ch.totalMkd) err(`Charge ${ch.clientName}/${ch.period}: paid > total.`);
    const client = clientByName.get(ch.clientName);
    if (client?.channel === "INVOICE") {
      if (!ch.invoiceNumber) err(`Charge ${ch.clientName}/${ch.period}: INVOICE needs a number.`);
      else {
        if (seqFromNumber(ch.invoiceNumber) == null)
          err(`Charge ${ch.clientName}: unparseable invoice number "${ch.invoiceNumber}".`);
        const key = `${ch.period}#${seqFromNumber(ch.invoiceNumber)}`;
        if (seenNumbers.has(key)) err(`Duplicate seqInMonth in ${ch.period}: ${ch.invoiceNumber}.`);
        seenNumbers.add(key);
      }
    }
  }
  if (report.errors.length > 0) return report; // abort — nothing written

  if (!opts.apply) {
    // Dry-run: report intended counts (best-effort, does not hit unique-skip logic).
    report.ok = true;
    report.clientsCreated = input.clients.length;
    report.chargesCreated = input.charges.length;
    report.paymentsCreated = input.charges.filter((c) => (c.paidMkd ?? 0) > 0).length;
    report.periodsCreated = new Set(input.charges.map((c) => c.period)).size;
    report.openingBankSet = input.openingBankMkd != null;
    report.openingCashSet = input.openingCashMkd != null;
    return report;
  }

  // ── Apply (idempotent) ──
  const periods = new Set(input.charges.map((c) => c.period));
  for (const p of periods) {
    const existing = await db.period.findUnique({ where: { id: p } });
    if (!existing) {
      await db.period.create({ data: { id: p, status: "OPEN" } });
      report.periodsCreated++;
    }
  }

  const clientIdByName = new Map<string, string>();
  for (const c of input.clients) {
    const existing = c.taxId
      ? await db.client.findFirst({ where: { taxId: c.taxId } })
      : await db.client.findFirst({ where: { name: c.name } });
    if (existing) {
      clientIdByName.set(c.name, existing.id);
      report.clientsSkipped++;
      continue;
    }
    const created = await db.client.create({
      data: {
        name: c.name,
        taxId: c.taxId || null,
        contactEmail: c.contactEmail || null,
        paymentChannel: c.channel,
        vatApplicable: c.channel === "INVOICE",
        paymentTermDays: c.paymentTermDays ?? 15,
        packages: {
          create: {
            monthlyAmount: mkd(c.monthlyAmountMkd),
            description: c.packageDescription || "Месечен пакет",
            effectiveFrom: c.packageEffectiveFrom
              ? new Date(c.packageEffectiveFrom)
              : new Date(Date.UTC(2026, 0, 1)),
            createdById: input.systemUserId,
          },
        },
      },
    });
    clientIdByName.set(c.name, created.id);
    report.clientsCreated++;
  }

  for (const ch of input.charges) {
    const clientId = clientIdByName.get(ch.clientName)!;
    const client = clientByName.get(ch.clientName)!;
    const kind = client.channel === "INVOICE" ? "INVOICE" : "CASH_OBLIGATION";
    const existing = await db.charge.findUnique({
      where: { clientId_period_kind: { clientId, period: ch.period, kind } },
    });
    if (existing) {
      report.chargesSkipped++;
      continue;
    }

    const subtotal = mkd(ch.baseMkd);
    const vatAmount = mkd(ch.vatMkd);
    const total = mkd(ch.totalMkd);
    const paidAmount = mkd(ch.paidMkd ?? 0);
    const issue = ch.issueDate ? new Date(ch.issueDate) : periodStartDate(ch.period);
    const due = ch.dueDate
      ? new Date(ch.dueDate)
      : new Date(issue.getTime() + (client.paymentTermDays ?? 15) * 86_400_000);
    const seq = kind === "INVOICE" ? seqFromNumber(ch.invoiceNumber!) : null;
    const status = paidAmount >= total ? "PAID" : paidAmount > 0 ? "PARTIALLY_PAID" : "OPEN";

    const charge = await db.charge.create({
      data: {
        clientId,
        kind,
        period: ch.period,
        seqInMonth: seq,
        invoiceNumber: kind === "INVOICE" ? ch.invoiceNumber : null,
        issueDate: issue,
        dueDate: due,
        status,
        subtotal,
        vatAmount,
        total,
        paidAmount,
        lines: {
          create: [
            {
              type: "SERVICE",
              description: client.packageDescription || "Месечен пакет",
              amount: subtotal,
              vatRate: vatAmount > 0 ? vatAmount / subtotal : 0,
            },
          ],
        },
      },
    });

    if (paidAmount > 0) {
      await db.payment.create({
        data: {
          clientId,
          chargeId: charge.id,
          channel: kind === "INVOICE" ? "BANK" : "CASH",
          amount: paidAmount,
          date: issue,
          reference: ch.invoiceNumber ?? null,
          matchStatus: "MANUAL_MATCHED",
        },
      });
      report.paymentsCreated++;
    }
    report.chargesCreated++;
  }

  // ── Opening balances ──
  if (input.openingBankMkd != null) {
    const acct = input.bankAccountNumber ?? D1_ACCOUNT;
    await db.bankAccount.updateMany({
      where: { accountNumber: acct },
      data: {
        openingBalance: mkd(input.openingBankMkd),
        openingDate: input.openingBankDate ? new Date(input.openingBankDate) : new Date(),
      },
    });
    report.openingBankSet = true;
  }
  if (input.openingCashMkd != null && input.openingCashMkd > 0) {
    const anyPeriod = [...periods][0] ?? "2026-01";
    await db.period.upsert({ where: { id: anyPeriod }, update: {}, create: { id: anyPeriod } });
    await db.cashLedgerEntry.create({
      data: {
        direction: "IN",
        amount: mkd(input.openingCashMkd),
        date: input.openingBankDate
          ? new Date(input.openingBankDate)
          : new Date(Date.UTC(2026, 0, 1)),
        description: "Почетно салдо на благајна (историски внес)",
        counterpartyType: "INTERNAL",
        documentType: "FISCAL",
        documentNumber: "OPENING",
        periodId: anyPeriod,
        createdById: input.systemUserId,
      },
    });
    report.openingCashSet = true;
  }

  report.ok = true;
  return report;
}
