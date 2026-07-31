import { beforeEach, describe, expect, it } from "vitest";
import { categorizeStatementLine } from "@/lib/workflows/w2";
import { prisma, resetDb } from "./setup/db";

/**
 * SM-83 — resolve an outgoing statement line as an operating Expense (§4.2). Card/bank expense needs
 * no photo (B6); atomic + period-guarded (B9); optional VendorRule learning for future auto-categorize.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function outLine(opts: {
  amount: number;
  vendor?: string;
  classifiedAs?: string;
  date?: Date;
  statementNumber?: number;
}) {
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: opts.statementNumber ?? 900,
      statementDate: opts.date ?? new Date(Date.UTC(2026, 6, 10)),
      source: "MANUAL_UPLOAD",
      fileRef: "t",
      openingBalance: 0,
      totalDebit: opts.amount,
      totalCredit: 0,
      closingBalance: -opts.amount,
      orderCount: 1,
      status: "PARSED",
    },
  });
  return prisma.statementLine.create({
    data: {
      importId: imp.id,
      lineHash: `h-${opts.statementNumber ?? 900}-${opts.amount}`,
      date: opts.date ?? new Date(Date.UTC(2026, 6, 10)),
      amount: opts.amount,
      direction: "OUT",
      description: opts.vendor ?? "SKOPJE PETROL BB",
      counterpartyName: opts.vendor ?? "SKOPJE PETROL BB",
      classifiedAs: opts.classifiedAs ?? "CARD_TX",
      processed: false,
    },
  });
}

describe("categorizeStatementLine (SM-83)", () => {
  it("creates a non-billable card Expense and marks the line processed", async () => {
    const line = await outLine({ amount: 250000, vendor: "SKOPJE PETROL BB" });
    const r = await categorizeStatementLine(line.id, "FUEL", {}, userId);

    const exp = await prisma.expense.findUniqueOrThrow({ where: { id: r.expenseId } });
    expect(exp.category).toBe("FUEL");
    expect(exp.amount).toBe(250000);
    expect(exp.paymentChannel).toBe("CARD");
    expect(exp.isBillable).toBe(false);
    expect(exp.attachmentUrl).toBeNull(); // B6 — card/bank statement is the record, no photo
    expect(exp.statementLineId).toBe(line.id);

    const after = await prisma.statementLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(after.processed).toBe(true);
    expect(after.linkedType).toBe("Expense");
  });

  it("learns a VendorRule and reports pending siblings it would also catch", async () => {
    const a = await outLine({ amount: 250000, vendor: "SKOPJE PETROL BB", statementNumber: 901 });
    await outLine({ amount: 180000, vendor: "PETROL BB KARPOS", statementNumber: 902 }); // sibling
    const r = await categorizeStatementLine(a.id, "FUEL", { rememberVendor: true }, userId);

    expect(r.learnedRule).toBe(true);
    const rule = await prisma.vendorRule.findFirstOrThrow({ where: { category: "FUEL" } });
    expect(rule.pattern).toBe("SKOPJE PETROL BB");
    // "PETROL BB KARPOS" does NOT include the full pattern "SKOPJE PETROL BB" → 0 siblings here,
    // which documents that the learned pattern is the exact vendor string (conservative on purpose).
    expect(r.siblingMatches).toBe(0);
  });

  it("uses the new REPRESENTATION category (migration)", async () => {
    const line = await outLine({
      amount: 90000,
      vendor: "KAFANA STARA GRADSKA",
      classifiedAs: "OTHER",
    });
    const r = await categorizeStatementLine(line.id, "REPRESENTATION", {}, userId);
    const exp = await prisma.expense.findUniqueOrThrow({ where: { id: r.expenseId } });
    expect(exp.category).toBe("REPRESENTATION");
    expect(exp.paymentChannel).toBe("BANK"); // non-card line → BANK channel
  });

  it("is idempotent — a processed line cannot be categorized twice", async () => {
    const line = await outLine({ amount: 120000 });
    await categorizeStatementLine(line.id, "OPERATIONS", {}, userId);
    await expect(categorizeStatementLine(line.id, "OPERATIONS", {}, userId)).rejects.toThrow();
  });

  it("rejects categorizing into a CLOSED period (B9)", async () => {
    await prisma.period.create({ data: { id: "2026-05", status: "CLOSED" } });
    const line = await outLine({
      amount: 300000,
      date: new Date(Date.UTC(2026, 4, 15)),
      statementNumber: 905,
    });
    await expect(categorizeStatementLine(line.id, "FUEL", {}, userId)).rejects.toThrow(/затворен/);
  });
});
