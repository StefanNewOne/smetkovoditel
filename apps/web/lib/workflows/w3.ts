import "server-only";
import { CashDocType, ChargeStatus, Direction, MatchStatus, PayChannel, prisma } from "@smetko/db";
import { type CollectCashInput, currentPeriod } from "@smetko/shared";
import { writeAudit } from "@/lib/audit";

/**
 * W3 — cash collection (Master Plan §W3). Atomic: a fiscal cash receipt (CashLedgerEntry IN,
 * FISCAL number D6) + a Payment applied to the charge. Partial is allowed; overpayment goes to
 * creditBalance (B18). Money in denari (B10).
 */
export async function collectCash(input: CollectCashInput, userId: string) {
  const period = currentPeriod();

  await prisma.$transaction(async (tx) => {
    await tx.period.upsert({ where: { id: period }, update: {}, create: { id: period } });

    const charge = await tx.charge.findUnique({ where: { id: input.chargeId } });
    if (!charge || charge.clientId !== input.clientId) {
      throw new Error("Задолжувањето не одговара на клиентот.");
    }
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new Error("Клиентот не постои.");

    const remaining = charge.total - charge.paidAmount;
    const applied = Math.min(input.amount, Math.max(remaining, 0));
    const overpay = input.amount - applied;

    // The fiscal cash receipt — this is the money actually entering the blagajna (D6).
    const entry = await tx.cashLedgerEntry.create({
      data: {
        direction: Direction.IN,
        amount: input.amount,
        date: new Date(),
        description: `Наплата — ${client.name}`,
        counterpartyType: "CLIENT",
        counterpartyId: client.id,
        documentType: CashDocType.FISCAL,
        documentNumber: input.fiscalNumber,
        periodId: period,
        createdById: userId,
      },
    });

    // The allocation to the charge (partial allowed).
    await tx.payment.create({
      data: {
        clientId: client.id,
        chargeId: charge.id,
        channel: PayChannel.CASH,
        amount: applied,
        date: new Date(),
        matchStatus: MatchStatus.MANUAL_MATCHED,
        cashEntryId: entry.id,
      },
    });

    const newPaid = charge.paidAmount + applied;
    await tx.charge.update({
      where: { id: charge.id },
      data: {
        paidAmount: newPaid,
        status: newPaid >= charge.total ? ChargeStatus.PAID : ChargeStatus.PARTIALLY_PAID,
      },
    });

    if (overpay > 0) {
      await tx.client.update({
        where: { id: client.id },
        data: { creditBalance: { increment: overpay } }, // B18
      });
    }

    await writeAudit(tx, {
      entity: "Charge",
      entityId: charge.id,
      action: "cash.collect",
      diff: { amount: input.amount, applied, overpay, fiscal: input.fiscalNumber },
      userId,
    });
  });
}
