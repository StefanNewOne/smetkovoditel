import "server-only";
import { ChargeKind, ChargeStatus, prisma } from "@smetko/db";
import { writeAudit } from "@/lib/audit";

/**
 * W4 dunning reminders (Master Plan §W4, SM-50). Sends payment reminders for unpaid INVOICE
 * charges at due+7 / due+21 and an OVERDUE notice at due+30. Exactly one email per charge per
 * tier — dedup is via the `reminder.sent` AuditLog event (no new table; the schema is
 * Master-Plan-literal). CASH_OBLIGATION gets no email (internal only). Transport is injected so
 * tests use a fake; production passes a Gmail sender.
 */
export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}
export interface MailClient {
  send(msg: MailMessage): Promise<void>;
}

/** Reminder tiers, highest-days first so we pick the strongest tier a charge has reached. */
const TIERS = [
  { key: "R30", minDays: 30, subject: "Достасана фактура (30+ дена)" },
  { key: "R21", minDays: 21, subject: "Потсетник: неплатена фактура (21 ден)" },
  { key: "R7", minDays: 7, subject: "Потсетник: неплатена фактура (7 дена)" },
] as const;

const OPEN: ChargeStatus[] = [ChargeStatus.OPEN, ChargeStatus.PARTIALLY_PAID, ChargeStatus.OVERDUE];

function daysPastDue(now: Date, dueDate: Date): number {
  return Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000);
}

export interface RemindersResult {
  sent: number;
  skippedNoEmail: number;
  byTier: Record<string, number>;
}

export async function sendReminders(
  mail: MailClient,
  opts: { now?: Date; userId?: string } = {},
): Promise<RemindersResult> {
  const now = opts.now ?? new Date();
  const userId = opts.userId ?? "system";

  const charges = await prisma.charge.findMany({
    where: { kind: ChargeKind.INVOICE, invoiceNumber: { not: null }, status: { in: OPEN } },
    include: { client: true },
  });

  // Which (charge, tier) reminders already went out — one query, then a Set lookup.
  const priorLogs = await prisma.auditLog.findMany({
    where: {
      entity: "Charge",
      action: "reminder.sent",
      entityId: { in: charges.map((c) => c.id) },
    },
  });
  const alreadySent = new Set(
    priorLogs.map((l) => `${l.entityId}:${(l.diff as { tier?: string })?.tier ?? ""}`),
  );

  const result: RemindersResult = { sent: 0, skippedNoEmail: 0, byTier: {} };

  for (const charge of charges) {
    if (charge.total - charge.paidAmount <= 0) continue; // fully paid
    const age = daysPastDue(now, charge.dueDate);
    const tier = TIERS.find((t) => age >= t.minDays);
    if (!tier) continue; // not yet due for any reminder
    if (alreadySent.has(`${charge.id}:${tier.key}`)) continue; // already reminded at this tier

    const to = charge.client.contactEmail;
    if (!to) {
      result.skippedNoEmail++;
      continue;
    }

    const remaining = charge.total - charge.paidAmount;
    await mail.send({
      to,
      subject: `${tier.subject} — ${charge.invoiceNumber}`,
      body:
        `Почитувани ${charge.client.name},\n\n` +
        `Фактурата ${charge.invoiceNumber} со рок ${new Date(charge.dueDate)
          .toISOString()
          .slice(0, 10)} сè уште не е платена (преостанато: ${remaining / 100} ден).\n` +
        `Ве молиме извршете уплата на жиро сметка 210-0768360001-38.\n\nGoDigital`,
    });

    await writeAudit(prisma, {
      entity: "Charge",
      entityId: charge.id,
      action: "reminder.sent",
      diff: { tier: tier.key, to },
      userId,
    });

    result.sent++;
    result.byTier[tier.key] = (result.byTier[tier.key] ?? 0) + 1;
  }

  return result;
}
