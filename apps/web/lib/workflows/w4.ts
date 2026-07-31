import "server-only";
import { ChargeKind, ChargeStatus, prisma } from "@smetko/db";
import { addDays } from "@smetko/shared";
import { writeAudit } from "@/lib/audit";

/**
 * W4 — dunning (Master Plan §W4). Marks unpaid INVOICE charges OVERDUE once they are >30 days
 * past due. Email reminders (due+7/+21) are sent via Gmail SMTP (SM-30) — this covers the
 * status transition, which drives aging and the dashboard. Cash obligations get only an internal
 * note (no OVERDUE email). Idempotent; run daily by the cron.
 */
export async function markOverdue(now: Date = new Date(), userId = "system"): Promise<number> {
  const cutoff = addDays(now, -30);
  // B9: never mutate a charge in a CLOSED period. Exclude them from OVERDUE marking.
  const closed = await prisma.period.findMany({
    where: { status: "CLOSED" },
    select: { id: true },
  });
  const closedIds = closed.map((p) => p.id);
  const due = await prisma.charge.findMany({
    where: {
      kind: ChargeKind.INVOICE,
      status: { in: [ChargeStatus.OPEN, ChargeStatus.PARTIALLY_PAID] },
      dueDate: { lt: cutoff },
      ...(closedIds.length ? { period: { notIn: closedIds } } : {}),
    },
    select: { id: true },
  });
  if (due.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.charge.updateMany({
      where: { id: { in: due.map((c) => c.id) } },
      data: { status: ChargeStatus.OVERDUE },
    });
    await writeAudit(tx, {
      entity: "Charge",
      entityId: "batch",
      action: "dunning.overdue",
      diff: { count: due.length },
      userId,
    });
  });
  return due.length;
}
