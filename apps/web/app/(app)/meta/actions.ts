"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/rbac";
import { ignoreStatementLine } from "@/lib/workflows/w2";
import {
  bookFacebkLine,
  deleteReceipt,
  manualMatchReceipt,
  mapAdAccount,
} from "@/lib/workflows/meta";

export type Result = { ok: true } | { ok: false; error: string };

const done = (): Result => {
  revalidatePath("/meta");
  revalidatePath("/import");
  return { ok: true };
};
const wrap = async (fn: () => Promise<void>, fallback: string): Promise<Result> => {
  try {
    await fn();
    return done();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : fallback };
  }
};

/** SM-95 — map an ad account to a client (or null = own marketing) + re-attribute its expenses. */
export async function mapAdAccountAction(
  metaAccountId: string,
  clientId: string | null,
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  return wrap(() => mapAdAccount(metaAccountId, clientId, auth.user.id), "Мапирањето не успеа.");
}

/** SM-96 — book a FACEBK line (no receipt) as an ADS expense (client or own marketing). */
export async function bookFacebkAction(lineId: string, clientId: string | null): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  return wrap(() => bookFacebkLine(lineId, clientId, auth.user.id), "Книжењето не успеа.");
}

/** SM-96 — ignore a FACEBK line (noise). */
export async function ignoreFacebkAction(lineId: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  return wrap(() => ignoreStatementLine(lineId, auth.user.id), "Не успеа.");
}

/** SM-97 — delete an orphan (unmatched) receipt. */
export async function deleteReceiptAction(receiptId: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  return wrap(() => deleteReceipt(receiptId, auth.user.id), "Бришењето не успеа.");
}

/** SM-97 — manually match an orphan receipt to a FACEBK statement line. */
export async function matchReceiptAction(receiptId: string, lineId: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  return wrap(() => manualMatchReceipt(receiptId, lineId, auth.user.id), "Спарувањето не успеа.");
}
