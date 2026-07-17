import "server-only";
import { formatMKD, periodStart, shiftPeriod } from "@smetko/shared";
import { ChargeStatus, prisma } from "@smetko/db";

const OPEN: ChargeStatus[] = [ChargeStatus.OPEN, ChargeStatus.PARTIALLY_PAID, ChargeStatus.OVERDUE];
const d0 = (n: number) => formatMKD(n, { decimals: 0 });

export interface MarginRow {
  clientId: string;
  name: string;
  revenue: number;
  cost: number;
  margin: number;
  pct: number;
}

/** Reports for a period: P&L, margin per client, aging (global open AR), cash flow. */
export async function getReports(period: string) {
  const start = periodStart(period);
  const nextStart = periodStart(shiftPeriod(period, 1));

  const [charges, expenses, openCharges, cashAgg, bankLines] = await Promise.all([
    prisma.charge.findMany({
      where: { period, kind: { in: ["INVOICE", "CASH_OBLIGATION"] }, status: { not: "CANCELLED" } },
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.expense.findMany({ where: { date: { gte: start, lt: nextStart } } }),
    prisma.charge.findMany({ where: { status: { in: OPEN } } }),
    Promise.all([
      prisma.cashLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { direction: "IN", periodId: period },
      }),
      prisma.cashLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { direction: "OUT", periodId: period },
      }),
    ]),
    prisma.statementLine.findMany({
      where: { date: { gte: start, lt: nextStart } },
      select: { amount: true, direction: true },
    }),
  ]);

  // ── P&L ──
  const revenue = charges.reduce((s, c) => s + c.subtotal, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = revenue - expenseTotal;

  // ── Margin per client ──
  const byClient = new Map<string, MarginRow>();
  for (const c of charges) {
    const row = byClient.get(c.clientId) ?? {
      clientId: c.clientId,
      name: c.client.name,
      revenue: 0,
      cost: 0,
      margin: 0,
      pct: 0,
    };
    row.revenue += c.subtotal;
    byClient.set(c.clientId, row);
  }
  for (const e of expenses) {
    if (!e.clientId) continue;
    const row = byClient.get(e.clientId);
    if (row) row.cost += e.amount;
  }
  const margins = [...byClient.values()]
    .map((r) => ({
      ...r,
      margin: r.revenue - r.cost,
      pct: r.revenue > 0 ? (r.revenue - r.cost) / r.revenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Aging (global open AR by dueDate age) ──
  const now = Date.now();
  const buckets = { b0: 0, b16: 0, b31: 0, b60: 0 };
  for (const c of openCharges) {
    const remaining = c.total - c.paidAmount;
    if (remaining <= 0) continue;
    const days = Math.floor((now - new Date(c.dueDate).getTime()) / 86400000);
    if (days <= 15) buckets.b0 += remaining;
    else if (days <= 30) buckets.b16 += remaining;
    else if (days <= 60) buckets.b31 += remaining;
    else buckets.b60 += remaining;
  }

  // ── Cash flow ──
  const cashIn = cashAgg[0]._sum.amount ?? 0;
  const cashOut = cashAgg[1]._sum.amount ?? 0;
  const bankIn = bankLines.filter((l) => l.direction === "IN").reduce((s, l) => s + l.amount, 0);
  const bankOut = bankLines.filter((l) => l.direction === "OUT").reduce((s, l) => s + l.amount, 0);

  return {
    pl: {
      revenue,
      expenses: expenseTotal,
      profit,
      revenueF: d0(revenue),
      expensesF: d0(expenseTotal),
      profitF: d0(profit),
    },
    margins: margins.map((m) => ({
      ...m,
      revenueF: d0(m.revenue),
      marginF: d0(m.margin),
      pctLabel: `${Math.round(m.pct * 100)}%`,
    })),
    aging: { b0: d0(buckets.b0), b16: d0(buckets.b16), b31: d0(buckets.b31), b60: d0(buckets.b60) },
    cashFlow: {
      cashIn: d0(cashIn),
      cashOut: d0(cashOut),
      bankIn: d0(bankIn),
      bankOut: d0(bankOut),
    },
  };
}
