import "server-only";
import { prisma } from "@smetko/db";

export interface ChargeRow {
  id: string;
  clientName: string;
  invoiceNumber: string | null;
  kind: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  paidAmount: number;
  status: string;
}

/** Charges for a period (both invoices and cash obligations), for the Задолжувања screen. */
export async function getCharges(period: string): Promise<ChargeRow[]> {
  const charges = await prisma.charge.findMany({
    where: { period },
    orderBy: [{ kind: "asc" }, { seqInMonth: "asc" }, { id: "asc" }],
    include: { client: { select: { name: true } } },
  });

  return charges.map((c) => ({
    id: c.id,
    clientName: c.client.name,
    invoiceNumber: c.invoiceNumber,
    kind: c.kind,
    subtotal: c.subtotal,
    vatAmount: c.vatAmount,
    total: c.total,
    paidAmount: c.paidAmount,
    status: c.status,
  }));
}
