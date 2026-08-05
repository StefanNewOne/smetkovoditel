import { beforeEach, describe, expect, it } from "vitest";
import { bookAllOtherCardReceipts, bookOtherCardReceipt } from "@/lib/workflows/meta";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * SM-114 — booking Meta receipts paid on another card (no NLB statement), USD→МКД at an owner rate.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function openPeriod(id: string) {
  await prisma.period.upsert({ where: { id }, create: { id, status: "OPEN" }, update: {} });
}

async function receipt(o: {
  ref: string;
  card: string;
  usd: number;
  account?: string;
  matchStatus?: "UNMATCHED" | "AUTO_MATCHED";
  metaAccountId?: string;
}) {
  return prisma.adSpendReceipt.create({
    data: {
      emailMessageId: `msg-${o.ref}`,
      transactionId: `tx-${o.ref}`,
      metaInvoiceNo: `inv-${o.ref}`,
      referenceNumber: o.ref,
      accountName: o.account ?? "Acc",
      metaAccountId: o.metaAccountId ?? null,
      amountUsd: o.usd,
      cardLast4: o.card,
      invoiceDate: new Date(Date.UTC(2026, 6, 15)),
      attachmentUrl: `/api/attachments/${o.ref}.pdf`,
      parseStatus: "OK",
      matchStatus: o.matchStatus ?? "UNMATCHED",
      receivedAt: new Date(Date.UTC(2026, 6, 15)),
    },
  });
}

describe("SM-114 other-card Meta booking", () => {
  it("books an other-card receipt as a billable ADS expense, USD→МКД at the rate", async () => {
    await openPeriod("2026-07");
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await prisma.adAccount.create({
      data: { metaAccountId: "acc-1", name: "Astibo", clientId: client.id },
    });
    const r = await receipt({ ref: "OTHER1", card: "6613", usd: 10787, metaAccountId: "acc-1" });

    await bookOtherCardReceipt(r.id, 61.5, userId);

    const exp = await prisma.expense.findFirstOrThrow({ where: { adSpendReceiptId: r.id } });
    expect(exp.category).toBe("ADS");
    expect(exp.amount).toBe(Math.round(10787 * 61.5)); // 663401 дени
    expect(exp.clientId).toBe(client.id);
    expect(exp.isBillable).toBe(true);
    expect(exp.statementLineId).toBeNull();
    const fresh = await prisma.adSpendReceipt.findUniqueOrThrow({ where: { id: r.id } });
    expect(fresh.matchStatus).toBe("MANUAL_MATCHED");
  });

  it("is idempotent — a second book creates no second expense", async () => {
    await openPeriod("2026-07");
    const r = await receipt({ ref: "OTHER2", card: "6613", usd: 5000 });
    await bookOtherCardReceipt(r.id, 60, userId);
    await expect(bookOtherCardReceipt(r.id, 60, userId)).rejects.toThrow();
    expect(await prisma.expense.count({ where: { adSpendReceiptId: r.id } })).toBe(1);
  });

  it("bulk skips main-card (statement) receipts", async () => {
    await openPeriod("2026-07");
    await receipt({ ref: "MAIN1", card: "8234", usd: 4000, matchStatus: "AUTO_MATCHED" });
    await receipt({ ref: "MAIN2", card: "8234", usd: 4000 }); // unmatched, but on a statement card
    await receipt({ ref: "OTH1", card: "6613", usd: 3000 });
    await receipt({ ref: "OTH2", card: "6613", usd: 2000 });

    const res = await bookAllOtherCardReceipts(61, userId);
    expect(res.count).toBe(2); // only the two 6613 receipts

    const main = await prisma.adSpendReceipt.findFirstOrThrow({
      where: { referenceNumber: "MAIN2" },
    });
    expect(main.matchStatus).toBe("UNMATCHED"); // untouched — awaits its statement
  });
});
