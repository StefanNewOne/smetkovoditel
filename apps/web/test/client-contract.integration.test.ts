import { beforeEach, describe, expect, it } from "vitest";
import { getClient, getClients } from "@/lib/clients";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * SM-112 — cooperation contract per client. The list exposes hasContract for the indicator, and the
 * profile carries the stored reference.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("SM-112 client contract", () => {
  it("getClients exposes hasContract per row", async () => {
    const withDoc = await createInvoiceClient({
      userId,
      monthlyAmount: 3_000_000,
      name: "Со договор",
    });
    await createInvoiceClient({ userId, monthlyAmount: 3_000_000, name: "Без договор" });
    await prisma.client.update({
      where: { id: withDoc.id },
      data: {
        contractUrl: "/api/attachments/abc.pdf",
        contractName: "dogovor.pdf",
        contractUploadedAt: new Date(),
      },
    });

    const rows = await getClients();
    const a = rows.find((r) => r.id === withDoc.id);
    const b = rows.find((r) => r.name === "Без договор");
    expect(a?.hasContract).toBe(true);
    expect(b?.hasContract).toBe(false);
  });

  it("getClient carries the stored contract reference", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await prisma.client.update({
      where: { id: c.id },
      data: { contractUrl: "/api/attachments/x.pdf", contractName: "x.pdf" },
    });
    const full = await getClient(c.id);
    expect(full?.contractUrl).toBe("/api/attachments/x.pdf");
    expect(full?.contractName).toBe("x.pdf");
  });
});
