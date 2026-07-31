import { beforeEach, describe, expect, it } from "vitest";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { calcHonorar, payoutHonorar } from "@/lib/workflows/w5";
import { runPayroll } from "@/lib/workflows/payroll";
import { collectCash } from "@/lib/workflows/w3";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient, createTalentContractor } from "./setup/factories";

/**
 * SM-110 — regression tests for the audit findings: new-scheme invoice-number uniqueness (C1),
 * double-ACTORS idempotency (B16), closed-period guards (B9), and the cash-channel guard (§2).
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function openPeriod(id: string, status: "OPEN" | "CLOSED" = "OPEN") {
  await prisma.period.upsert({ where: { id }, create: { id, status }, update: { status } });
}

/** A bare DRAFT invoice for an existing client/period (models a manually-added extra invoice). */
async function draftInvoice(clientId: string, period: string, total: number) {
  return prisma.charge.create({
    data: {
      clientId,
      kind: "INVOICE",
      period,
      issueDate: new Date(),
      dueDate: new Date(),
      status: "DRAFT",
      subtotal: total,
      vatAmount: 0,
      total,
    },
  });
}

describe("SM-110 audit fixes", () => {
  it("C1 — a 2nd invoice for the same client/month (2026-08 scheme) gets a distinct suffixed number", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await openPeriod("2026-08");
    await generateCharges("2026-08", userId, "INVOICE");
    const recurring = await prisma.charge.findFirstOrThrow({
      where: { clientId: c.id, period: "2026-08", status: "DRAFT" },
    });
    const first = await approveInvoice(recurring.id, userId);

    const extra = await draftInvoice(c.id, "2026-08", 500_000);
    const second = await approveInvoice(extra.id, userId);

    expect(first.invoiceNumber).toMatch(/^1-\d+\/8-2026$/);
    expect(second.invoiceNumber).toBe(`${first.invoiceNumber}-2`);
    expect(second.invoiceNumber).not.toBe(first.invoiceNumber);
  });

  it("B16/T14 — re-running payout never creates a second set of ACTORS expenses", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    const contractor = await createTalentContractor();
    const paymentId = await calcHonorar(
      {
        contractorId: contractor.id,
        period: "2026-07",
        grossAmount: 1_000_000,
        allocations: [{ clientId: client.id, amount: 1_000_000, billable: true }],
      },
      userId,
    );
    await payoutHonorar({ paymentId, channel: "BANK" }, userId);
    await payoutHonorar({ paymentId, channel: "BANK" }, userId); // idempotent — no-op

    const actors = await prisma.expense.count({
      where: { category: "ACTORS", contractorPaymentId: paymentId },
    });
    expect(actors).toBe(1);
  });

  it("B9 — payroll into a CLOSED period is rejected", async () => {
    await prisma.employee.create({ data: { name: "Вработен", grossSalary: 3_000_000 } });
    await openPeriod("2026-06", "CLOSED");
    await expect(runPayroll("2026-06", userId)).rejects.toThrow();
  });

  it("§2 — cash collection against an INVOICE client is rejected", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await openPeriod("2026-07");
    await generateCharges("2026-07", userId, "INVOICE");
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: c.id } });
    await expect(
      collectCash(
        { clientId: c.id, chargeId: charge.id, amount: 100_000, fiscalNumber: "F-1" },
        userId,
      ),
    ).rejects.toThrow();
  });
});
