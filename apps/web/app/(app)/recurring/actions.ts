"use server";

import { revalidatePath } from "next/cache";
import { deleteLoanEntry } from "@/lib/loans";
import { requireWriter } from "@/lib/rbac";

export type Result = { ok: true } | { ok: false; error: string };

/** Undo a loan entry — returns its bank line to Решавање so it can be reclassified. */
export async function deleteLoanAction(id: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    await deleteLoanEntry(id, auth.user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Бришењето не успеа." };
  }
  revalidatePath("/recurring");
  revalidatePath("/resolve");
  return { ok: true };
}
