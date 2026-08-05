import { beforeEach, describe, expect, it } from "vitest";
import { generateCharges } from "@/lib/workflows/w1";
import { getChargesByClient } from "@/lib/charges";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/** SM-117 — the charges screen's client filter: all of one client's charges for the year. */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});
async function openPeriod(id: string) {
  await prisma.period.upsert({ where: { id }, create: { id, status: "OPEN" }, update: {} });
}

describe("SM-117 charges by client (year)", () => {
  it("returns only that client's charges across the year, newest month first", async () => {
    const a = await createInvoiceClient({ userId, monthlyAmount: 3_000_000, name: "Клиент А" });
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "Клиент Б" });
    for (const p of ["2026-01", "2026-03"]) {
      await openPeriod(p);
      await generateCharges(p, userId, "INVOICE");
    }

    const rows = await getChargesByClient(a.id, "2026");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.clientName === "Клиент А")).toBe(true);
    expect(rows.map((r) => r.period)).toEqual(["2026-03", "2026-01"]); // desc
  });
});
