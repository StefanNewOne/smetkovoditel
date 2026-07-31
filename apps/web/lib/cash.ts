import "server-only";
import { ChargeStatus, Direction, prisma } from "@smetko/db";

const OPEN_STATUSES: ChargeStatus[] = [
  ChargeStatus.OPEN,
  ChargeStatus.PARTIALLY_PAID,
  ChargeStatus.OVERDUE,
];

export interface CashEntryRow {
  id: string;
  date: string;
  description: string;
  documentType: string;
  documentNumber: string | null;
  counterpartyType: string;
  direction: string;
  amount: number;
  hasAttachment: boolean;
}

/** Cumulative cash balance + the selected period's in/out, plus the period's journal. */
export async function getCashLedger(period: string) {
  const [inAll, outAll, inPer, outPer, entries] = await Promise.all([
    prisma.cashLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { direction: Direction.IN },
    }),
    prisma.cashLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { direction: Direction.OUT },
    }),
    prisma.cashLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { direction: Direction.IN, periodId: period },
    }),
    prisma.cashLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { direction: Direction.OUT, periodId: period },
    }),
    prisma.cashLedgerEntry.findMany({
      where: { periodId: period },
      orderBy: { date: "desc" },
      take: 200,
    }),
  ]);

  const balance = (inAll._sum.amount ?? 0) - (outAll._sum.amount ?? 0);

  const rows: CashEntryRow[] = entries.map((e) => ({
    id: e.id,
    date: e.date.toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" }),
    description: e.description,
    documentType: e.documentType,
    documentNumber: e.documentNumber,
    counterpartyType: e.counterpartyType,
    direction: e.direction,
    amount: e.amount,
    hasAttachment: !!e.attachmentUrl,
  }));

  return {
    balance,
    periodIn: inPer._sum.amount ?? 0,
    periodOut: outPer._sum.amount ?? 0,
    entries: rows,
  };
}

export interface CollectClient {
  id: string;
  name: string;
  totalOwed: number;
  totalPaid: number;
  charges: { id: string; label: string; remaining: number; paid: number }[];
}

/** CASH clients with open obligations (SM-92) — for НАПЛАТА КЕШ; shows owed vs paid per client. */
export async function getCollectionData(): Promise<CollectClient[]> {
  const clients = await prisma.client.findMany({
    where: {
      paymentChannel: "CASH",
      charges: { some: { status: { in: OPEN_STATUSES } } },
    },
    orderBy: { name: "asc" },
    include: {
      charges: {
        where: { status: { in: OPEN_STATUSES } },
        orderBy: { issueDate: "asc" },
      },
    },
  });

  return clients.map((c) => {
    const charges = c.charges.map((ch) => ({
      id: ch.id,
      label: ch.invoiceNumber ?? `Кеш обврска ${ch.period}`,
      remaining: ch.total - ch.paidAmount,
      paid: ch.paidAmount,
    }));
    return {
      id: c.id,
      name: c.name,
      totalOwed: charges.reduce((s, x) => s + x.remaining, 0),
      totalPaid: charges.reduce((s, x) => s + x.paid, 0),
      charges,
    };
  });
}
