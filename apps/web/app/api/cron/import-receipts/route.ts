import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseMetaReceipt } from "@smetko/shared";
import { extractPdfText } from "@/lib/pdf/extract";
import { ingestReceipt } from "@/lib/workflows/w2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off bulk import of a folder tree of Meta receipt PDFs (go-live / historical migration).
 * Walks the directory recursively, parses each receipt, and — unless `probe=1` — ingests it via
 * the tested {@link ingestReceipt} path (dedupe by referenceNumber + auto-match to the FACEBK
 * statement line, §4.4). Guarded by CRON_SECRET.
 *
 * `probe=1` parses only (no DB writes) and returns the distinct ad accounts found — used to decide
 * the AdAccount→client mapping (B15 billable pass-through is a money decision, confirmed by a human)
 * BEFORE any billing happens.
 *
 *   GET /api/cron/import-receipts?secret=…&dir=<base64 abs path>[&probe=1]
 */
function walkPdfs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkPdfs(full));
    else if (entry.toLowerCase().endsWith(".pdf")) out.push(full);
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const dirParam = url.searchParams.get("dir");
  if (!dirParam)
    return NextResponse.json({ ok: false, error: "dir (base64) required" }, { status: 400 });
  const dir = Buffer.from(dirParam, "base64").toString("utf8");
  const probe = url.searchParams.get("probe") === "1";

  const files = walkPdfs(dir);

  // Distinct ad accounts across the tree (metaAccountId → { name, count }). The folder is kept as a
  // hint for the human mapping step, since the PDF account name is sometimes the Cyrillic legal name.
  const accounts = new Map<
    string,
    { metaAccountId: string; accountName: string; folder: string; count: number }
  >();

  const summary = {
    total: files.length,
    probe,
    parsed: 0,
    partial: 0,
    duplicates: 0,
    matched: 0,
    failures: [] as string[],
    accounts: [] as Array<{
      metaAccountId: string;
      accountName: string;
      folder: string;
      count: number;
    }>,
  };

  for (const full of files) {
    const rel = path.relative(dir, full);
    const folder = rel.split(path.sep)[0] ?? "";
    try {
      const text = await extractPdfText(readFileSync(full));
      const p = parseMetaReceipt(text);
      const key = p.metaAccountId ?? `name:${p.accountName ?? "?"}`;
      const acc = accounts.get(key) ?? {
        metaAccountId: p.metaAccountId ?? "",
        accountName: p.accountName ?? "",
        folder,
        count: 0,
      };
      acc.count++;
      accounts.set(key, acc);

      if (probe) {
        if (p.parseStatus === "PARTIAL" || !p.referenceNumber) summary.partial++;
        else summary.parsed++;
        continue;
      }

      const r = await ingestReceipt(text, `local:${rel}`, "system");
      if (r.status === "PARSED") {
        summary.parsed++;
        if (r.matched) summary.matched += r.matched;
      } else if (r.status === "DUPLICATE_SKIPPED") {
        summary.duplicates++;
      } else {
        summary.partial++;
      }
    } catch (e) {
      summary.failures.push(`${rel}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  summary.accounts = [...accounts.values()].sort((a, b) => b.count - a.count);
  return NextResponse.json({ ok: true, ...summary });
}
