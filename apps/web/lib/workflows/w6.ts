import "server-only";
import { CashDocType, Direction, PayChannel, prisma } from "@smetko/db";
import { type CashExpenseInput, currentPeriod } from "@smetko/shared";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";
import { lockCashLedger } from "@/lib/locks";

/**
 * W6 — mobile cash expense (Master Plan §W6). Atomic: Expense + CashLedgerEntry(OUT) + photo,
 * in one transaction. The photo is MANDATORY for cash (B5) — enforced here and at the action.
 * Never drives the blagajna negative (B3). Money in дени (B10).
 */
export async function recordCashExpense(
  input: CashExpenseInput & { attachmentUrl: string },
  userId: string,
) {
  if (!input.attachmentUrl) throw new Error("Кеш-трошок без слика е блокиран (B5).");
  const period = currentPeriod();

  await prisma.$transaction(async (tx) => {
    await tx.period.upsert({ where: { id: period }, update: {}, create: { id: period } });
    await assertPeriodOpen(tx, period); // B9
    await lockCashLedger(tx); // B3 — serialize the balance check-then-act against concurrent cash-out

    const [inAgg, outAgg] = await Promise.all([
      tx.cashLedgerEntry.aggregate({ _sum: { amount: true }, where: { direction: Direction.IN } }),
      tx.cashLedgerEntry.aggregate({ _sum: { amount: true }, where: { direction: Direction.OUT } }),
    ]);
    const balance = (inAgg._sum.amount ?? 0) - (outAgg._sum.amount ?? 0);
    if (input.amount > balance) throw new Error("Благајната би станала негативна (B3)."); // B3

    const entry = await tx.cashLedgerEntry.create({
      data: {
        direction: Direction.OUT,
        amount: input.amount,
        date: new Date(),
        description: input.description,
        counterpartyType: "VENDOR",
        documentType: CashDocType.KASA_ISPLATI,
        documentNumber: input.receiptNumber || null,
        attachmentUrl: input.attachmentUrl, // B5
        periodId: period,
        createdById: userId,
      },
    });

    await tx.expense.create({
      data: {
        category: input.category,
        vendor: input.vendor || null,
        amount: input.amount,
        date: new Date(),
        paymentChannel: PayChannel.CASH,
        isBillable: false,
        attachmentUrl: input.attachmentUrl,
        cashEntryId: entry.id,
      },
    });

    await writeAudit(tx, {
      entity: "Expense",
      entityId: entry.id,
      action: "cash.expense",
      diff: { amount: input.amount, category: input.category, vendor: input.vendor ?? null },
      userId,
    });
  });
}
