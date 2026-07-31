import { beforeEach, describe, expect, it } from "vitest";
import { getResolveCenter } from "@/lib/resolve";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * SM-82 — the payer account (Cyrillic names are garbled by the PDF font, the account is readable)
 * learned from a prior matched payment auto-suggests the client on the next payment from the same
 * account. Suggestion only — the human confirms (§4.2).
 */
const PERIOD = "2026-07";
const ACC = "200-0000114629-67";
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function inLine(amount: number, opts: { processed: boolean; acct: string; n: number }) {
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: opts.n,
      statementDate: new Date(Date.UTC(2026, 6, 10)),
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
      lineHash: `h-${opts.n}-${amount}`,
      date: new Date(Date.UTC(2026, 6, 10)),
      amount,
      direction: "IN",
      description: "Уплата",
      counterpartyAccount: opts.acct,
      classifiedAs: "OTHER",
      processed: opts.processed,
    },
  });
}

describe("getResolveCenter — payer-account client suggestion (SM-82)", () => {
  it("suggests the client of a prior matched payment from the same payer account", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 2_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId);

    // History: a processed IN line from ACC, matched to a Payment for this client.
    const prior = await inLine(500000, { processed: true, acct: ACC, n: 701 });
    await prisma.payment.create({
      data: {
        clientId: client.id,
        chargeId: charge.id,
        channel: "BANK",
        amount: 500000,
        date: new Date(Date.UTC(2026, 6, 5)),
        matchStatus: "MANUAL_MATCHED",
        statementLineId: prior.id,
      },
    });

    // A NEW unmatched payment from the SAME account (different amount → no amount suggestion).
    const newLine = await inLine(123456, { processed: false, acct: ACC, n: 702 });

    const c = await getResolveCenter();
    const pay = c.payments.find((p) => p.id === newLine.id);
    expect(pay).toBeDefined();
    expect(pay!.suggestedClientId).toBe(client.id); // learned from the account history
  });

  it("offers no client suggestion for an unknown payer account", async () => {
    const newLine = await inLine(98765, { processed: false, acct: "999-0000000000-00", n: 703 });
    const c = await getResolveCenter();
    const pay = c.payments.find((p) => p.id === newLine.id);
    expect(pay!.suggestedClientId).toBeUndefined();
  });
});
