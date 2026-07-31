import "server-only";
import { ClientStatus, MatchStatus, prisma } from "@smetko/db";
import { writeAudit } from "@/lib/audit";

/**
 * SM-86 — client administration: deactivate (stop W1) and hard-delete (owner cleaning duplicate
 * clients). Delete cascades every record of the client and FREES the bank statement lines those
 * records occupied (so they can be re-matched to the correct client), all in one transaction, with
 * a full-impact AuditLog. Owner-confirmed even when the client has financial history (revision-1 §1).
 */

export interface DeletionImpact {
  name: string;
  charges: number;
  payments: number;
  expenses: number;
  statementLinesFreed: number;
}

/** Count what a delete would remove/free — for the confirmation dialog. */
export async function getDeletionImpact(clientId: string): Promise<DeletionImpact | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;
  const [charges, payments, expenses] = await Promise.all([
    prisma.charge.count({ where: { clientId } }),
    prisma.payment.count({ where: { clientId } }),
    prisma.expense.count({ where: { clientId } }),
  ]);
  const freed = await prisma.statementLine.count({
    where: {
      processed: true,
      OR: [{ payment: { clientId } }, { expense: { clientId } }],
    },
  });
  return { name: client.name, charges, payments, expenses, statementLinesFreed: freed };
}

/** Deactivate / reactivate a client. Non-ACTIVE clients are skipped by W1 (no new charges). */
export async function setClientStatus(clientId: string, status: ClientStatus, userId: string) {
  const before = await prisma.client.findUnique({ where: { id: clientId } });
  if (!before) throw new Error("Клиентот не постои.");
  await prisma.$transaction(async (tx) => {
    await tx.client.update({ where: { id: clientId }, data: { status } });
    await writeAudit(tx, {
      entity: "Client",
      entityId: clientId,
      action: "status",
      diff: { from: before.status, to: status },
      userId,
    });
  });
}

/** Hard-delete a client and all its records; free the bank statement lines they occupied. */
export async function deleteClient(clientId: string, userId: string): Promise<DeletionImpact> {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client) throw new Error("Клиентот не постои.");

    const charges = await tx.charge.findMany({ where: { clientId }, select: { id: true } });
    const chargeIds = charges.map((c) => c.id);
    const lines = await tx.chargeLine.findMany({
      where: { chargeId: { in: chargeIds } },
      select: { id: true },
    });
    const lineIds = lines.map((l) => l.id);
    const expenses = await tx.expense.findMany({
      where: { clientId },
      select: { id: true, statementLineId: true, adSpendReceiptId: true, cashEntryId: true },
    });
    const payments = await tx.payment.findMany({
      where: { clientId },
      select: { id: true, statementLineId: true },
    });

    // 1. Free the bank statement lines these payments/expenses occupied (re-matchable).
    const slIds = [...payments, ...expenses]
      .map((x) => x.statementLineId)
      .filter((x): x is string => !!x);
    if (slIds.length)
      await tx.statementLine.updateMany({
        where: { id: { in: slIds } },
        data: { processed: false, linkedType: null, linkedId: null },
      });
    // Reset Meta receipts that were auto-matched into these (deleted) expenses.
    const receiptIds = expenses.map((e) => e.adSpendReceiptId).filter((x): x is string => !!x);
    if (receiptIds.length)
      await tx.adSpendReceipt.updateMany({
        where: { id: { in: receiptIds } },
        data: { matchStatus: MatchStatus.UNMATCHED, statementLineId: null },
      });

    // 2. Null cross-references that would block deletes.
    if (lineIds.length)
      await tx.expense.updateMany({
        where: { billedOnLineId: { in: lineIds } },
        data: { billedOnLineId: null },
      });
    if (chargeIds.length)
      await tx.charge.updateMany({ where: { clientId }, data: { relatedChargeId: null } });

    // 3. Delete in FK-safe order.
    await tx.payment.deleteMany({ where: { OR: [{ clientId }, { chargeId: { in: chargeIds } }] } });
    const expIds = expenses.map((e) => e.id);
    if (expIds.length) await tx.asset.deleteMany({ where: { purchaseExpenseId: { in: expIds } } });
    await tx.expense.deleteMany({ where: { clientId } });
    const cashIds = expenses.map((e) => e.cashEntryId).filter((x): x is string => !!x);
    if (cashIds.length) await tx.cashLedgerEntry.deleteMany({ where: { id: { in: cashIds } } });
    await tx.chargeLine.deleteMany({ where: { chargeId: { in: chargeIds } } });
    await tx.charge.deleteMany({ where: { clientId } });
    await tx.servicePackage.deleteMany({ where: { clientId } });
    await tx.recurringLineTemplate.deleteMany({ where: { clientId } });
    await tx.adAccount.deleteMany({ where: { clientId } });
    await tx.clientBankAccount.deleteMany({ where: { clientId } });

    const impact: DeletionImpact = {
      name: client.name,
      charges: chargeIds.length,
      payments: payments.length,
      expenses: expenses.length,
      statementLinesFreed: slIds.length,
    };
    await writeAudit(tx, {
      entity: "Client",
      entityId: clientId,
      action: "delete",
      diff: { ...impact },
      userId,
    });
    await tx.client.delete({ where: { id: clientId } });
    return impact;
  });
}
