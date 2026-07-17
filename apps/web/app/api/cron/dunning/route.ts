import { NextResponse } from "next/server";
import { markOverdue } from "@/lib/workflows/w4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** W4 dunning cron — mark overdue invoices. Trigger: GET /api/cron/dunning?secret=CRON_SECRET */
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const overdue = await markOverdue();
  return NextResponse.json({ ok: true, overdue });
}
