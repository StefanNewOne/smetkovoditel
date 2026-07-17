"use server";

import { revalidatePath } from "next/cache";
import { ChargeKind, ChargeStatus, prisma } from "@smetko/db";
import { currentPeriod, isValidPeriod } from "@smetko/shared";
import { currentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { closePeriod, type CloseResult } from "@/lib/workflows/w8";

export type W1Result =
  { ok: true; created: number; skipped: number } | { ok: false; error: string };
export type ApproveResult = { ok: true; invoiceNumber: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function runW1(period: string): Promise<W1Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  if (!isValidPeriod(period)) return { ok: false, error: "Невалиден период." };
  try {
    const { created, skipped } = await generateCharges(period, user.id);
    revalidatePath("/charges");
    return { ok: true, created, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "W1 не успеа." };
  }
}

export async function approveCharge(chargeId: string): Promise<ApproveResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  try {
    const { invoiceNumber } = await approveInvoice(chargeId, user.id);
    revalidatePath("/charges");
    return { ok: true, invoiceNumber };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Нумерацијата не успеа." };
  }
}

export async function approveAllDrafts(period: string): Promise<{ ok: true; approved: number }> {
  const drafts = await prisma.charge.findMany({
    where: { period, kind: ChargeKind.INVOICE, status: ChargeStatus.DRAFT },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let approved = 0;
  for (const d of drafts) {
    const r = await approveCharge(d.id);
    if (r.ok) approved++;
  }
  revalidatePath("/charges");
  return { ok: true, approved };
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
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
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
      if (amount > original.total) throw new Error("Износот надминува оригиналната фактура.");

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
  const user = await currentUser();
  if (!user) return { ok: false, blockers: [], error: "Не сте најавени." };
  const res = await closePeriod(period, user.id);
  revalidatePath("/charges");
  return res;
}
