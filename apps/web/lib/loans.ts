import "server-only";
import { formatMKD } from "@smetko/shared";
import { Direction, prisma } from "@smetko/db";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";

/**
 * SM-100 — owner/private-person loans (financing flow). A позајмица is a liability, never revenue or
 * expense: recording one from a bank line takes it out of the Решавање queues and feeds the loan
 * balance, without ever touching Charges/Expenses or P&L.
 */

/** Period id ("YYYY-MM") for a transaction date — the economic month the loan movement belongs to. */
function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Record an unresolved bank line as a loan movement. IN → received (позајмица примена), OUT → repaid
 * (поврат) — the direction comes from the line. Marks the line processed (linkedType "Loan"). Atomic,
 * audited, period-guarded (B9). Idempotent: an already-processed line is rejected.
 */
export async function recordLoanFromLine(
  lineId: string,
  lenderName: string,
  note: string | null,
  userId: string,
): Promise<{ id: string }> {
  const name = lenderName.trim();
  if (name.length < 2) throw new Error("Внеси го името на заемодавачот.");

  return prisma.$transaction(async (tx) => {
    const line = await tx.statementLine.findUnique({ where: { id: lineId } });
    if (!line) throw new Error("Линијата не постои.");
    if (line.processed) throw new Error("Линијата е веќе решена.");

    const periodId = periodOf(line.date);
    await tx.period.upsert({ where: { id: periodId }, update: {}, create: { id: periodId } });
    await assertPeriodOpen(tx, periodId); // B9

    const loan = await tx.loanEntry.create({
      data: {
        lenderName: name,
        direction: line.direction,
        amount: line.amount,
        date: line.date,
        note: note?.trim() || null,
        statementLineId: line.id,
        periodId,
        createdById: userId,
      },
    });
    await tx.statementLine.update({
      where: { id: line.id },
      data: { processed: true, linkedType: "Loan", linkedId: loan.id },
    });
    await writeAudit(tx, {
      entity: "LoanEntry",
      entityId: loan.id,
      action: "loan.recorded",
      diff: { lenderName: name, direction: line.direction, amount: line.amount },
      userId,
    });
    return { id: loan.id };
  });
}

export interface LoanBalanceRow {
  lenderName: string;
  received: string; // Σ IN
  repaid: string; // Σ OUT
  outstanding: string; // received − repaid (what the company still owes)
  outstandingRaw: number;
}

/** Outstanding loan balance per lender (Σ received − Σ repaid) — the company's liability. */
export async function getLoanBalances(): Promise<LoanBalanceRow[]> {
  const grouped = await prisma.loanEntry.groupBy({
    by: ["lenderName", "direction"],
    _sum: { amount: true },
  });
  const byLender = new Map<string, { received: number; repaid: number }>();
  for (const g of grouped) {
    const cur = byLender.get(g.lenderName) ?? { received: 0, repaid: 0 };
    if (g.direction === Direction.IN) cur.received += g._sum.amount ?? 0;
    else cur.repaid += g._sum.amount ?? 0;
    byLender.set(g.lenderName, cur);
  }
  return [...byLender.entries()]
    .map(([lenderName, v]) => ({
      lenderName,
      received: formatMKD(v.received, { decimals: 0 }),
      repaid: formatMKD(v.repaid, { decimals: 0 }),
      outstanding: formatMKD(v.received - v.repaid, { decimals: 0 }),
      outstandingRaw: v.received - v.repaid,
    }))
    .sort((a, b) => b.outstandingRaw - a.outstandingRaw);
}
