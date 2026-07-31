import "server-only";
import pino from "pino";
import { type AlertType, type Prisma, prisma } from "@smetko/db";
import { createMailSender } from "@/lib/gmail-client";

/**
 * SM-111 — durable import/worker alarms (Master Plan §13, B14, §4.4). raiseAlert persists an
 * acknowledgeable record, logs it structurally, and best-effort emails the operator. It NEVER throws:
 * an alerting failure must not break the import/matching path it is reporting on. No PII or amounts
 * tied to a named party go into the log/email (CLAUDE.md Category 9 #3).
 */
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

export interface RaiseAlertInput {
  type: AlertType;
  severity?: "error" | "warn";
  title: string;
  detail: string;
  context?: Prisma.InputJsonValue;
}

export async function raiseAlert(input: RaiseAlertInput): Promise<void> {
  const severity = input.severity ?? "error";
  try {
    await prisma.systemAlert.create({
      data: {
        type: input.type,
        severity,
        title: input.title,
        detail: input.detail,
        context: input.context,
      },
    });
    log[severity]({ event: "alert.raised", type: input.type }, input.title);
    await notify(input.type, input.title, input.detail);
  } catch (e) {
    // Last resort: at least log that alerting itself failed. Do not rethrow.
    log.error({ event: "alert.failed", type: input.type, err: String(e) }, "Alerting не успеа");
  }
}

/** Best-effort operator email. No-op when Gmail/ALERT_EMAIL is not configured. */
async function notify(type: AlertType, title: string, detail: string): Promise<void> {
  const to = process.env.ALERT_EMAIL ?? process.env.GMAIL_SENDER;
  const mail = createMailSender();
  if (!to || !mail) return;
  try {
    await mail.send({
      to,
      subject: `[Сметководител] Аларм: ${type}`,
      body: `${title}\n\n${detail}`,
    });
  } catch (e) {
    log.warn({ event: "alert.email.failed", type, err: String(e) }, "Аларм-мејл не успеа");
  }
}

export interface AlertRow {
  id: string;
  type: AlertType;
  severity: string;
  title: string;
  detail: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

const fmt = (d: Date) =>
  new Date(d).toLocaleString("mk-MK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Alerts newest-first; unacknowledged before acknowledged. */
export async function listAlerts(limit = 100): Promise<AlertRow[]> {
  const rows = await prisma.systemAlert.findMany({
    orderBy: [{ acknowledgedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    detail: a.detail,
    createdAt: fmt(a.createdAt),
    acknowledgedAt: a.acknowledgedAt ? fmt(a.acknowledgedAt) : null,
  }));
}

/** Count of unacknowledged alerts (drives the sidebar badge). */
export async function countOpenAlerts(): Promise<number> {
  return prisma.systemAlert.count({ where: { acknowledgedAt: null } });
}

/** Acknowledge an alert (writer action). Idempotent — an already-acked alert is left as-is. */
export async function acknowledgeAlert(id: string, userId: string): Promise<void> {
  await prisma.systemAlert.updateMany({
    where: { id, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: userId },
  });
}
