"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/rbac";
import { detectDocType, extractPdfText } from "@/lib/pdf/extract";
import { saveAttachment } from "@/lib/storage";
import { ingestReceipt, ingestStatement } from "@/lib/workflows/w2";

export type UploadResult = { ok: true; summary: string[] } | { ok: false; error: string };

/** Manual multi-upload of NLB statements / Meta receipts (D4 fallback for Gmail ingestion). */
export async function uploadAction(formData: FormData): Promise<UploadResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Нема избрани фајлови." };

  const summary: string[] = [];
  for (const file of files) {
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const text = await extractPdfText(bytes);
      const type = detectDocType(text);
      const ext = file.name.split(".").pop() || "pdf";
      const { url } = await saveAttachment(bytes, ext);

      if (type === "META") {
        const r = await ingestReceipt(text, url, user.id);
        summary.push(
          r.status === "PARSED"
            ? `Meta ${r.referenceNumber}: примен${r.matched ? ` · спарен (${r.matched})` : ""}`
            : r.status === "DUPLICATE_SKIPPED"
              ? `Meta ${r.referenceNumber}: дупликат — прескокнат`
              : `Meta: ${r.message}`,
        );
      } else if (type === "NLB") {
        const r = await ingestStatement(text, url, "MANUAL_UPLOAD", user.id);
        summary.push(
          r.status === "PARSED"
            ? `Извод ${r.statementNumber}: ${r.lines} линии · уплати ${r.clientMatched} · Meta ${r.receiptsMatched}`
            : r.status === "DUPLICATE_SKIPPED"
              ? `Извод ${r.statementNumber}: дупликат — прескокнат (B13)`
              : `Извод ${r.statementNumber ?? "?"}: FAILED — ${r.messages.join("; ")}`,
        );
      } else {
        summary.push(`${file.name}: непознат тип документ`);
      }
    } catch (e) {
      summary.push(`${file.name}: грешка — ${e instanceof Error ? e.message : "непозната"}`);
    }
  }

  revalidatePath("/import");
  revalidatePath("/charges");
  revalidatePath("/cash");
  return { ok: true, summary };
}
