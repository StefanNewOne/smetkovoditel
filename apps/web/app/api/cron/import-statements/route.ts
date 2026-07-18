import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseNlbFromPdf } from "@/lib/pdf/nlb-parse";
import { ingestParsedStatement } from "@/lib/workflows/w2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off bulk import of a folder of NLB statement PDFs (go-live / historical migration). Parses
 * all, imports in statement-number order so the continuity gate (B14) validates, and the bank
 * payments (§2 source of truth) auto-match invoices. Guarded by CRON_SECRET.
 *   GET /api/cron/import-statements?secret=…&dir=<base64 abs path>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const dirParam = url.searchParams.get("dir");
  if (!dirParam)
    return NextResponse.json({ ok: false, error: "dir (base64) required" }, { status: 400 });
  const dir = Buffer.from(dirParam, "base64").toString("utf8");

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const parsed = await Promise.all(
    files.map(async (f) => ({ f, s: await parseNlbFromPdf(readFileSync(path.join(dir, f))) })),
  );
  parsed.sort((a, b) => (a.s.statementNumber ?? 0) - (b.s.statementNumber ?? 0));

  const summary = {
    total: files.length,
    parsed: 0,
    failed: 0,
    duplicates: 0,
    clientMatched: 0,
    receiptsMatched: 0,
    failures: [] as string[],
  };
  for (const { f, s } of parsed) {
    const r = await ingestParsedStatement(s, `local:${f}`, "MANUAL_UPLOAD", "system");
    if (r.status === "PARSED") {
      summary.parsed++;
      summary.clientMatched += r.clientMatched;
      summary.receiptsMatched += r.receiptsMatched;
    } else if (r.status === "DUPLICATE_SKIPPED") {
      summary.duplicates++;
    } else {
      summary.failed++;
      summary.failures.push(`#${r.statementNumber ?? "?"}: ${r.messages.join("; ")}`);
    }
  }
  return NextResponse.json({ ok: true, ...summary });
}
