import { NextResponse } from "next/server";
import { prisma } from "@smetko/db";
import { parseNlbFromPdf } from "@/lib/pdf/nlb-parse";
import { readAttachment } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SM-101 one-off backfill: recover payer accounts for incoming lines that lost them to the multi-page
 * bug (account wrapped to the next page, out of the old y-window). Re-parses each affected statement's
 * stored PDF with the fixed parser and fills counterpartyAccount by lineHash (byte-stable, unchanged
 * by the fix). Only fills NULLs — never overwrites an existing account. Guarded by CRON_SECRET.
 *   GET /api/cron/backfill-accounts?secret=…
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Statements that still have an incoming line with no account.
  const gaps = await prisma.statementLine.findMany({
    where: { direction: "IN", counterpartyAccount: null },
    select: { importId: true },
    distinct: ["importId"],
  });
  const importIds = gaps.map((g) => g.importId);

  const summary = {
    statements: importIds.length,
    updated: 0,
    stillNull: 0,
    skipped: [] as string[],
  };

  for (const importId of importIds) {
    const imp = await prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!imp) continue;
    const name = imp.fileRef.replace("/api/attachments/", "");
    const buf = imp.fileRef.startsWith("/api/attachments/") ? await readAttachment(name) : null;
    if (!buf) {
      summary.skipped.push(`#${imp.statementNumber} (нема сервирлив PDF)`);
      continue;
    }
    const parsed = await parseNlbFromPdf(buf);
    const accByHash = new Map(
      parsed.lines
        .filter((l) => l.counterpartyAccount)
        .map((l) => [l.lineHash, l.counterpartyAccount!] as const),
    );
    const dbLines = await prisma.statementLine.findMany({
      where: { importId, direction: "IN", counterpartyAccount: null },
    });
    for (const l of dbLines) {
      const acc = accByHash.get(l.lineHash);
      if (acc) {
        await prisma.statementLine.update({
          where: { id: l.id },
          data: { counterpartyAccount: acc },
        });
        summary.updated++;
      } else {
        summary.stillNull++; // genuinely accountless (bank noise / cash-in) — left as-is
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
