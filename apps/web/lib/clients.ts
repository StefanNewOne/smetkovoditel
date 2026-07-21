import "server-only";
import { ChargeStatus, prisma } from "@smetko/db";

const OPEN_STATUSES: ChargeStatus[] = [
  ChargeStatus.OPEN,
  ChargeStatus.PARTIALLY_PAID,
  ChargeStatus.OVERDUE,
];

/** Clients for the list, with active package, open amount, and which extras are configured. */
export async function getClients(channel?: "INVOICE" | "CASH") {
  const clients = await prisma.client.findMany({
    where: channel ? { paymentChannel: channel } : undefined,
    orderBy: { name: "asc" },
    include: {
      packages: { orderBy: { effectiveFrom: "desc" } },
      lineTemplates: { where: { active: true } },
      charges: {
        where: { status: { in: OPEN_STATUSES } },
        select: { total: true, paidAmount: true },
      },
    },
  });

  return clients
    .map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      taxId: c.taxId,
      paymentChannel: c.paymentChannel,
      status: c.status,
      creditBalance: c.creditBalance,
      activePackage: c.packages.find((p) => p.effectiveTo === null) ?? c.packages[0] ?? null,
      openAmount: c.charges.reduce((sum, ch) => sum + (ch.total - ch.paidAmount), 0),
      hasMetaAds: c.lineTemplates.some((t) => t.type === "META_ADS"),
      hasActors: c.lineTemplates.some((t) => t.type === "ACTORS"),
    }))
    .sort((a, b) => (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1));
}

/** One client with full profile data (package history, charges, extras). */
export async function getClient(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      packages: { orderBy: { effectiveFrom: "desc" } },
      lineTemplates: { where: { active: true } },
      adAccounts: true,
      bankAccounts: { orderBy: { createdAt: "asc" } },
      charges: { orderBy: { issueDate: "desc" }, include: { lines: true } },
    },
  });
  if (!client) return null;

  const activePackage =
    client.packages.find((p) => p.effectiveTo === null) ?? client.packages[0] ?? null;
  const openAmount = client.charges
    .filter((ch) => OPEN_STATUSES.includes(ch.status))
    .reduce((sum, ch) => sum + (ch.total - ch.paidAmount), 0);

  return { ...client, activePackage, openAmount };
}
