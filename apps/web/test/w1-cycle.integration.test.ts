import { beforeEach, describe, expect, it } from "vitest";
import { generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";

/** SM-88 — quarterly packages bill once per 3-month cycle (anchored on the start date), and nothing
 *  is billed before the start date. */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

async function quarterlyClient(startDate: Date, amount: number) {
  const c = await prisma.client.create({
    data: {
      name: "Кварт",
      paymentChannel: "INVOICE",
      vatApplicable: true,
      startDate,
      billingCycle: "QUARTERLY", // SM-118: cycle is a client-level attribute, read by W1
    },
  });
  await prisma.servicePackage.create({
    data: { clientId: c.id, monthlyAmount: amount, effectiveFrom: startDate, createdById: userId },
  });
  return c;
}
async function openPeriod(id: string) {
  await prisma.period.upsert({ where: { id }, create: { id, status: "OPEN" }, update: {} });
}

describe("W1 quarterly billing (SM-88)", () => {
  it("bills a quarterly client only on the cycle boundary (every 3rd month)", async () => {
    const c = await quarterlyClient(new Date(Date.UTC(2026, 4, 1)), 6_150_000); // May 1
    for (const p of ["2026-05", "2026-06", "2026-07", "2026-08"]) await openPeriod(p);
    for (const p of ["2026-05", "2026-06", "2026-07", "2026-08"]) await generateCharges(p, userId);

    const periods = (
      await prisma.charge.findMany({
        where: { clientId: c.id },
        select: { period: true },
        orderBy: { period: "asc" },
      })
    ).map((x) => x.period);
    expect(periods).toEqual(["2026-05", "2026-08"]); // boundary months only
  });

  it("does not bill before the start date", async () => {
    const c = await quarterlyClient(new Date(Date.UTC(2026, 6, 1)), 6_150_000); // Jul 1
    await openPeriod("2026-05");
    await generateCharges("2026-05", userId); // before start
    expect(await prisma.charge.count({ where: { clientId: c.id } })).toBe(0);
  });
});
