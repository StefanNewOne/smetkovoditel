"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/rbac";
import { acknowledgeAlert } from "@/lib/alerts";

export type SimpleResult = { ok: true } | { ok: false; error: string };

/** SM-111 — mark an alert as seen (writer only). */
export async function acknowledgeAlertAction(id: string): Promise<SimpleResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  try {
    await acknowledgeAlert(id, auth.user.id);
    revalidatePath("/alerts");
    revalidatePath("/", "layout"); // refresh the sidebar badge
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не успеа." };
  }
}
