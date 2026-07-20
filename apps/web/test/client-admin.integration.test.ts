import { beforeEach, describe, expect, it } from "vitest";
import { deleteClient, setClientStatus } from "@/lib/workflows/client-admin";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { manualMatchStatementLine } from "@/lib/workflows/w2";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * SM-86 — hard-delete removes a client and all its records and FREES the bank statement lines it
 * occupied (re-matchable); deactivate stops W1. Owner-confirmed even with financial history.
 */
const PERIOD = "2026-07";
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function matchedInvoiceClient() {
  const client = await createInvoiceClient({ userId, monthlyAmount: 2_000_000 });
  await generateCharges(PERIOD, userId);
  const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
  await approveInvoice(charge.id, userId);
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: 610,
      statementDate: new Date(),
      source: "MANUAL_UPLOAD",
      fileRef: "t",
      openingBalance: 0,
      totalDebit: 0,
      totalCredit: charge.total,
      closingBalance: charge.total,
      orderCount: 1,
      status: "PARSED",
    },
  });
  const line = await prisma.statementLine.create({
    data: {
      importId: imp.id,
      lineHash: "h-del",
      date: new Date(),
      amount: charge.total,
      direction: "IN",
      description: "Уплата",
      classifiedAs: "CLIENT_PAYMENT",
      processed: false,
    },
  });
  await manualMatchStatementLine(line.id, charge.id, userId);
  return { client, charge, line };
}

describe("client-admin (SM-86)", () => {
  it("hard-deletes the client, its records, and frees the matched statement line", async () => {
    const { client, line } = await matchedInvoiceClient();
    // preconditions
    expect(await prisma.payment.count({ where: { clientId: client.id } })).toBe(1);
    expect(
      (await prisma.statementLine.findUniqueOrThrow({ where: { id: line.id } })).processed,
    ).toBe(true);

    await deleteClient(client.id, userId);

    expect(await prisma.client.findUnique({ where: { id: client.id } })).toBeNull();
    expect(await prisma.charge.count({ where: { clientId: client.id } })).toBe(0);
    expect(await prisma.payment.count({ where: { clientId: client.id } })).toBe(0);
    const freed = await prisma.statementLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(freed.processed).toBe(false); // freed for re-matching
    expect(freed.linkedId).toBeNull();
  });

  it("deactivate sets a non-ACTIVE status so W1 skips the client", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    await setClientStatus(client.id, "CHURNED", userId);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).status).toBe(
      "CHURNED",
    );
    // fresh period → W1 must not create a charge for a non-ACTIVE client
    await generateCharges("2026-09", userId);
    expect(await prisma.charge.count({ where: { clientId: client.id, period: "2026-09" } })).toBe(
      0,
    );
  });
});
