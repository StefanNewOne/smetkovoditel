import { beforeEach, describe, expect, it } from "vitest";
import { getImportCenter } from "@/lib/import";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * Import-center amount suggestions (SM-78 follow-up): an incoming bank payment whose value exactly
 * equals a single open invoice's total is suggested for one-click matching (client paid without a
 * повик). A suggestion only — the user confirms; never auto-applied (Master Plan §4.2).
 */
const PERIOD = "2026-07";
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function incomingPayment(amount: number) {
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: 500,
      statementDate: new Date(),
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
  await prisma.statementLine.create({
    data: {
      importId: imp.id,
      lineHash: `h-${amount}`,
      date: new Date(),
      amount,
      direction: "IN",
      description: "Уплата без повик",
      classifiedAs: "OTHER",
      processed: false,
    },
  });
}

describe("import center — amount suggestions", () => {
  it("suggests the open invoice whose total equals an unmatched incoming payment", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 2_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId); // OPEN, total 2.360.000
    await incomingPayment(charge.total);

    const center = await getImportCenter();
    expect(center.queues.payments).toHaveLength(1);
    expect(center.queues.payments[0]!.direction).toBe("IN");
    expect(center.queues.payments[0]!.suggestion?.id).toBe(charge.id);
  });

  it("offers no suggestion when the amount is ambiguous (two invoices share the total)", async () => {
    const a = await createInvoiceClient({ userId, monthlyAmount: 2_000_000, name: "A" });
    const b = await createInvoiceClient({ userId, monthlyAmount: 2_000_000, name: "B" });
    await generateCharges(PERIOD, userId);
    for (const cl of [a, b]) {
      const c = await prisma.charge.findFirstOrThrow({ where: { clientId: cl.id } });
      await approveInvoice(c.id, userId);
    }
    const total = (await prisma.charge.findFirstOrThrow()).total;
    await incomingPayment(total);

    const center = await getImportCenter();
    expect(center.queues.payments[0]!.suggestion).toBeUndefined(); // ambiguous → no auto-suggest
  });
});
