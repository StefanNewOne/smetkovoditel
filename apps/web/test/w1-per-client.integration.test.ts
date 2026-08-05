import { beforeEach, describe, expect, it } from "vitest";
import { generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/** SM-119 — ИЗВРШИ (по клиент): generateCharges scoped to a single client. */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("SM-119 per-client W1 run", () => {
  it("generates a charge only for the given client", async () => {
    const a = await createInvoiceClient({ userId, monthlyAmount: 3_000_000, name: "А" });
    const b = await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "Б" });
    await prisma.period.upsert({
      where: { id: "2026-07" },
      create: { id: "2026-07", status: "OPEN" },
      update: {},
    });

    const res = await generateCharges("2026-07", userId, undefined, a.id);
    expect(res.created).toBe(1);

    expect(await prisma.charge.count({ where: { clientId: a.id } })).toBe(1);
    expect(await prisma.charge.count({ where: { clientId: b.id } })).toBe(0);
  });
});
