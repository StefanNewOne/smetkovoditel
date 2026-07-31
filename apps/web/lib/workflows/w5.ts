import "server-only";
import { CashDocType, Direction, PayChannel, type Prisma, prisma } from "@smetko/db";
import {
  type CalcHonorarInput,
  type PayoutInput,
  currentPeriod,
  withholdingTax,
} from "@smetko/shared";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";
import { lockCashLedger } from "@/lib/locks";

interface Allocation {
  clientId: string;
  amount: number;
  billable: boolean;
}

/** W5 step 1 — calculate an honorar → ContractorPayment(CALCULATED). No money moves yet. */
export async function calcHonorar(input: CalcHonorarInput, userId: string) {
  const contractor = await prisma.contractor.findUnique({ where: { id: input.contractorId } });
  if (!contractor) throw new Error("Хонорарецот не постои.");

  // D2/B16: only talent contractors' allocations may be billable. A billable allocation on a
  // non-talent contractor would create a cost that is never expensed/billed — reject it, don't
  // silently drop it.
  if (!contractor.isTalent && input.allocations.some((a) => a.billable)) {
    throw new Error("Само актери (isTalent) можат да имаат билабилни алокации (D2).");
  }

  const taxAmount = withholdingTax(input.grossAmount, contractor.taxMode);
  const netAmount = input.grossAmount - taxAmount;

  const payment = await prisma.contractorPayment.create({
    data: {
      contractorId: contractor.id,
      period: input.period,
      grossAmount: input.grossAmount,
      taxAmount,
      netAmount,
      paymentChannel: PayChannel.CASH, // set concretely at payout
      allocations: input.allocations as unknown as Prisma.InputJsonValue,
      status: "CALCULATED",
    },
  });

  await writeAudit(prisma, {
    entity: "ContractorPayment",
    entityId: payment.id,
    action: "calc",
    diff: { gross: input.grossAmount, tax: taxAmount, net: netAmount },
    userId,
  });
  return payment.id;
}

/**
 * W5 step 2 — pay out (CALCULATED → PAID, one-way). Atomic:
 *  - cash payout → CashLedgerEntry OUT (KASA_ISPLATI, doc required B7; never negative B3)
 *  - for each billable allocation on an isTalent contractor: exactly one billable
 *    Expense(ACTORS, amount = allocated BRUTO, contractorPaymentId) — D2/B16, feeds W1.
 * Idempotent: an already-PAID payment is a no-op (structural guard for T14).
 */
export async function payoutHonorar(input: PayoutInput, userId: string) {
  const period = currentPeriod();

  await prisma.$transaction(async (tx) => {
    const payment = await tx.contractorPayment.findUnique({ where: { id: input.paymentId } });
    if (!payment) throw new Error("Пресметката не постои.");

    // T14/B16 — atomically claim CALCULATED→PAID. updateMany takes a row lock, so a concurrent
    // payout blocks, then sees status PAID and count 0 → returns. This makes a second set of ACTORS
    // expenses structurally impossible, not merely guarded by a stale read. The refining update at
    // the end (channel, cashEntryId) stays within this tx and rolls back with everything on error.
    const claim = await tx.contractorPayment.updateMany({
      where: { id: payment.id, status: "CALCULATED" },
      data: { status: "PAID" },
    });
    if (claim.count === 0) return; // already paid/claimed by a concurrent run — no double payout

    const contractor = await tx.contractor.findUnique({ where: { id: payment.contractorId } });
    if (!contractor) throw new Error("Хонорарецот не постои.");

    const channel = input.channel === "CASH" ? PayChannel.CASH : PayChannel.BANK;
    let cashEntryId: string | null = null;

    if (channel === PayChannel.CASH) {
      if (!input.documentNumber) throw new Error("Кеш-исплата бара документ (B7).");
      await tx.period.upsert({ where: { id: period }, update: {}, create: { id: period } });
      await assertPeriodOpen(tx, period); // B9
      await lockCashLedger(tx); // B3 — serialize the never-negative check against concurrent cash-out

      const [inAgg, outAgg] = await Promise.all([
        tx.cashLedgerEntry.aggregate({
          _sum: { amount: true },
          where: { direction: Direction.IN },
        }),
        tx.cashLedgerEntry.aggregate({
          _sum: { amount: true },
          where: { direction: Direction.OUT },
        }),
      ]);
      const balance = (inAgg._sum.amount ?? 0) - (outAgg._sum.amount ?? 0);
      if (payment.netAmount > balance) throw new Error("Благајната би станала негативна (B3)."); // B3

      const entry = await tx.cashLedgerEntry.create({
        data: {
          direction: Direction.OUT,
          amount: payment.netAmount,
          date: new Date(),
          description: `Хонорар — ${contractor.name}`,
          counterpartyType: "CONTRACTOR",
          counterpartyId: contractor.id,
          documentType: CashDocType.KASA_ISPLATI,
          documentNumber: input.documentNumber,
          periodId: period,
          createdById: userId,
        },
      });
      cashEntryId = entry.id;
    }

    const allocations = payment.allocations as unknown as Allocation[];

    // D2/B16: one billable ACTORS Expense per billable allocation, only for talent.
    if (contractor.isTalent) {
      for (const alloc of allocations) {
        if (!alloc.billable) continue;
        await tx.expense.create({
          data: {
            category: "ACTORS",
            vendor: contractor.name,
            amount: alloc.amount, // allocated BRUTO (Master Plan §5)
            date: new Date(),
            paymentChannel: channel,
            clientId: alloc.clientId,
            isBillable: true,
            contractorPaymentId: payment.id,
          },
        });
      }
    }

    await tx.contractorPayment.update({
      where: { id: payment.id },
      data: { status: "PAID", paymentChannel: channel, cashEntryId },
    });

    await writeAudit(tx, {
      entity: "ContractorPayment",
      entityId: payment.id,
      action: "payout",
      diff: { channel, net: payment.netAmount, talent: contractor.isTalent },
      userId,
    });
  });
}
