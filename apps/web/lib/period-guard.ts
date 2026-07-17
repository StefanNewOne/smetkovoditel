import "server-only";
import { type Prisma, prisma } from "@smetko/db";

/** Thrown when a mutation targets a CLOSED period (B9). */
export class PeriodClosedError extends Error {
  constructor(period: string) {
    super(`Периодот ${period} е затворен — корекции само преку CREDIT_NOTE/сторно (B9).`);
    this.name = "PeriodClosedError";
  }
}

/** Reject writes into a CLOSED period (B9, CLAUDE.md Category 15 #6). Call inside the tx. */
export async function assertPeriodOpen(
  tx: Prisma.TransactionClient | typeof prisma,
  period: string,
): Promise<void> {
  const p = await tx.period.findUnique({ where: { id: period } });
  if (p?.status === "CLOSED") throw new PeriodClosedError(period);
}
