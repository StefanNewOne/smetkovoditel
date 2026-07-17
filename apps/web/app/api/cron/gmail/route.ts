import { NextResponse } from "next/server";
import pino from "pino";
import { createGmailClient } from "@/lib/gmail-client";
import { processInbox } from "@/lib/workflows/gmail-pipeline";
import { ingestReceipt, ingestStatement } from "@/lib/workflows/w2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

/** Gmail ingestion cron — poll the mailbox, route + ingest attachments. GET /api/cron/gmail?secret=… */
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const gmail = createGmailClient();
  if (!gmail) {
    // No OAuth secrets yet (pre go-live) — degrade to a no-op rather than failing the cron.
    return NextResponse.json({ ok: true, skipped: "gmail-not-configured" });
  }

  try {
    const summary = await processInbox(gmail, { ingestStatement, ingestReceipt }, "system");
    log.info({ event: "gmail.poll", ...summary }, "Gmail ingestion run");
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    log.error({ event: "gmail.poll.error" }, "Gmail ingestion failed");
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
