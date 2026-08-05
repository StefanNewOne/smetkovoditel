import { beforeEach, describe, expect, it } from "vitest";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { getPaymentSuggestions } from "@/lib/charges";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * SM-119 — FIFO no longer auto-settles on import; ЗАДОЛЖУВАЊА surfaces an account-matched incoming
 * line as a suggestion to confirm.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("SM-119 payment suggestion (confirm, not auto)", () => {
  it("suggests an unprocessed incoming line matched by the client's giro account", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await prisma.clientBankAccount.create({
      data: { clientId: c.id, account: "300-0000000001-11" },
    });
    await prisma.period.upsert({
      where: { id: "2026-07" },
      create: { id: "2026-07", status: "OPEN" },
      update: {},
    });
    await generateCharges("2026-07", userId, "INVOICE");
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: c.id } });
    await approveInvoice(charge.id, userId); // → OPEN, total 3.540.000

    // An incoming bank line from the client's giro account, still unprocessed (NOT auto-booked).
    const bank = await prisma.bankAccount.findFirstOrThrow();
    const imp = await prisma.bankStatementImport.create({
      data: {
        bankAccountId: bank.id,
        statementNumber: 300,
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
        lineHash: "sugg-1",
        date: new Date(Date.UTC(2026, 6, 20)),
        amount: 3_540_000,
        direction: "IN",
        description: "уплата",
        counterpartyAccount: "300-0000000001-11",
        classifiedAs: "OTHER",
        processed: false,
      },
    });

    const sugg = await getPaymentSuggestions("2026-07");
    expect(sugg[charge.id]).toBeDefined();
    expect(sugg[charge.id]!.lineId).toBe(line.id);
    // the invoice is still OPEN until the owner confirms — nothing auto-booked
    const fresh = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(fresh.status).toBe("OPEN");
    expect(fresh.paidAmount).toBe(0);
  });
});
