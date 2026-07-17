import "server-only";
import { ChargeKind, ChargeStatus, prisma } from "@smetko/db";
import { periodStart, shiftPeriod } from "@smetko/shared";
import { writeAudit } from "@/lib/audit";

export interface CloseBlocker {
  key: string;
  label: string;
  count: number;
}

/**
 * W8 blockers (Master Plan §W8): a period may close only when there are no DRAFT charges,
 * no unresolved import items, all honorari PAID, and a stocktake with zero difference was
 * recorded. Returns the list of blockers (empty = closable).
 */
export async function getCloseBlockers(period: string): Promise<CloseBlocker[]> {
  const start = periodStart(period);
  const nextStart = periodStart(shiftPeriod(period, 1));

  const [drafts, unmatchedReceipts, unprocessedLines, calcHonorari, lastStocktake] =
    await Promise.all([
      prisma.charge.count({
        where: { period, kind: ChargeKind.INVOICE, status: ChargeStatus.DRAFT },
      }),
      prisma.adSpendReceipt.count({ where: { matchStatus: "UNMATCHED" } }),
      prisma.statementLine.count({ where: { processed: false } }),
      prisma.contractorPayment.count({ where: { period, status: "CALCULATED" } }),
      prisma.auditLog.findFirst({
        where: {
          entity: "Blagajna",
          action: "stocktake",
          createdAt: { gte: start, lt: nextStart },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const blockers: CloseBlocker[] = [];
  if (drafts > 0)
    blockers.push({ key: "drafts", label: "Неодобрени DRAFT фактури", count: drafts });
  if (unmatchedReceipts > 0)
    blockers.push({ key: "receipts", label: "Неспарени Meta receipts", count: unmatchedReceipts });
  if (unprocessedLines > 0)
    blockers.push({ key: "lines", label: "Нерешени извод-линии", count: unprocessedLines });
  if (calcHonorari > 0)
    blockers.push({
      key: "honorari",
      label: "Неисплатени хонорари (CALCULATED)",
      count: calcHonorari,
    });
  if (!lastStocktake)
    blockers.push({ key: "stocktake", label: "Нема попис на благајна за периодот", count: 1 });
  else {
    const diff = (lastStocktake.diff as { difference?: number })?.difference ?? 0;
    if (diff !== 0)
      blockers.push({ key: "stocktake-diff", label: "Пописот не се совпаѓа со салдото", count: 1 });
  }
  return blockers;
}

export type CloseResult = { ok: true } | { ok: false; blockers: CloseBlocker[] };

/** Close the period → immutable (B9). No-op if already closed. */
export async function closePeriod(period: string, userId: string): Promise<CloseResult> {
  const existing = await prisma.period.findUnique({ where: { id: period } });
  if (existing?.status === "CLOSED") return { ok: true };

  const blockers = await getCloseBlockers(period);
  if (blockers.length > 0) return { ok: false, blockers };

  await prisma.$transaction(async (tx) => {
    await tx.period.upsert({
      where: { id: period },
      update: { status: "CLOSED", closedAt: new Date(), closedById: userId },
      create: { id: period, status: "CLOSED", closedAt: new Date(), closedById: userId },
    });
    await writeAudit(tx, {
      entity: "Period",
      entityId: period,
      action: "close",
      diff: { period },
      userId,
    });
  });
  return { ok: true };
}
