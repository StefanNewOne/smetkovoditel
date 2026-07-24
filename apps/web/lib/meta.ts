import "server-only";
import { formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";

/** Data for the META Реклами screen (SM-94) — ad-spend attribution + the two resolution queues. */

export interface SpendRow {
  clientId: string | null;
  clientName: string; // "Сопствен маркетинг" when clientId is null
  count: number;
  total: string;
  totalRaw: number;
}
export interface AdAccountRow {
  metaAccountId: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
}
export interface FacebkLineRow {
  id: string;
  date: string;
  amount: string;
  reference: string | null;
  statementNumber: number;
}
export interface OrphanReceiptRow {
  id: string;
  accountName: string;
  reference: string;
  usd: string;
  date: string;
  attachmentUrl: string | null;
}
export interface ClientOption {
  id: string;
  name: string;
}

const dt = (d: Date) =>
  new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });

export async function getMetaOverview(from?: string, to?: string) {
  const dateFilter =
    from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
          },
        }
      : {};

  const [grouped, clients, accounts, facebk, orphans] = await Promise.all([
    prisma.expense.groupBy({
      by: ["clientId"],
      where: { category: "ADS", ...dateFilter },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.client.findMany({
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    }),
    prisma.adAccount.findMany({
      orderBy: { name: "asc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.statementLine.findMany({
      where: { processed: false, classifiedAs: "META_ADS", direction: "OUT" },
      orderBy: { date: "asc" },
      include: { import: { select: { statementNumber: true } } },
    }),
    prisma.adSpendReceipt.findMany({
      where: { matchStatus: "UNMATCHED" },
      orderBy: { invoiceDate: "desc" },
    }),
  ]);

  const nameById = new Map(clients.map((c) => [c.id, c.name] as const));
  const spend: SpendRow[] = grouped
    .map((g) => ({
      clientId: g.clientId,
      clientName: g.clientId ? (nameById.get(g.clientId) ?? "?") : "Сопствен маркетинг",
      count: g._count,
      total: formatMKD(g._sum.amount ?? 0, { decimals: 0 }),
      totalRaw: g._sum.amount ?? 0,
    }))
    .sort((a, b) => b.totalRaw - a.totalRaw);

  const adAccounts: AdAccountRow[] = accounts.map((a) => ({
    metaAccountId: a.metaAccountId,
    name: a.name,
    clientId: a.clientId,
    clientName: a.client?.name ?? null,
  }));

  const facebkLines: FacebkLineRow[] = facebk.map((l) => ({
    id: l.id,
    date: dt(l.date),
    amount: formatMKD(l.amount, { decimals: 0 }),
    reference: l.reference,
    statementNumber: l.import.statementNumber,
  }));

  const orphanReceipts: OrphanReceiptRow[] = orphans.map((r) => ({
    id: r.id,
    accountName: r.accountName,
    reference: r.referenceNumber,
    usd: `$${(r.amountUsd / 100).toFixed(2)}`,
    date: r.invoiceDate ? dt(r.invoiceDate) : "—",
    attachmentUrl: r.attachmentUrl,
  }));

  const clientOptions: ClientOption[] = clients.map((c) => ({
    id: c.id,
    name: c.status === "ACTIVE" ? c.name : `${c.name} (неактивен)`,
  }));

  return { spend, adAccounts, facebkLines, orphanReceipts, clientOptions };
}
