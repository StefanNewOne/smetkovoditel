import "server-only";
import { MatchStatus, PayChannel, prisma } from "@smetko/db";
import { currentPeriod } from "@smetko/shared";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";

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
      // B9: re-attribution rewrites which client an expense is billed to — never touch a closed
      // period. Block if any affected ADS expense lives in a CLOSED month.
      const affected = await tx.expense.findMany({
        where: { category: "ADS", adSpendReceiptId: { in: receiptIds } },
        select: { date: true },
      });
      for (const p of new Set(affected.map((e) => currentPeriod(e.date)))) {
        await assertPeriodOpen(tx, p);
      }
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
    await assertPeriodOpen(tx, currentPeriod(line.date)); // B9
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

/**
 * SM-114 — book a Meta receipt paid on ANOTHER card (no NLB statement, so no FACEBK line to match).
 * The booked МКД is the USD converted at a rate the owner supplies (денари per USD): D3 says the МКД
 * from the NLB statement is booked 1:1, but this card has no statement — the Meta PDF is the document
 * and the amount is the conversion. One billable Expense(ADS) per receipt (B15/B16, adSpendReceiptId
 * unique). Race-safe claim, period-guarded (B9), audited with the rate for traceability.
 */
export async function bookOtherCardReceipt(receiptId: string, rate: number, userId: string) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Внеси валиден USD→МКД курс.");
  await prisma.$transaction(async (tx) => {
    const r = await tx.adSpendReceipt.findUnique({ where: { id: receiptId } });
    if (!r) throw new Error("Receipt не постои.");
    if (r.matchStatus !== MatchStatus.UNMATCHED)
      throw new Error("Само неспарен receipt може да се книжи.");

    // Atomic claim — a concurrent book/match must not double-book (Expense.adSpendReceiptId is the
    // structural backstop; this makes the lost racer a clean no-op instead of a P2002 crash).
    const claim = await tx.adSpendReceipt.updateMany({
      where: { id: r.id, matchStatus: MatchStatus.UNMATCHED },
      data: { matchStatus: MatchStatus.MANUAL_MATCHED },
    });
    if (claim.count === 0) return;

    await assertPeriodOpen(tx, currentPeriod(r.invoiceDate)); // B9

    const adAccount = r.metaAccountId
      ? await tx.adAccount.findUnique({ where: { metaAccountId: r.metaAccountId } })
      : null;
    const clientId = adAccount?.clientId ?? null;
    // дени = USD-центи × (денари/USD): the ×100 of cents cancels the ×100 of дени.
    const amountMkd = Math.round(r.amountUsd * rate);

    const exp = await tx.expense.create({
      data: {
        category: "ADS",
        vendor: "Meta",
        amount: amountMkd,
        date: r.invoiceDate,
        paymentChannel: PayChannel.CARD,
        clientId,
        isBillable: clientId != null, // B2
        attachmentUrl: r.attachmentUrl, // the Meta PDF — legal document (no statement for this card)
        adSpendReceiptId: r.id,
      },
    });
    await writeAudit(tx, {
      entity: "AdSpendReceipt",
      entityId: r.id,
      action: "book.otherCard",
      diff: {
        cardLast4: r.cardLast4,
        amountUsd: r.amountUsd,
        rate,
        amountMkd,
        clientId,
        expenseId: exp.id,
      },
      userId,
    });
  });
}

/** SM-114 — book every unmatched receipt on an "other" card (no auto-matched receipts on that card).
 *  Main-card receipts are skipped — they book 1:1 via their NLB statement. Returns how many booked. */
export async function bookAllOtherCardReceipts(
  rate: number,
  userId: string,
): Promise<{ count: number; totalMkd: number }> {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Внеси валиден USD→МКД курс.");
  const auto = await prisma.adSpendReceipt.findMany({
    where: { matchStatus: MatchStatus.AUTO_MATCHED },
    select: { cardLast4: true },
    distinct: ["cardLast4"],
  });
  const statementCards = new Set(auto.map((a) => a.cardLast4));
  const pending = await prisma.adSpendReceipt.findMany({
    where: { matchStatus: MatchStatus.UNMATCHED },
    select: { id: true, cardLast4: true, amountUsd: true },
  });
  let count = 0;
  let totalMkd = 0;
  for (const r of pending) {
    if (statementCards.has(r.cardLast4)) continue; // main-card receipt — awaits its statement
    try {
      await bookOtherCardReceipt(r.id, rate, userId);
      count++;
      totalMkd += Math.round(r.amountUsd * rate);
    } catch {
      // Skip one that can't be booked (e.g. a closed period) and continue with the rest.
    }
  }
  return { count, totalMkd };
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
    await assertPeriodOpen(tx, currentPeriod(line.date)); // B9

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
