import "server-only";
import { currentPeriod, formatMKD, periodStart, shiftPeriod } from "@smetko/shared";
import { ChargeKind, ChargeStatus, Direction, prisma } from "@smetko/db";

/**
 * SM-103 — the live Dashboard view model. Read-only aggregation over data other workflows already
 * produce (charges, payments, statements, cash ledger, resolve/import queues). No writes, no money
 * math beyond summation of stored Int денари (B10); all formatting at the boundary via formatMKD.
 */

const OPEN: ChargeStatus[] = [ChargeStatus.OPEN, ChargeStatus.PARTIALLY_PAID, ChargeStatus.OVERDUE];
const d0 = (n: number) => formatMKD(n, { decimals: 0 });
const dt = (d: Date) =>
  new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });

export interface KpiCard {
  label: string;
  value: string;
  sub: string;
}
/** A channel's collection progress (paid vs billed) for the "Задолжено vs наплатено" panel. */
export interface ChannelProgress {
  label: string;
  billed: number; // Σ total of open charges of this kind
  paid: number; // Σ paidAmount on those charges
  remaining: string; // formatted остаток
  pct: number; // paid / billed, 0..1 (bar width)
}
export interface DebtorRow {
  clientId: string;
  name: string;
  initials: string;
  amount: string; // remaining, formatted
  ageDays: number; // age of the oldest open charge for this client
}
export interface AttentionCard {
  key: string;
  label: string;
  count: number;
  href: string;
}
export interface DashboardData {
  kpis: KpiCard[];
  invoices: ChannelProgress;
  cash: ChannelProgress;
  totals: { billed: string; paid: string; remaining: string };
  topDebtors: DebtorRow[];
  attention: AttentionCard[];
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export async function getDashboard(): Promise<DashboardData> {
  const period = currentPeriod();
  const monthStart = periodStart(period);
  const monthEnd = periodStart(shiftPeriod(period, 1));

  const [lastStatement, cashAgg, openCharges, monthPayments, attentionCounts] = await Promise.all([
    prisma.bankStatementImport.findFirst({
      where: { status: "PARSED" },
      orderBy: { statementNumber: "desc" },
      select: { statementNumber: true, statementDate: true, closingBalance: true },
    }),
    // cumulative cash balance (IN − OUT), B3 never-negative
    Promise.all([
      prisma.cashLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { direction: Direction.IN },
      }),
      prisma.cashLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { direction: Direction.OUT },
      }),
    ]),
    prisma.charge.findMany({
      where: {
        status: { in: OPEN },
        kind: { in: [ChargeKind.INVOICE, ChargeKind.CASH_OBLIGATION] },
      },
      select: {
        kind: true,
        total: true,
        paidAmount: true,
        dueDate: true,
        clientId: true,
        client: { select: { name: true } },
      },
    }),
    // Наплатено · тековен месец — payments booked this month (bank matches + cash collections, one
    // Payment row each, so no double-count with the cash ledger).
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { date: { gte: monthStart, lt: monthEnd } },
    }),
    Promise.all([
      // 1) Решавање — unresolved statement lines (incoming to match + categorizable outgoing)
      prisma.statementLine.count({
        where: {
          processed: false,
          OR: [
            { direction: Direction.IN },
            { direction: Direction.OUT, classifiedAs: { in: ["CARD_TX", "OTHER"] } },
          ],
        },
      }),
      // 2) FACEBK/Meta alarms — unmatched receipts + unprocessed META_ADS lines
      prisma.adSpendReceipt.count({ where: { matchStatus: "UNMATCHED" } }),
      prisma.statementLine.count({ where: { processed: false, classifiedAs: "META_ADS" } }),
      // 3) Incomplete parses — PARTIAL receipts + FAILED statements
      prisma.adSpendReceipt.count({ where: { parseStatus: "PARTIAL" } }),
      prisma.bankStatementImport.count({ where: { status: "FAILED" } }),
      // 4) Drafts awaiting approval this period
      prisma.charge.count({ where: { status: ChargeStatus.DRAFT, period } }),
    ]),
  ]);

  const cashBalance = (cashAgg[0]._sum.amount ?? 0) - (cashAgg[1]._sum.amount ?? 0);
  const [resolveN, receiptsUnmatched, metaLines, partialReceipts, failedStatements, draftN] =
    attentionCounts;

  // ── Задолжено vs наплатено, split by channel (over open charges) ──
  const channel = (kind: ChargeKind, label: string): ChannelProgress => {
    const rows = openCharges.filter((c) => c.kind === kind);
    const billed = rows.reduce((s, c) => s + c.total, 0);
    const paid = rows.reduce((s, c) => s + c.paidAmount, 0);
    return {
      label,
      billed,
      paid,
      remaining: d0(billed - paid),
      pct: billed > 0 ? paid / billed : 0,
    };
  };
  const invoices = channel(ChargeKind.INVOICE, "Фактури");
  const cash = channel(ChargeKind.CASH_OBLIGATION, "Кеш");
  const owed = openCharges.reduce((s, c) => s + (c.total - c.paidAmount), 0);

  // ── Топ должници — Σ remaining per client, oldest open charge → age ──
  const now = Date.now();
  const byClient = new Map<string, { name: string; remaining: number; oldestDue: number }>();
  for (const c of openCharges) {
    const remaining = c.total - c.paidAmount;
    if (remaining <= 0) continue;
    const cur = byClient.get(c.clientId) ?? {
      name: c.client.name,
      remaining: 0,
      oldestDue: new Date(c.dueDate).getTime(),
    };
    cur.remaining += remaining;
    cur.oldestDue = Math.min(cur.oldestDue, new Date(c.dueDate).getTime());
    byClient.set(c.clientId, cur);
  }
  const topDebtors: DebtorRow[] = [...byClient.entries()]
    .sort((a, b) => b[1].remaining - a[1].remaining)
    .slice(0, 5)
    .map(([clientId, v]) => ({
      clientId,
      name: v.name,
      initials: initialsOf(v.name),
      amount: d0(v.remaining),
      ageDays: Math.max(0, Math.floor((now - v.oldestDue) / 86400000)),
    }));

  const kpis: KpiCard[] = [
    {
      label: "Салдо банка",
      value: lastStatement ? d0(lastStatement.closingBalance) : "—",
      sub: lastStatement
        ? `НЛБ · извод #${lastStatement.statementNumber} · ${dt(lastStatement.statementDate)}`
        : "нема увезен извод",
    },
    { label: "Салдо благајна", value: d0(cashBalance), sub: "тековно салдо" },
    { label: "Задолжено", value: d0(owed), sub: "отворени фактури + кеш" },
    {
      label: "Наплатено",
      value: d0(monthPayments._sum.amount ?? 0),
      sub: `тековен месец · ${period}`,
    },
  ];

  const attention: AttentionCard[] = [
    { key: "resolve", label: "За решавање", count: resolveN, href: "/resolve" },
    {
      key: "facebk",
      label: "FACEBK аларми",
      count: receiptsUnmatched + metaLines,
      href: "/import",
    },
    {
      key: "partial",
      label: "Нецелосни парсирања",
      count: partialReceipts + failedStatements,
      href: "/import",
    },
    { key: "drafts", label: "Нацрти за одобрување", count: draftN, href: "/charges" },
  ];

  return {
    kpis,
    invoices,
    cash,
    totals: { billed: d0(invoices.billed + cash.billed), paid: d0(invoices.paid + cash.paid), remaining: d0(owed) }, // prettier-ignore
    topDebtors,
    attention,
  };
}
