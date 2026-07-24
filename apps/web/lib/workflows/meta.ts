import "server-only";
import { MatchStatus, PayChannel, prisma } from "@smetko/db";
import { writeAudit } from "@/lib/audit";

/**
 * META Реклами (SM-94..97) — attribution + resolution of Meta ad spend flowing through the NLB card.
 */

/** Map an ad account to a client (or null = own marketing) and RE-ATTRIBUTE its existing ADS
 *  expenses (SM-95). One transaction, audited. */
export async function mapAdAccount(metaAccountId: string, clientId: string | null, userId: string) {
  await prisma.$transaction(async (tx) => {
    const receipts = await tx.adSpendReceipt.findMany({
      where: { metaAccountId },
      select: { id: true, accountName: true },
    });
    const name = receipts[0]?.accountName || metaAccountId;
    await tx.adAccount.upsert({
      where: { metaAccountId },
      create: { metaAccountId, name, clientId },
      update: { clientId },
    });
    const receiptIds = receipts.map((r) => r.id);
    if (receiptIds.length) {
      await tx.expense.updateMany({
        where: { category: "ADS", adSpendReceiptId: { in: receiptIds } },
        data: { clientId, isBillable: clientId != null },
      });
    }
    await writeAudit(tx, {
      entity: "AdAccount",
      entityId: metaAccountId,
      action: "map",
      diff: { clientId, reAttributed: receiptIds.length },
      userId,
    });
  });
}

/** Book a FACEBK statement line (no receipt) as an ADS expense (SM-96): client → billable, or null
 *  → own marketing / other card. The statement line is the document (B6). Marks the line processed. */
export async function bookFacebkLine(lineId: string, clientId: string | null, userId: string) {
  await prisma.$transaction(async (tx) => {
    const line = await tx.statementLine.findUnique({ where: { id: lineId } });
    if (!line || line.processed) throw new Error("Линијата не постои или е веќе решена.");
    const exp = await tx.expense.create({
      data: {
        category: "ADS",
        vendor: "Meta",
        amount: line.amount, // MKD од изводот, 1:1 (D3)
        date: line.date,
        paymentChannel: PayChannel.CARD,
        clientId,
        isBillable: clientId != null,
        statementLineId: line.id,
      },
    });
    await tx.statementLine.update({
      where: { id: line.id },
      data: { processed: true, direction: "OUT", linkedType: "Expense", linkedId: exp.id },
    });
    await writeAudit(tx, {
      entity: "StatementLine",
      entityId: line.id,
      action: "facebk.booked",
      diff: { amount: line.amount, clientId, expenseId: exp.id },
      userId,
    });
  });
}

/** Delete an unmatched Meta receipt (SM-97) — wrongly entered / from another card. Only UNMATCHED. */
export async function deleteReceipt(receiptId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.adSpendReceipt.findUnique({ where: { id: receiptId } });
    if (!r) throw new Error("Receipt не постои.");
    if (r.matchStatus !== MatchStatus.UNMATCHED)
      throw new Error("Само неспарен receipt може да се избрише.");
    await writeAudit(tx, {
      entity: "AdSpendReceipt",
      entityId: receiptId,
      action: "delete",
      diff: { referenceNumber: r.referenceNumber, accountName: r.accountName },
      userId,
    });
    await tx.adSpendReceipt.delete({ where: { id: receiptId } });
  });
}

/** Manually match an orphan receipt to a chosen FACEBK statement line (SM-97) → books the ADS
 *  expense at the statement MKD, attributed via the receipt's mapped ad account. */
export async function manualMatchReceipt(receiptId: string, lineId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.adSpendReceipt.findUnique({ where: { id: receiptId } });
    if (!r || r.matchStatus !== MatchStatus.UNMATCHED)
      throw new Error("Receipt не е за спарување.");
    const line = await tx.statementLine.findUnique({ where: { id: lineId } });
    if (!line || line.processed) throw new Error("Линијата не постои или е веќе решена.");

    const adAccount = r.metaAccountId
      ? await tx.adAccount.findUnique({ where: { metaAccountId: r.metaAccountId } })
      : null;
    const clientId = adAccount?.clientId ?? null;
    const exp = await tx.expense.create({
      data: {
        category: "ADS",
        vendor: "Meta",
        amount: line.amount,
        date: line.date,
        paymentChannel: PayChannel.CARD,
        clientId,
        isBillable: clientId != null,
        attachmentUrl: r.attachmentUrl,
        statementLineId: line.id,
        adSpendReceiptId: r.id,
      },
    });
    await tx.adSpendReceipt.update({
      where: { id: r.id },
      data: { matchStatus: MatchStatus.MANUAL_MATCHED, statementLineId: line.id },
    });
    await tx.statementLine.update({
      where: { id: line.id },
      data: { processed: true, direction: "OUT", linkedType: "Expense", linkedId: exp.id },
    });
    await writeAudit(tx, {
      entity: "AdSpendReceipt",
      entityId: r.id,
      action: "match.manual",
      diff: { lineId, amountMkd: line.amount, clientId },
      userId,
    });
  });
}
