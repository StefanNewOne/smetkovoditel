import "server-only";
import { formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";

export interface StatementRow {
  id: string;
  statementNumber: number;
  date: string;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
  orderCount: number;
  lineCount: number;
  status: string;
  integrityOk: boolean;
}

export interface ChargeOption {
  id: string;
  label: string; // "1-3/7-2026 · Client · остаток 12.000"
}

export interface QueueItem {
  id: string;
  title: string;
  amount: string | null;
  context: string;
  classifiedAs?: string; // for statement-line items
  direction?: "IN" | "OUT";
  suggestion?: ChargeOption; // an open charge whose total exactly equals this incoming payment
}

const d0 = (n: number) => formatMKD(n, { decimals: 0 });
const dt = (d: Date) =>
  new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Import center data: statements + the 4 attention queues (§9.4). */
export async function getImportCenter() {
  const [statements, qPayments, qLines, qReceipts, qFacebk, qPartial, qFailed] = await Promise.all([
    prisma.bankStatementImport.findMany({
      orderBy: { statementNumber: "desc" },
      take: 400, // SM-93: show all statements (scrollable), not just the latest 20
      include: { _count: { select: { lines: true } } },
    }),
    // Incoming bank payments not yet matched to a charge (client paid, maybe without a повик).
    prisma.statementLine.findMany({
      where: { processed: false, direction: "IN" },
      orderBy: { amount: "desc" },
      take: 200,
    }),
    // Outgoing lines that did not auto-categorize (fees / uncategorized card) — noise to resolve.
    prisma.statementLine.findMany({
      where: { processed: false, direction: "OUT", classifiedAs: { in: ["CARD_TX", "OTHER"] } },
      orderBy: { date: "desc" },
      take: 50,
    }),
    prisma.adSpendReceipt.findMany({ where: { matchStatus: "UNMATCHED" }, take: 50 }),
    prisma.statementLine.findMany({
      where: { processed: false, classifiedAs: "META_ADS" },
      take: 50,
    }),
    prisma.adSpendReceipt.findMany({ where: { parseStatus: "PARTIAL" }, take: 50 }),
    prisma.bankStatementImport.findMany({ where: { status: "FAILED" }, take: 50 }),
  ]);

  // Open charges offered as manual-match targets for unresolved CLIENT_PAYMENT lines (§9.4).
  const open = await prisma.charge.findMany({
    where: {
      kind: "INVOICE",
      invoiceNumber: { not: null },
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { client: { select: { name: true } } },
    orderBy: { seqInMonth: "desc" },
    take: 100,
  });
  const optionOf = (c: (typeof open)[number]): ChargeOption => ({
    id: c.id,
    label: `${c.invoiceNumber} · ${c.client.name} · остаток ${d0(c.total - c.paidAmount)}`,
  });
  const openCharges: ChargeOption[] = open.map(optionOf);
  // Suggest by amount: an incoming payment whose value EXACTLY equals a single open charge's total
  // is very likely that invoice (client paid without a повик). A suggestion only — human confirms.
  const openByTotal = new Map<number, typeof open>();
  for (const c of open) {
    const list = openByTotal.get(c.total) ?? [];
    list.push(c);
    openByTotal.set(c.total, list);
  }

  const statementRows: StatementRow[] = statements.map((s) => ({
    id: s.id,
    statementNumber: s.statementNumber,
    date: dt(s.statementDate),
    opening: d0(s.openingBalance),
    debit: d0(s.totalDebit),
    credit: d0(s.totalCredit),
    closing: d0(s.closingBalance),
    orderCount: s.orderCount,
    lineCount: s._count.lines,
    status: s.status,
    integrityOk: s.status === "PARSED" && s._count.lines === s.orderCount,
  }));

  const payments: QueueItem[] = qPayments.map((l) => {
    const exact = openByTotal.get(l.amount);
    return {
      id: l.id,
      title: l.reference ? `Уплата (повик ${l.reference})` : "Уплата без повик",
      amount: `+${d0(l.amount)}`,
      context: l.counterpartyAccount ?? l.description ?? "",
      direction: "IN" as const,
      suggestion: exact && exact.length === 1 ? optionOf(exact[0]!) : undefined,
    };
  });
  const lines: QueueItem[] = qLines.map((l) => ({
    id: l.id,
    title: l.description || l.classifiedAs || "Извод-линија",
    amount: `−${d0(l.amount)}`,
    context: `${l.classifiedAs ?? "?"} · ${l.counterpartyAccount ?? ""}`,
    classifiedAs: l.classifiedAs ?? undefined,
    direction: "OUT" as const,
  }));
  const receipts: QueueItem[] = qReceipts.map((r) => ({
    id: r.id,
    title: r.accountName || r.referenceNumber,
    amount: `$${(r.amountUsd / 100).toFixed(2)}`,
    context: `ref ${r.referenceNumber} · ${r.metaInvoiceNo}`,
  }));
  const facebk: QueueItem[] = qFacebk.map((l) => ({
    id: l.id,
    title: `FACEBK ${l.reference ?? ""}`,
    amount: `−${d0(l.amount)}`,
    context: "линија без receipt (аларм)",
  }));
  const partial: QueueItem[] = [
    ...qPartial.map((r) => ({
      id: r.id,
      title: r.accountName || r.referenceNumber,
      amount: null,
      context: "PARTIAL parse — рачно",
    })),
    ...qFailed.map((s) => ({
      id: s.id,
      title: `Извод ${s.statementNumber}`,
      amount: null,
      context: "FAILED интегритет (B14)",
    })),
  ];

  return {
    statements: statementRows,
    queues: { payments, lines, receipts, facebk, partial },
    openCharges,
  };
}
