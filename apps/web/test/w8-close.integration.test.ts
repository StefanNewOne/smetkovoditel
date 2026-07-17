import { beforeEach, describe, expect, it } from "vitest";
import { PeriodClosedError, assertPeriodOpen } from "@/lib/period-guard";
import { generateCharges } from "@/lib/workflows/w1";
import { closePeriod, getCloseBlockers } from "@/lib/workflows/w8";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * W8 month close + immutability (Master Plan §W8, B9). A period closes only when every blocker
 * is cleared; once CLOSED it is immutable — mutations are rejected at the service layer with a
 * typed PeriodClosedError (not a 500), corrections go through CREDIT_NOTE/сторно.
 */
const PERIOD = "2026-07";
let userId = "";

/** Record a zero-difference blagajna stocktake so that blocker is satisfied. */
async function recordZeroStocktake() {
  await prisma.auditLog.create({
    data: {
      entity: "Blagajna",
      entityId: PERIOD,
      action: "stocktake",
      diff: { difference: 0 },
      userId,
    },
  });
}

beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("W8 — close blockers", () => {
  it("lists the missing-stocktake blocker on an otherwise clean period", async () => {
    const blockers = await getCloseBlockers(PERIOD);
    expect(blockers.map((b) => b.key)).toContain("stocktake");
  });

  it("reports a DRAFT invoice as a blocker", async () => {
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    await generateCharges(PERIOD, userId); // leaves a DRAFT invoice
    const blockers = await getCloseBlockers(PERIOD);
    expect(blockers.find((b) => b.key === "drafts")?.count).toBe(1);
  });

  it("refuses to close while blockers remain", async () => {
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    await generateCharges(PERIOD, userId);
    const res = await closePeriod(PERIOD, userId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.blockers.length).toBeGreaterThan(0);
    const period = await prisma.period.findUniqueOrThrow({ where: { id: PERIOD } });
    expect(period.status).toBe("OPEN"); // unchanged
  });
});

describe("W8 — closing & immutability (B9)", () => {
  it("closes a clean period and marks it CLOSED", async () => {
    await recordZeroStocktake();
    expect(await getCloseBlockers(PERIOD)).toHaveLength(0);

    const res = await closePeriod(PERIOD, userId);
    expect(res.ok).toBe(true);
    const period = await prisma.period.findUniqueOrThrow({ where: { id: PERIOD } });
    expect(period.status).toBe("CLOSED");
    expect(period.closedById).toBe(userId);
  });

  it("rejects writes into a CLOSED period with a typed PeriodClosedError (B9)", async () => {
    await recordZeroStocktake();
    await closePeriod(PERIOD, userId);

    // Direct guard.
    await expect(assertPeriodOpen(prisma, PERIOD)).rejects.toBeInstanceOf(PeriodClosedError);

    // End-to-end: W1 on a closed period is rejected before it writes anything.
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    await expect(generateCharges(PERIOD, userId)).rejects.toBeInstanceOf(PeriodClosedError);
    expect(await prisma.charge.count()).toBe(0);
  });

  it("closing an already-CLOSED period is an idempotent no-op", async () => {
    await recordZeroStocktake();
    await closePeriod(PERIOD, userId);
    const res = await closePeriod(PERIOD, userId);
    expect(res.ok).toBe(true);
  });
});
