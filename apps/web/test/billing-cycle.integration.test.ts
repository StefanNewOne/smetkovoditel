import { beforeEach, describe, expect, it } from "vitest";
import { generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/** SM-118 — the billing cycle is a client-level attribute that W1 reads; changing it is a data edit. */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});
async function openPeriod(id: string) {
  await prisma.period.upsert({ where: { id }, create: { id, status: "OPEN" }, update: {} });
}

describe("SM-118 client billing cycle drives W1", () => {
  it("a MONTHLY client is billed every month", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    for (const p of ["2026-06", "2026-07"]) {
      await openPeriod(p);
      await generateCharges(p, userId);
    }
    expect(await prisma.charge.count({ where: { clientId: c.id } })).toBe(2);
  });

  it("switching a client to QUARTERLY skips non-boundary months", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    // Cycle is on the client — a plain data change (what the profile toggle does).
    await prisma.client.update({ where: { id: c.id }, data: { billingCycle: "QUARTERLY" } });

    // Anchor = package effectiveFrom (2026-01-01) → boundaries Jan/Apr/Jul/Oct.
    await openPeriod("2026-08"); // 7 months since Jan → not a boundary
    await generateCharges("2026-08", userId);
    expect(await prisma.charge.count({ where: { clientId: c.id } })).toBe(0);

    await openPeriod("2026-07"); // 6 months since Jan → boundary
    await generateCharges("2026-07", userId);
    expect(await prisma.charge.count({ where: { clientId: c.id } })).toBe(1);
  });
});
