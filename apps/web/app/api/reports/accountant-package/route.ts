import { NextResponse } from "next/server";
import { isValidPeriod } from "@smetko/shared";
import { currentUser } from "@/lib/auth";
import { buildAccountantPackage } from "@/lib/workflows/w9";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/reports/accountant-package?period=YYYY-MM — the W9 ZIP (auth-gated). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period)) return new NextResponse("Bad period", { status: 400 });

  const zip = await buildAccountantPackage(period);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="smetkovoditel-${period}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
