import { beforeEach, describe, expect, it } from "vitest";
import { bulkCategorizeLines } from "@/lib/workflows/w2";
import { prisma, resetDb } from "./setup/db";

/**
 * SM-99 phase C — bulk-categorize a merchant/account group of outgoing lines in one action, learning
 * a single VendorRule so future imports auto-categorize the same group.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function outLine(amount: number, hash: string, desc: string, classifiedAs = "CARD_TX") {
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: 800 + amount,
      statementDate: new Date(Date.UTC(2026, 6, 12)),
      source: "MANUAL_UPLOAD",
      fileRef: "local:x.pdf",
      openingBalance: 0,
      totalDebit: amount,
      totalCredit: 0,
      closingBalance: 0,
      orderCount: 1,
      status: "PARSED",
    },
  });
  return prisma.statementLine.create({
    data: {
      importId: imp.id,
      lineHash: hash,
      date: new Date(Date.UTC(2026, 6, 12)),
      amount,
      direction: "OUT",
      description: desc,
      classifiedAs,
      processed: false,
    },
  });
}

describe("bulk categorize (SM-99 phase C)", () => {
  it("categorizes a whole group as one category and learns a single rule", async () => {
    const a = await outLine(1_999, "bp:1", "SKOPJE BP LISICE 053 10012500");
    const b = await outLine(3_050, "bp:2", "SKOPJE BP LISICE 053 10012500");
    const c = await outLine(1_001, "bp:3", "SKOPJE BP LISICE 006 10012500");

    const res = await bulkCategorizeLines([a.id, b.id, c.id], "FUEL", "BP LISICE", userId);

    expect(res.categorized).toBe(3);
    expect(res.learnedRule).toBe(true);
    expect(await prisma.expense.count({ where: { category: "FUEL" } })).toBe(3);
    for (const l of [a, b, c]) {
      const after = await prisma.statementLine.findUniqueOrThrow({ where: { id: l.id } });
      expect(after.processed).toBe(true);
      expect(after.linkedType).toBe("Expense");
    }
    const rules = await prisma.vendorRule.findMany({ where: { pattern: "BP LISICE" } });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.category).toBe("FUEL");
  });

  it("skips already-processed lines and does not double-book", async () => {
    const a = await outLine(500, "s:1", "SKOPJE KOBRA-T");
    await bulkCategorizeLines([a.id], "OPERATIONS", null, userId);
    const res = await bulkCategorizeLines([a.id], "OPERATIONS", null, userId); // re-run
    expect(res.categorized).toBe(0);
    expect(await prisma.expense.count()).toBe(1);
  });
});
