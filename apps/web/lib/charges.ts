import "server-only";
import { formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";

export interface ChargeRow {
  id: string;
  clientName: string;
  invoiceNumber: string | null;
  internalRef: string | null;
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
    internalRef: c.internalRef,
    kind: c.kind,
    subtotal: c.subtotal,
    vatAmount: c.vatAmount,
    total: c.total,
    paidAmount: c.paidAmount,
    status: c.status,
  }));
}

export interface PaymentOption {
  id: string;
  label: string; // "Извод 152 · 05.07 · +30.000 · повик 1-3/2026"
}

/** Unmatched incoming statement lines, offered when marking an invoice paid (НАПЛАТИ, SM-89). */
export async function getUnmatchedPayments(): Promise<PaymentOption[]> {
  const lines = await prisma.statementLine.findMany({
    where: { processed: false, direction: "IN" },
    orderBy: { amount: "desc" },
    take: 300,
    include: { import: { select: { statementNumber: true } } },
  });
  const dt = (d: Date) =>
    new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit" });
  return lines.map((l) => ({
    id: l.id,
    label: `Извод ${l.import.statementNumber} · ${dt(l.date)} · +${formatMKD(l.amount, {
      decimals: 0,
    })}${l.reference ? ` · повик ${l.reference}` : ""}${
      l.counterpartyAccount ? ` · ${l.counterpartyAccount}` : ""
    }`,
  }));
}
