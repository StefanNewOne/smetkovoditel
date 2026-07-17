import "server-only";
import { prisma } from "@smetko/db";

export interface AllocationView {
  clientId: string;
  clientName: string;
  amount: number;
  billable: boolean;
}

export interface PaymentView {
  id: string;
  period: string;
  gross: number;
  tax: number;
  net: number;
  status: string;
  allocations: AllocationView[];
}

export interface ContractorView {
  id: string;
  name: string;
  idNumber: string | null;
  contractType: string;
  taxMode: string;
  isTalent: boolean;
  defaultRate: number | null;
  payments: PaymentView[];
}

export interface ContractorClient {
  id: string;
  name: string;
}

/** All contractors with their payments (allocations resolved to client names) + client list. */
export async function getContractorsData(): Promise<{
  contractors: ContractorView[];
  clients: ContractorClient[];
}> {
  const [contractors, clients] = await Promise.all([
    prisma.contractor.findMany({
      orderBy: { name: "asc" },
      include: { payments: { orderBy: { period: "desc" } } },
    }),
    prisma.client.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const nameOf = new Map(clients.map((c) => [c.id, c.name]));

  return {
    clients,
    contractors: contractors.map((c) => ({
      id: c.id,
      name: c.name,
      idNumber: c.idNumber,
      contractType: c.contractType,
      taxMode: c.taxMode,
      isTalent: c.isTalent,
      defaultRate: c.defaultRate,
      payments: c.payments.map((p) => {
        const allocs =
          (p.allocations as { clientId: string; amount: number; billable: boolean }[]) ?? [];
        return {
          id: p.id,
          period: p.period,
          gross: p.grossAmount,
          tax: p.taxAmount,
          net: p.netAmount,
          status: p.status,
          allocations: allocs.map((a) => ({
            clientId: a.clientId,
            clientName: nameOf.get(a.clientId) ?? "?",
            amount: a.amount,
            billable: a.billable,
          })),
        };
      }),
    })),
  };
}
