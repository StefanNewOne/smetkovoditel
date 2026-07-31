import { NextResponse } from "next/server";
import { prisma } from "@smetko/db";
import { runFifoOnUnmatched } from "@/lib/workflows/w2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FIFO settlement pass (go-live Part 2B) over all currently-unmatched incoming payments: each is
 * applied to the payer's oldest open invoice by giro account. Guarded by CRON_SECRET.
 *   GET /api/cron/fifo?secret=…
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const user = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!user) return NextResponse.json({ ok: false, error: "no admin user" }, { status: 500 });
  const settled = await runFifoOnUnmatched(user.id);
  return NextResponse.json({ ok: true, settled });
}
