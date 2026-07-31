import "server-only";
import type { Prisma } from "@smetko/db";

/**
 * Serialize all blagajna cash-OUT balance checks (B3). The never-negative guard reads an aggregate
 * (Σ IN − Σ OUT) and then writes — a classic check-then-act race under READ COMMITTED. A
 * transaction-scoped Postgres advisory lock forces every cash-out through one at a time; it is
 * released automatically on commit/rollback, so no manual unlock is needed. Take it BEFORE the
 * balance aggregate read, inside the same $transaction.
 */
const CASH_LEDGER_LOCK = 4823001;

export async function lockCashLedger(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CASH_LEDGER_LOCK})`;
}
