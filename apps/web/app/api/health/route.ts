import { NextResponse } from "next/server";
import { prisma } from "@smetko/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Health check for the deploy script + container healthcheck. Verifies the DB is reachable. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
