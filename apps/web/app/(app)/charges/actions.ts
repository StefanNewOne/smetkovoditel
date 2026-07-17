"use server";

import { revalidatePath } from "next/cache";
import { ChargeKind, ChargeStatus, prisma } from "@smetko/db";
import { isValidPeriod } from "@smetko/shared";
import { currentUser } from "@/lib/auth";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";

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

/** Approve a DRAFT invoice → assign its number (B1). */
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
