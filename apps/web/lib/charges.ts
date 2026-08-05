import "server-only";
import { formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";

export interface ChargeRow {
  id: string;
  clientName: string;
  period: string;
  invoiceNumber: string | null;
  internalRef: string | null;
  kind: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  paidAmount: number;
  status: string;
}

function toRow(c: {
  id: string;
  client: { name: string };
  period: string;
  invoiceNumber: string | null;
  internalRef: string | null;
  kind: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  paidAmount: number;
  status: string;
}): ChargeRow {
  return {
    id: c.id,
    clientName: c.client.name,
    period: c.period,
    invoiceNumber: c.invoiceNumber,
    internalRef: c.internalRef,
    kind: c.kind,
    subtotal: c.subtotal,
    vatAmount: c.vatAmount,
    total: c.total,
    paidAmount: c.paidAmount,
    status: c.status,
  };
}

/** Charges for a period (both invoices and cash obligations), for the Задолжувања screen. */
export async function getCharges(period: string): Promise<ChargeRow[]> {
  const charges = await prisma.charge.findMany({
    where: { period },
    orderBy: [{ kind: "asc" }, { seqInMonth: "asc" }, { id: "asc" }],
    include: { client: { select: { name: true } } },
  });
  return charges.map(toRow);
}

/** SM-117 — all of one client's charges for a calendar year (across months), newest month first. */
export async function getChargesByClient(clientId: string, year: string): Promise<ChargeRow[]> {
  const charges = await prisma.charge.findMany({
    where: { clientId, period: { startsWith: `${year}-` } },
    orderBy: [{ period: "desc" }, { kind: "asc" }, { seqInMonth: "asc" }],
    include: { client: { select: { name: true } } },
  });
  return charges.map(toRow);
}

/** Client options for the Задолжувања client filter (SM-117). */
export async function getClientOptions(): Promise<{ id: string; name: string }[]> {
  return prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: [{ number: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
}

export interface ChargeEditLine {
  description: string;
  amount: number; // дени
}
export interface ChargeEditData {
  kind: string;
  editableLines: ChargeEditLine[]; // SERVICE first, then OTHER — user-editable
  passthrough: ChargeEditLine[]; // ADS/ACTORS — computed, shown read-only
}

/** SM-116 — the lines of a DRAFT charge, split into editable (SERVICE/OTHER) and the auto-computed
 *  pass-through (ADS/ACTORS) which the edit form must not touch. */
export async function getChargeForEdit(chargeId: string): Promise<ChargeEditData | null> {
  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: { lines: true },
  });
  if (!charge) return null;
  const rank: Record<string, number> = { SERVICE: 0, OTHER: 1 };
  const editableLines = charge.lines
    .filter((l) => l.type === "SERVICE" || l.type === "OTHER")
    .sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9))
    .map((l) => ({ description: l.description, amount: l.amount }));
  const passthrough = charge.lines
    .filter((l) => l.type === "META_ADS" || l.type === "ACTORS")
    .map((l) => ({ description: l.description, amount: l.amount }));
  return { kind: charge.kind, editableLines, passthrough };
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
