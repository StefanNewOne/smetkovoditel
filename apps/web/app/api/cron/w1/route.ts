import { NextResponse } from "next/server";
import { currentPeriod } from "@smetko/shared";
import { generateCharges } from "@/lib/workflows/w1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** W1 charges cron — run monthly charging for the current period. GET /api/cron/w1?secret=… */
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    const result = await generateCharges(currentPeriod(), "system");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
