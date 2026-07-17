"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@smetko/db";
import { type CollectCashInput, currentPeriod, zCollectCash } from "@smetko/shared";
import { requireWriter } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { collectCash } from "@/lib/workflows/w3";

export type CashResult = { ok: true } | { ok: false; error: string };

/** W3 — collect a cash payment against an open charge. */
export async function collectCashAction(input: CollectCashInput): Promise<CashResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;

  const parsed = zCollectCash.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  }

  try {
    await collectCash(parsed.data, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Наплатата не успеа." };
  }
  revalidatePath("/cash");
  revalidatePath("/charges");
  return { ok: true };
}

/**
 * Record a physical stocktake (Попис) for the close check (W8). Stores counted vs computed in
 * the audit trail; discrepancies are investigated, not auto-adjusted.
 */
export async function stocktakeAction(countedDeni: number): Promise<CashResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;
  if (!Number.isInteger(countedDeni) || countedDeni < 0) {
    return { ok: false, error: "Невалиден износ." };
  }

  const [inAll, outAll] = await Promise.all([
    prisma.cashLedgerEntry.aggregate({ _sum: { amount: true }, where: { direction: "IN" } }),
    prisma.cashLedgerEntry.aggregate({ _sum: { amount: true }, where: { direction: "OUT" } }),
  ]);
  const computed = (inAll._sum.amount ?? 0) - (outAll._sum.amount ?? 0);

  await writeAudit(prisma, {
    entity: "Blagajna",
    entityId: currentPeriod(),
    action: "stocktake",
    diff: { counted: countedDeni, computed, difference: countedDeni - computed },
    userId: user.id,
  });
  revalidatePath("/cash");
  return { ok: true };
}
