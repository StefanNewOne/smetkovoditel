"use server";

import { revalidatePath } from "next/cache";
import { categoryExists } from "@/lib/expenses";
import { requireWriter } from "@/lib/rbac";
import {
  categorizeStatementLine,
  ignoreStatementLine,
  linkAccountAndSettle,
  manualMatchStatementLine,
  runFifoOnUnmatched,
} from "@/lib/workflows/w2";

export type ActionResult = { ok: true; detail?: string } | { ok: false; error: string };

/** Part 2B — settle unmatched payments against each payer's oldest open invoice (by giro account). */
export async function fifoAction(): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const settled = await runFifoOnUnmatched(auth.user.id);
  revalidatePath("/resolve");
  revalidatePath("/charges");
  return { ok: true, detail: `Раздолжени ${settled} уплати по FIFO.` };
}

/** Link a payment's payer account to a chosen client, then FIFO-settle their oldest open invoice. */
export async function linkAccountAction(lineId: string, clientId: string): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    const { settled } = await linkAccountAndSettle(lineId, clientId, auth.user.id);
    revalidatePath("/resolve");
    revalidatePath("/import");
    revalidatePath("/charges");
    revalidatePath("/clients");
    return {
      ok: true,
      detail:
        settled > 0
          ? `Сметката поврзана · раздолжени ${settled} уплати.`
          : "Сметката поврзана (нема отворена фактура за раздолжување).",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Поврзувањето не успеа." };
  }
}

/** Match an incoming payment to a chosen open charge of the paying client (period-guarded B9). */
export async function matchPaymentAction(lineId: string, chargeId: string): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    await manualMatchStatementLine(lineId, chargeId, auth.user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Спарувањето не успеа." };
  }
  revalidatePath("/resolve");
  revalidatePath("/import");
  revalidatePath("/charges");
  return { ok: true };
}

/** Resolve an outgoing line as an operating Expense of the chosen category; optionally learn the vendor. */
export async function categorizeLineAction(
  lineId: string,
  category: string,
  rememberVendor: boolean,
): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  if (!(await categoryExists(category))) return { ok: false, error: "Непозната категорија." };
  try {
    const r = await categorizeStatementLine(lineId, category, { rememberVendor }, auth.user.id);
    const detail = r.learnedRule
      ? `Запаметен продавач${r.siblingMatches > 0 ? ` · +${r.siblingMatches} слични на увоз` : ""}`
      : undefined;
    return { ok: true, detail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Категоризацијата не успеа." };
  } finally {
    revalidatePath("/resolve");
    revalidatePath("/reports");
  }
}

/** Mark a genuine noise line resolved without booking an expense. */
export async function ignoreLineAction(lineId: string): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  await ignoreStatementLine(lineId, auth.user.id);
  revalidatePath("/resolve");
  return { ok: true };
}
