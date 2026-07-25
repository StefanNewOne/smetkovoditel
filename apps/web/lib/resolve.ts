import "server-only";
import { formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";
import { attachmentRef } from "@/lib/attachments";
import { getExpenseCategoryOptions } from "@/lib/expenses";

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
/** Source-document context shared by both resolve queues (SM-99 phase B) — makes each row readable. */
export interface LineSource {
  statementNumber: number;
  date: string;
  account: string | null; // counterparty giro (payer/payee) — the reliable key (Cyrillic names garble)
  pdfUrl: string | null; // servable "Види извод" link, or null for historical local: refs
  pdfName: string | null; // filename fallback when the PDF is not served in-app
}
export interface PaymentItem extends LineSource {
  id: string;
  amount: string;
  title: string;
  context: string;
  hasAccount: boolean; // an account is present → offer "link account to client + settle (FIFO)"
  suggestedChargeId?: string; // open charge whose remaining balance exactly equals this payment
  suggestedClientId?: string; // client inferred from the payer (SM-82) — pre-selects the picker
  suggestedClientName?: string; // shown so the user sees who paid (SM-90)
}
export interface ExpenseLineItem extends LineSource {
  id: string;
  amount: string;
  title: string;
  context: string;
  bankRef: string | null; // card auth code ("Податоци за рекламација")
  classifiedAs?: string;
}
export type { CategoryOption } from "@/lib/expenses";

const d0 = (n: number) => formatMKD(n, { decimals: 0 });
const dt = (d: Date) =>
  new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/ДООЕЛ|Д\.?О\.?О\.?|СКОПЈЕ|КОРП\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function getResolveCenter() {
  const withImport = { import: { select: { statementNumber: true, fileRef: true } } };
  const [qPayments, qExpenses, clients, open, history, giro, categories] = await Promise.all([
    prisma.statementLine.findMany({
      where: { processed: false, direction: "IN" },
      orderBy: { amount: "desc" },
      take: 200,
      include: withImport,
    }),
    prisma.statementLine.findMany({
      where: { processed: false, direction: "OUT", classifiedAs: { in: ["CARD_TX", "OTHER"] } },
      orderBy: { date: "desc" },
      take: 200,
      include: withImport,
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
    // SM-90: explicit client giro accounts — the authoritative account → client mapping.
    prisma.clientBankAccount.findMany({ select: { account: true, clientId: true } }),
    getExpenseCategoryOptions(),
  ]);

  const clientNameById = new Map(clients.map((c) => [c.id, c.name] as const));
  // account → client: giro accounts are authoritative (owner-entered); matched-payment history
  // fills any gaps (learned).
  const accountToClient = new Map<string, string>();
  for (const h of history) {
    if (h.counterpartyAccount && h.payment?.clientId)
      accountToClient.set(h.counterpartyAccount, h.payment.clientId);
  }
  for (const g of giro) accountToClient.set(g.account, g.clientId);

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
    const clientId = byAccount ?? byName;
    return {
      id: l.id,
      amount: `+${d0(l.amount)}`,
      title: l.reference ? `Уплата (повик ${l.reference})` : "Уплата без повик",
      context: payer ?? l.description ?? "",
      statementNumber: l.import.statementNumber,
      date: dt(l.date),
      account: l.counterpartyAccount,
      hasAccount: !!l.counterpartyAccount,
      ...attachmentRef(l.import.fileRef),
      suggestedChargeId: exact && exact.length === 1 ? exact[0]!.id : undefined,
      suggestedClientId: clientId,
      suggestedClientName: clientId ? clientNameById.get(clientId) : undefined,
    };
  });

  const expenses: ExpenseLineItem[] = qExpenses.map((l) => ({
    id: l.id,
    amount: `−${d0(l.amount)}`,
    title: l.description || l.counterpartyName || l.classifiedAs || "Извод-линија",
    context: l.classifiedAs === "CARD_TX" ? "Картична" : "Трансфер",
    statementNumber: l.import.statementNumber,
    date: dt(l.date),
    account: l.counterpartyAccount,
    bankRef: l.bankRef,
    ...attachmentRef(l.import.fileRef),
    classifiedAs: l.classifiedAs ?? undefined,
  }));

  return { payments, expenses, clients, openCharges, categories };
}
