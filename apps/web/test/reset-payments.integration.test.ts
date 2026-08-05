import { beforeEach, describe, expect, it } from "vitest";
import { approveInvoice, generateCharges, resetChargePayments } from "@/lib/workflows/w1";
import { manualMatchStatementLine } from "@/lib/workflows/w2";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/** SM-119 — Поништи раздолжување: undo a charge's payments and reopen it. */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("SM-119 reset charge payments", () => {
  it("deletes payments, frees the line, and reopens the invoice", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await prisma.period.upsert({
      where: { id: "2026-07" },
      create: { id: "2026-07", status: "OPEN" },
      update: {},
    });
    await generateCharges("2026-07", userId, "INVOICE");
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: c.id } });
    await approveInvoice(charge.id, userId);

    const bank = await prisma.bankAccount.findFirstOrThrow();
    const imp = await prisma.bankStatementImport.create({
      data: {
        bankAccountId: bank.id,
        statementNumber: 500,
        statementDate: new Date(Date.UTC(2026, 6, 20)),
        source: "MANUAL_UPLOAD",
        fileRef: "t",
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 3_540_000,
        closingBalance: 3_540_000,
        orderCount: 1,
        status: "PARSED",
      },
    });
    const line = await prisma.statementLine.create({
      data: {
        importId: imp.id,
        lineHash: "reset-1",
        date: new Date(Date.UTC(2026, 6, 20)),
        amount: 3_540_000,
        direction: "IN",
        description: "уплата",
        processed: false,
      },
    });
    await manualMatchStatementLine(line.id, charge.id, userId); // → PAID

    await resetChargePayments(charge.id, userId);

    const fresh = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(fresh.status).toBe("OPEN");
    expect(fresh.paidAmount).toBe(0);
    expect(fresh.invoiceNumber).toBeTruthy(); // number kept
    expect(await prisma.payment.count({ where: { chargeId: charge.id } })).toBe(0);
    const freed = await prisma.statementLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(freed.processed).toBe(false); // re-matchable
  });
});
