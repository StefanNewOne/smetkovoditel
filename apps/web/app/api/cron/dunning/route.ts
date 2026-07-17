import { NextResponse } from "next/server";
import pino from "pino";
import { createMailSender } from "@/lib/gmail-client";
import { markOverdue } from "@/lib/workflows/w4";
import { sendReminders } from "@/lib/workflows/w4-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

/** W4 dunning cron — mark overdue + send tiered reminders. GET /api/cron/dunning?secret=CRON_SECRET */
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const overdue = await markOverdue();

  // Reminders require a configured Gmail sender; without it (pre go-live) we only mark overdue.
  const mail = createMailSender();
  let reminders = null;
  if (mail) {
    reminders = await sendReminders(mail);
    log.info({ event: "reminder.sent", ...reminders }, "dunning reminders sent");
  }

  return NextResponse.json({ ok: true, overdue, reminders });
}
