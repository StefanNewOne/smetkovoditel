import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@smetko/db";
import { parseNlbFromPdf } from "@/lib/pdf/nlb-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SM-82 backfill: re-parse the already-imported NLB statement PDFs and fill `counterpartyAccount`
 * (the payer account of incoming transfers) on the existing StatementLine rows. The lineHash is
 * byte-stable across this parser change, so rows are matched by lineHash — no re-posting, fully
 * idempotent, no new statements/lines created. Guarded by CRON_SECRET.
 *   GET /api/cron/backfill-payers?secret=…&dir=<base64 abs path>
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
  let updated = 0;
  let unmatched = 0;
  for (const f of files) {
    const parsed = await parseNlbFromPdf(readFileSync(path.join(dir, f)));
    for (const line of parsed.lines) {
      if (!line.counterpartyAccount) continue;
      const res = await prisma.statementLine.updateMany({
        where: { lineHash: line.lineHash },
        data: { counterpartyAccount: line.counterpartyAccount },
      });
      if (res.count > 0) updated += res.count;
      else unmatched++;
    }
  }
  return NextResponse.json({ ok: true, files: files.length, updated, unmatched });
}
