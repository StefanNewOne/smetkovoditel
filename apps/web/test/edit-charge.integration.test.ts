import { beforeEach, describe, expect, it } from "vitest";
import { approveInvoice, editChargeLines, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/** SM-116 — editing a DRAFT charge's lines before approval (price change / extra items). */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});
async function openPeriod(id: string) {
  await prisma.period.upsert({ where: { id }, create: { id, status: "OPEN" }, update: {} });
}

describe("SM-116 edit DRAFT charge", () => {
  it("replaces the editable lines and recomputes subtotal/VAT/total", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await openPeriod("2026-07");
    await generateCharges("2026-07", userId, "INVOICE");
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: c.id } });

    await editChargeLines(
      charge.id,
      [
        { description: "Маркетинг Услуги", amount: 5_000_000 },
        { description: "Дизајн", amount: 1_000_000 },
      ],
      userId,
    );

    const updated = await prisma.charge.findUniqueOrThrow({
      where: { id: charge.id },
      include: { lines: true },
    });
    expect(updated.subtotal).toBe(6_000_000);
    expect(updated.vatAmount).toBe(Math.round(5_000_000 * 0.18) + Math.round(1_000_000 * 0.18));
    expect(updated.total).toBe(updated.subtotal + updated.vatAmount);
    const editable = updated.lines.filter((l) => l.type === "SERVICE" || l.type === "OTHER");
    expect(editable).toHaveLength(2);
    expect(editable.find((l) => l.type === "SERVICE")?.amount).toBe(5_000_000);
  });

  it("rejects editing an approved (numbered) charge — corrections go via CREDIT_NOTE", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await openPeriod("2026-07");
    await generateCharges("2026-07", userId, "INVOICE");
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: c.id } });
    await approveInvoice(charge.id, userId);

    await expect(
      editChargeLines(charge.id, [{ description: "X", amount: 1_000 }], userId),
    ).rejects.toThrow();
  });
});
