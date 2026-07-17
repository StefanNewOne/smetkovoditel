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

export interface QueueItem {
  id: string;
  title: string;
  amount: string | null;
  context: string;
  classifiedAs?: string; // for statement-line items: CLIENT_PAYMENT lines are manually matchable
}

export interface ChargeOption {
  id: string;
  label: string; // "1-3/7-2026 · Client · остаток 12.000"
}

const d0 = (n: number) => formatMKD(n, { decimals: 0 });
const dt = (d: Date) =>
  new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Import center data: statements + the 4 attention queues (§9.4). */
export async function getImportCenter() {
  const [statements, qLines, qReceipts, qFacebk, qPartial, qFailed] = await Promise.all([
    prisma.bankStatementImport.findMany({
      orderBy: { statementNumber: "desc" },
      take: 20,
      include: { _count: { select: { lines: true } } },
    }),
    prisma.statementLine.findMany({
      where: { processed: false, classifiedAs: { in: ["CARD_TX", "OTHER", "CLIENT_PAYMENT"] } },
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
  const openCharges: ChargeOption[] = open.map((c) => ({
    id: c.id,
    label: `${c.invoiceNumber} · ${c.client.name} · остаток ${d0(c.total - c.paidAmount)}`,
  }));

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

  const lines: QueueItem[] = qLines.map((l) => ({
    id: l.id,
    title: l.description || l.classifiedAs || "Извод-линија",
    amount: `${l.direction === "IN" ? "+" : "−"}${d0(l.amount)}`,
    context: `${l.classifiedAs ?? "?"} · ${l.reference ?? l.counterpartyAccount ?? ""}`,
    classifiedAs: l.classifiedAs ?? undefined,
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

  return { statements: statementRows, queues: { lines, receipts, facebk, partial }, openCharges };
}
