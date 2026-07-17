import { NextResponse } from "next/server";
import pino from "pino";
import { updateExchangeRate } from "@/lib/workflows/w7";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

/** W7 exchange-rate cron — daily НБРМ USD mid. GET /api/cron/w7?secret=… */
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    const result = await updateExchangeRate();
    if (result.stale) {
      log.warn({ event: "cron.w7.stale", ...result }, "W7 fell back to a stale USD rate");
    } else {
      log.info({ event: "cron.w7", ...result }, "W7 exchange rate updated");
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    log.error({ event: "cron.w7.error" }, "W7 exchange rate failed");
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
