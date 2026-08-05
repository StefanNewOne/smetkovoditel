"use server";

import { revalidatePath } from "next/cache";
import { ChargeKind, ChargeStatus, prisma } from "@smetko/db";
import { currentPeriod, isValidPeriod, zEditCharge } from "@smetko/shared";
import { requireWriter } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";
import { type ChargeEditData, getChargeForEdit } from "@/lib/charges";
import {
  approveCashObligation,
  approveInvoice,
  deleteCharge,
  editChargeLines,
  generateCharges,
  resetChargePayments,
} from "@/lib/workflows/w1";
import { collectCash } from "@/lib/workflows/w3";
import { manualMatchStatementLine, settleLineToInvoices } from "@/lib/workflows/w2";
import { closePeriod, type CloseResult } from "@/lib/workflows/w8";

export type W1Result =
  { ok: true; created: number; skipped: number } | { ok: false; error: string };
export type ApproveResult = { ok: true; invoiceNumber: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function runW1(period: string, channel?: "INVOICE" | "CASH"): Promise<W1Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;
  if (!isValidPeriod(period)) return { ok: false, error: "Невалиден период." };
  try {
    const { created, skipped } = await generateCharges(period, user.id, channel);
    revalidatePath("/charges");
    return { ok: true, created, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "W1 не успеа." };
  }
}

/** SM-119 — ИЗВРШИ (по клиент): generate the recurring charge for a single client in the period. */
export async function runW1ForClient(period: string, clientId: string): Promise<W1Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  if (!isValidPeriod(period)) return { ok: false, error: "Невалиден период." };
  if (!clientId) return { ok: false, error: "Избери клиент." };
  try {
    const { created, skipped } = await generateCharges(period, auth.user.id, undefined, clientId);
    revalidatePath("/charges");
    return { ok: true, created, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "W1 не успеа." };
  }
}

/** Approve a DRAFT — dispatch by kind: INVOICE → assign number; CASH_OBLIGATION → OPEN (SM-89). */
export async function approveCharge(chargeId: string): Promise<ApproveResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;
  try {
    const charge = await prisma.charge.findUnique({
      where: { id: chargeId },
      select: { kind: true },
    });
    if (!charge) return { ok: false, error: "Задолжувањето не постои." };
    if (charge.kind === ChargeKind.INVOICE) {
      const { invoiceNumber } = await approveInvoice(chargeId, user.id);
      revalidatePath("/charges");
      return { ok: true, invoiceNumber };
    }
    await approveCashObligation(chargeId, user.id);
    revalidatePath("/charges");
    return { ok: true, invoiceNumber: "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Одобрувањето не успеа." };
  }
}

/** SM-116 — load a DRAFT charge's lines for the edit form. */
export async function loadChargeForEditAction(
  chargeId: string,
): Promise<{ ok: true; data: ChargeEditData } | { ok: false; error: string }> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const data = await getChargeForEdit(chargeId);
  if (!data) return { ok: false, error: "Задолжувањето не постои." };
  return { ok: true, data };
}

/** SM-116 — save edited lines of a DRAFT charge (price / extra items); VAT recomputed server-side. */
export async function editChargeAction(
  chargeId: string,
  lines: { description: string; amount: number }[],
): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const parsed = zEditCharge.safeParse({ chargeId, lines });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  try {
    await editChargeLines(parsed.data.chargeId, parsed.data.lines, auth.user.id);
    revalidatePath("/charges");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Едитот не успеа." };
  }
}

/** SM-119 — Поништи раздолжување: undo a charge's (wrong) payments and reset it to OPEN. */
export async function resetChargePaymentsAction(chargeId: string): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    await resetChargePayments(chargeId, auth.user.id);
    revalidatePath("/charges");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Поништувањето не успеа." };
  }
}

/** SM-89 — delete a charge (draft, open cash obligation, or a mis-approved invoice). */
export async function deleteChargeAction(chargeId: string): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    await deleteCharge(chargeId, auth.user.id);
    revalidatePath("/charges");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Бришењето не успеа." };
  }
}

export async function approveAllDrafts(
  period: string,
  channel?: "INVOICE" | "CASH",
): Promise<{ ok: true; approved: number; failed: number; firstError?: string }> {
  const drafts = await prisma.charge.findMany({
    where: {
      period,
      status: ChargeStatus.DRAFT,
      ...(channel
        ? { kind: channel === "INVOICE" ? ChargeKind.INVOICE : ChargeKind.CASH_OBLIGATION }
        : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let approved = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const d of drafts) {
    const r = await approveCharge(d.id);
    if (r.ok) {
      approved++;
    } else {
      // Don't swallow a partial batch failure — surface the count and the first reason (SM-110).
      failed++;
      firstError ??= r.error;
    }
  }
  revalidatePath("/charges");
  return { ok: true, approved, failed, firstError };
}

/** SM-89 — НАПЛАТА КЕШ: record a cash payment against a cash obligation (W3, fiscal number D6). */
export async function collectCashOnChargeAction(
  chargeId: string,
  amount: number,
  fiscalNumber: string,
): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    select: { clientId: true },
  });
  if (!charge) return { ok: false, error: "Задолжувањето не постои." };
  try {
    await collectCash({ clientId: charge.clientId, chargeId, amount, fiscalNumber }, auth.user.id);
    revalidatePath("/charges");
    revalidatePath("/cash");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Наплатата не успеа." };
  }
}

/** SM-119 — split ONE incoming statement line across MULTIPLE invoices (possibly across clients). */
export async function splitPaymentAction(
  lineId: string,
  allocations: { chargeId: string; amount: number }[],
): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    await settleLineToInvoices(lineId, allocations, auth.user.id);
    revalidatePath("/charges");
    revalidatePath("/resolve");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Раздолжувањето не успеа." };
  }
}

/** SM-89 — НАПЛАТИ (invoice): match a chosen incoming statement line to this invoice. */
export async function matchInvoiceLineAction(
  chargeId: string,
  lineId: string,
): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    await manualMatchStatementLine(lineId, chargeId, auth.user.id);
    revalidatePath("/charges");
    revalidatePath("/resolve");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Спарувањето не успеа." };
  }
}

/**
 * CREDIT_NOTE (SM-53) — книжно одобрение against an issued invoice. Issued in the current OPEN
 * period; increments the client's creditBalance (auto-applies to the next charge, B18).
 */
export async function creditNote(
  originalChargeId: string,
  amount: number,
  reason: string,
): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Невалиден износ." };

  const period = currentPeriod();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.period.upsert({ where: { id: period }, update: {}, create: { id: period } });
      await assertPeriodOpen(tx, period); // B9

      const original = await tx.charge.findUnique({ where: { id: originalChargeId } });
      if (!original || original.kind !== ChargeKind.INVOICE || !original.invoiceNumber) {
        throw new Error("Одобрение може само врз издадена фактура.");
      }
      // Cap cumulatively: Σ(existing credit notes) + this one must not exceed the invoice (SM-110).
      const prior = await tx.charge.aggregate({
        _sum: { total: true },
        where: { kind: ChargeKind.CREDIT_NOTE, relatedChargeId: original.id },
      });
      const alreadyCredited = prior._sum.total ?? 0;
      if (alreadyCredited + amount > original.total) {
        throw new Error("Износот (со претходни одобренија) ја надминува оригиналната фактура.");
      }

      const cn = await tx.charge.create({
        data: {
          clientId: original.clientId,
          kind: ChargeKind.CREDIT_NOTE,
          period,
          issueDate: new Date(),
          dueDate: new Date(),
          status: ChargeStatus.OPEN,
          subtotal: amount,
          vatAmount: 0,
          total: amount,
          relatedChargeId: original.id,
          lines: {
            create: [
              { type: "OTHER", description: reason || "Книжно одобрение", amount, vatRate: 0 },
            ],
          },
        },
      });
      await tx.client.update({
        where: { id: original.clientId },
        data: { creditBalance: { increment: amount } },
      }); // B18
      await writeAudit(tx, {
        entity: "Charge",
        entityId: cn.id,
        action: "creditNote",
        diff: { original: original.invoiceNumber, amount, reason },
        userId: user.id,
      });
    });
    revalidatePath("/charges");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Одобрението не успеа." };
  }
}

/** W8 — close the period (SM-54). Returns blockers if not closable. */
export async function closePeriodAction(
  period: string,
): Promise<CloseResult | { ok: false; blockers: []; error: string }> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, blockers: [], error: auth.error };
  const res = await closePeriod(period, auth.user.id);
  revalidatePath("/charges");
  return res;
}
