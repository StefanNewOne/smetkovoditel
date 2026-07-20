import "server-only";
import { formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";

/**
 * Data for the Решавање screen (SM-81): the two resolution queues from the bank statements —
 * incoming payments to match to a client's invoice, and outgoing operating expenses to categorize.
 * Distinct from the Import center alarm queues (receipts / FACEBK / partial), which stay on /import.
 */

export interface ClientOption {
  id: string;
  name: string;
}
export interface ChargeOption {
  id: string;
  clientId: string;
  label: string; // "1-86/2026 · остаток 85.845"
}
export interface PaymentItem {
  id: string;
  amount: string;
  title: string;
  context: string;
  suggestedChargeId?: string; // open charge whose remaining balance exactly equals this payment
  suggestedClientId?: string; // client inferred from the payer (SM-82) — pre-selects the picker
}
export interface ExpenseLineItem {
  id: string;
  amount: string;
  title: string;
  context: string;
  classifiedAs?: string;
}
export interface CategoryOption {
  value: string;
  label: string;
}

/** Operating-expense categories offered for manual categorization (verbatim Macedonian). ADS/ACTORS/
 *  SALARY/HONORAR are excluded — those are booked by their own workflows, never from a bank line. */
export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { value: "FUEL", label: "Гориво" },
  { value: "REPRESENTATION", label: "Кафани / ресторани" },
  { value: "MARKETING", label: "Маркетинг" },
  { value: "RENT", label: "Кирија" },
  { value: "UTILITIES", label: "Комуналии" },
  { value: "PHONE", label: "Телефон / интернет" },
  { value: "EQUIPMENT", label: "Опрема" },
  { value: "BANK_FEES", label: "Банкарски провизии" },
  { value: "OPERATIONS", label: "Оперативни" },
  { value: "OTHER", label: "Друго" },
];

const d0 = (n: number) => formatMKD(n, { decimals: 0 });

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/ДООЕЛ|Д\.?О\.?О\.?|СКОПЈЕ|КОРП\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function getResolveCenter() {
  const [qPayments, qExpenses, clients, open, history] = await Promise.all([
    prisma.statementLine.findMany({
      where: { processed: false, direction: "IN" },
      orderBy: { amount: "desc" },
      take: 200,
    }),
    prisma.statementLine.findMany({
      where: { processed: false, direction: "OUT", classifiedAs: { in: ["CARD_TX", "OTHER"] } },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.charge.findMany({
      where: {
        kind: "INVOICE",
        invoiceNumber: { not: null },
        status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { seqInMonth: "desc" },
      take: 500,
    }),
    // SM-82: learn payer account → client from already-matched incoming payments, so the next
    // payment from the same account auto-suggests that client (Cyrillic payer names are unreadable
    // in the PDF font — the account number is the reliable key).
    prisma.statementLine.findMany({
      where: {
        direction: "IN",
        processed: true,
        counterpartyAccount: { not: null },
        payment: { isNot: null },
      },
      select: { counterpartyAccount: true, payment: { select: { clientId: true } } },
    }),
  ]);

  const accountToClient = new Map<string, string>();
  for (const h of history) {
    if (h.counterpartyAccount && h.payment?.clientId)
      accountToClient.set(h.counterpartyAccount, h.payment.clientId);
  }

  const openCharges: ChargeOption[] = open.map((c) => ({
    id: c.id,
    clientId: c.clientId,
    label: `${c.invoiceNumber} · остаток ${d0(c.total - c.paidAmount)}`,
  }));

  // Exact-amount suggestion: a payment whose value equals the remaining balance of a SINGLE open
  // charge is very likely that invoice (client paid without a повик). A suggestion only (§4.2).
  const byRemaining = new Map<number, typeof open>();
  for (const c of open) {
    const rem = c.total - c.paidAmount;
    const list = byRemaining.get(rem) ?? [];
    list.push(c);
    byRemaining.set(rem, list);
  }
  // Client-name index for the payer auto-suggest (populated once the parser extracts the payer, SM-82).
  const clientByNorm = new Map(clients.map((c) => [norm(c.name), c] as const));

  const payments: PaymentItem[] = qPayments.map((l) => {
    const exact = byRemaining.get(l.amount);
    const payer = l.counterpartyName ?? null;
    // Primary: payer account learned from a prior matched payment. Fallback: payer-name match
    // (works only for the rare readable/Latin payer — Cyrillic names are garbled by the PDF font).
    const byAccount = l.counterpartyAccount
      ? accountToClient.get(l.counterpartyAccount)
      : undefined;
    const byName = payer ? clientByNorm.get(norm(payer))?.id : undefined;
    return {
      id: l.id,
      amount: `+${d0(l.amount)}`,
      title: l.reference ? `Уплата (повик ${l.reference})` : "Уплата без повик",
      context: l.counterpartyAccount ?? payer ?? l.description ?? "",
      suggestedChargeId: exact && exact.length === 1 ? exact[0]!.id : undefined,
      suggestedClientId: byAccount ?? byName,
    };
  });

  const expenses: ExpenseLineItem[] = qExpenses.map((l) => ({
    id: l.id,
    amount: `−${d0(l.amount)}`,
    title: l.counterpartyName || l.description || l.classifiedAs || "Извод-линија",
    context: `${l.classifiedAs ?? "?"} · ${l.counterpartyAccount ?? ""}`,
    classifiedAs: l.classifiedAs ?? undefined,
  }));

  return { payments, expenses, clients, openCharges, categories: EXPENSE_CATEGORIES };
}
