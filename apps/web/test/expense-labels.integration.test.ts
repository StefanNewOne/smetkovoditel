import { beforeEach, describe, expect, it } from "vitest";
import { getExpenses, getExpenseTotals } from "@/lib/expenses";
import { prisma, resetDb } from "./setup/db";

/**
 * Regression: the Трошоци screen resolves each category's display label from the Category table
 * (the authoritative, editable source), NOT a static map. Custom categories (created in Settings)
 * carry an auto-generated key like `CAT_05D54F19` that no static map knows — they must still render
 * their Macedonian label, never the raw key.
 */
beforeEach(async () => {
  await resetDb();
});

async function customExpense(key: string, label: string, amount: number) {
  await prisma.category.create({
    data: { key, label, system: false, kind: "OPERATING", recurring: false, sortOrder: 99 },
  });
  await prisma.expense.create({
    data: {
      category: key,
      vendor: "Тест продавач",
      amount,
      date: new Date(Date.UTC(2026, 6, 12)),
      paymentChannel: "CARD",
      isBillable: false,
    },
  });
}

describe("expense category labels (custom categories)", () => {
  it("getExpenses renders the DB label for a custom category, not the CAT_ key", async () => {
    await customExpense("CAT_05D54F19", "Маркети", 12_300);
    const rows = await getExpenses();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.categoryLabel).toBe("Маркети");
    expect(rows[0]!.categoryLabel).not.toMatch(/^CAT_/);
  });

  it("getExpenseTotals renders the DB label for a custom category, not the CAT_ key", async () => {
    await customExpense("CAT_BA5EFDBE", "Матерјални Трошоци", 5_000);
    const totals = await getExpenseTotals();
    const row = totals.find((t) => t.label === "Матерјални Трошоци");
    expect(row).toBeDefined();
    expect(totals.some((t) => /^CAT_/.test(t.label))).toBe(false);
  });
});
