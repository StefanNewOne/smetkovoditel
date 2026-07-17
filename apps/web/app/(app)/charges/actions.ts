"use server";

import { revalidatePath } from "next/cache";
import { ChargeKind, ChargeStatus, Prisma, prisma } from "@smetko/db";
import { invoiceNumber, isValidPeriod } from "@smetko/shared";
import { currentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { generateCharges } from "@/lib/workflows/w1";

export type W1Result =
  { ok: true; created: number; skipped: number } | { ok: false; error: string };
export type ApproveResult = { ok: true; invoiceNumber: string } | { ok: false; error: string };

/** Run W1 for a period manually (the cron does this on the 1st; this is the on-demand trigger). */
export async function runW1(period: string): Promise<W1Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  if (!isValidPeriod(period)) return { ok: false, error: "Невалиден период." };

  const { created, skipped } = await generateCharges(period, user.id);
  revalidatePath("/charges");
  return { ok: true, created, skipped };
}

/**
 * Approve a DRAFT invoice → OPEN, assigning the next global monthly number `1-{n}/{M}-{YYYY}`
 * atomically (B1: no gaps, assigned at issuance). Retries on the seqInMonth unique race.
 * Applies any creditBalance (B18). Idempotent for an already-approved charge.
 */
export async function approveCharge(chargeId: string): Promise<ApproveResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx): Promise<ApproveResult> => {
        const charge = await tx.charge.findUnique({ where: { id: chargeId } });
        if (!charge) return { ok: false, error: "Задолжувањето не постои." };
        if (charge.kind !== ChargeKind.INVOICE)
          return { ok: false, error: "Само фактури добиваат број." };
        if (charge.status !== ChargeStatus.DRAFT) {
          return { ok: true, invoiceNumber: charge.invoiceNumber ?? "" };
        }

        const agg = await tx.charge.aggregate({
          where: { period: charge.period, seqInMonth: { not: null } },
          _max: { seqInMonth: true },
        });
        const seq = (agg._max.seqInMonth ?? 0) + 1;
        const number = invoiceNumber(seq, charge.period);

        let paidAmount = charge.paidAmount;
        const client = await tx.client.findUnique({ where: { id: charge.clientId } });
        if (client && client.creditBalance > 0 && charge.total > paidAmount) {
          const applied = Math.min(client.creditBalance, charge.total - paidAmount);
          paidAmount += applied;
          await tx.client.update({
            where: { id: client.id },
            data: { creditBalance: { decrement: applied } },
          });
        }
        const status =
          paidAmount >= charge.total
            ? ChargeStatus.PAID
            : paidAmount > 0
              ? ChargeStatus.PARTIALLY_PAID
              : ChargeStatus.OPEN;

        await tx.charge.update({
          where: { id: chargeId },
          data: { seqInMonth: seq, invoiceNumber: number, status, paidAmount },
        });
        await writeAudit(tx, {
          entity: "Charge",
          entityId: chargeId,
          action: "approve",
          diff: { invoiceNumber: number, seqInMonth: seq },
          userId: user.id,
        });
        return { ok: true, invoiceNumber: number };
      });

      revalidatePath("/charges");
      return result;
    } catch (e) {
      // seqInMonth unique race — another approval took this number. Retry.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, error: "Нумерацијата не успеа по повеќе обиди." };
}

/** Approve all DRAFT invoices for the period (sequential to keep numbering gap-free). */
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
