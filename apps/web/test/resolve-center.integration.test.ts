import { beforeEach, describe, expect, it } from "vitest";
import { getResolveCenter } from "@/lib/resolve";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/** SM-81 — data for the Решавање screen: unmatched IN payments (client-filtered charge options)
 *  and unmatched OUT expense lines (categorization). */
const PERIOD = "2026-07";
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function line(
  dir: "IN" | "OUT",
  amount: number,
  opts: { classifiedAs?: string; n?: number } = {},
) {
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: opts.n ?? 800,
      statementDate: new Date(Date.UTC(2026, 6, 10)),
      source: "MANUAL_UPLOAD",
      fileRef: "t",
      openingBalance: 0,
      totalDebit: dir === "OUT" ? amount : 0,
      totalCredit: dir === "IN" ? amount : 0,
      closingBalance: 0,
      orderCount: 1,
      status: "PARSED",
    },
  });
  return prisma.statementLine.create({
    data: {
      importId: imp.id,
      lineHash: `h-${dir}-${opts.n ?? 800}-${amount}`,
      date: new Date(Date.UTC(2026, 6, 10)),
      amount,
      direction: dir,
      description: dir === "OUT" ? "SKOPJE PIKS PLUS TRADE" : "Уплата",
      counterpartyName: dir === "OUT" ? "SKOPJE PIKS PLUS TRADE" : null,
      classifiedAs: opts.classifiedAs ?? (dir === "OUT" ? "CARD_TX" : "OTHER"),
      processed: false,
    },
  });
}

describe("getResolveCenter (SM-81)", () => {
  it("splits unmatched lines into payments (IN) and expenses (OUT), with categories", async () => {
    await line("IN", 12345, { n: 801 });
    await line("OUT", 6789, { n: 802 });

    const c = await getResolveCenter();
    expect(c.payments).toHaveLength(1);
    expect(c.payments[0]!.amount).toContain("+");
    expect(c.expenses).toHaveLength(1);
    expect(c.expenses[0]!.amount).toContain("−");
    expect(c.categories.map((x) => x.value)).toContain("REPRESENTATION");
    expect(c.categories.map((x) => x.value)).toContain("FUEL");
  });

  it("offers open charges tagged with clientId so the UI can filter by the paying client", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 2_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId); // OPEN, total 2.360.000
    await line("IN", charge.total, { n: 803 });

    const c = await getResolveCenter();
    const mine = c.openCharges.filter((o) => o.clientId === client.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(charge.id);
    // exact-amount suggestion points at that charge
    const pay = c.payments.find((p) => p.suggestedChargeId === charge.id);
    expect(pay).toBeDefined();
  });
});
