import { beforeEach, describe, expect, it } from "vitest";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { settleLineToInvoices } from "@/lib/workflows/w2";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/** SM-119 — one incoming payment split across two invoices of two different client records. */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function openInvoice(name: string, amount: number) {
  const c = await createInvoiceClient({ userId, monthlyAmount: amount, name });
  await generateCharges("2026-07", userId, "INVOICE");
  const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: c.id } });
  await approveInvoice(charge.id, userId);
  return prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
}

async function inLine(amount: number) {
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: 400,
      statementDate: new Date(Date.UTC(2026, 6, 20)),
      source: "MANUAL_UPLOAD",
      fileRef: "t",
      openingBalance: 0,
      totalDebit: 0,
      totalCredit: amount,
      closingBalance: amount,
      orderCount: 1,
      status: "PARSED",
    },
  });
  return prisma.statementLine.create({
    data: {
      importId: imp.id,
      lineHash: "split-1",
      date: new Date(Date.UTC(2026, 6, 20)),
      amount,
      direction: "IN",
      description: "уплата",
      classifiedAs: "OTHER",
      processed: false,
    },
  });
}

describe("SM-119 split one payment across invoices", () => {
  it("settles two client invoices from a single line", async () => {
    await prisma.period.upsert({
      where: { id: "2026-07" },
      create: { id: "2026-07", status: "OPEN" },
      update: {},
    });
    const a = await openInvoice("Бренд А", 3_000_000); // total 3.540.000
    const b = await openInvoice("Бренд Б", 1_000_000); // total 1.180.000
    const line = await inLine(a.total + b.total);

    await settleLineToInvoices(
      line.id,
      [
        { chargeId: a.id, amount: a.total },
        { chargeId: b.id, amount: b.total },
      ],
      userId,
    );

    const fa = await prisma.charge.findUniqueOrThrow({ where: { id: a.id } });
    const fb = await prisma.charge.findUniqueOrThrow({ where: { id: b.id } });
    expect(fa.status).toBe("PAID");
    expect(fb.status).toBe("PAID");
    const fresh = await prisma.statementLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(fresh.processed).toBe(true);
    // one payment per invoice (the line's 1:1 link is on the first; both invoices got booked)
    expect(await prisma.payment.count({ where: { chargeId: { in: [a.id, b.id] } } })).toBe(2);
  });

  it("rejects allocations exceeding the line amount", async () => {
    await prisma.period.upsert({
      where: { id: "2026-07" },
      create: { id: "2026-07", status: "OPEN" },
      update: {},
    });
    const a = await openInvoice("Бренд В", 3_000_000);
    const line = await inLine(1_000_000);
    await expect(
      settleLineToInvoices(line.id, [{ chargeId: a.id, amount: a.total }], userId),
    ).rejects.toThrow();
  });
});
