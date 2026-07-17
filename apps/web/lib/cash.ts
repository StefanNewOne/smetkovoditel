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
  charges: { id: string; label: string; remaining: number }[];
}

/** Clients with open charges + those charges, for the cash-collection modal (W3). */
export async function getCollectionData(): Promise<CollectClient[]> {
  const clients = await prisma.client.findMany({
    where: { charges: { some: { status: { in: OPEN_STATUSES } } } },
    orderBy: { name: "asc" },
    include: {
      charges: {
        where: { status: { in: OPEN_STATUSES } },
        orderBy: { issueDate: "asc" },
      },
    },
  });

  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    charges: c.charges.map((ch) => ({
      id: ch.id,
      label: ch.invoiceNumber ?? `Кеш обврска ${ch.period}`,
      remaining: ch.total - ch.paidAmount,
    })),
  }));
}
