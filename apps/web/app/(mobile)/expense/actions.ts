"use server";

import { revalidatePath } from "next/cache";
import { zCashExpense } from "@smetko/shared";
import { requireWriter } from "@/lib/rbac";
import { saveAttachment } from "@/lib/storage";
import { recordCashExpense } from "@/lib/workflows/w6";

export type Result = { ok: true } | { ok: false; error: string };

/** W6 — record a cash expense from the mobile form. Photo is mandatory (B5). */
export async function recordCashExpenseAction(formData: FormData): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: "Задолжителна слика за кеш-трошок (B5)." };
  }
  if (!photo.type.startsWith("image/")) {
    return { ok: false, error: "Прикачи слика од сметката." };
  }

  const parsed = zCashExpense.safeParse({
    amount: Number(formData.get("amountDeni")),
    category: formData.get("category"),
    description: String(formData.get("description") ?? ""),
    vendor: (formData.get("vendor") as string) || undefined,
    receiptNumber: (formData.get("receiptNumber") as string) || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  }

  const bytes = Buffer.from(await photo.arrayBuffer());
  const ext = photo.name.split(".").pop() || photo.type.split("/").pop() || "jpg";
  const { url } = await saveAttachment(bytes, ext);

  try {
    await recordCashExpense({ ...parsed.data, attachmentUrl: url }, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Зачувувањето не успеа." };
  }
  revalidatePath("/cash");
  return { ok: true };
}
