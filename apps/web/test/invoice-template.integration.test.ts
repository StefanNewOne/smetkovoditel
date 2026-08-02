import { beforeEach, describe, expect, it } from "vitest";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { getCompanyProfile } from "@/lib/company";
import { renderInvoicePdf } from "@/lib/pdf/render-invoice";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * SM-113 — legally-complete invoice template + company profile. The issuer identity is config
 * (falls back to the seeded defaults), the client's legal name/ЕДБ flow onto the invoice, and the
 * PDF renders to a non-empty buffer.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("SM-113 invoice template", () => {
  it("getCompanyProfile returns the issuer identity (defaults when unset)", async () => {
    const p = await getCompanyProfile();
    expect(p.name).toContain("АЛМА ДИЗАЈН");
    expect(p.taxId).toBe("4032023558371");
    expect(p.director).toBeTruthy();
  });

  it("a client's legal name + ЕДБ persist and the invoice PDF renders", async () => {
    const c = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await prisma.client.update({
      where: { id: c.id },
      data: { legalName: "ДТУ ТЕСТ 2014 ДОО", taxId: "4080000000001" },
    });

    await prisma.period.upsert({
      where: { id: "2026-08" },
      create: { id: "2026-08", status: "OPEN" },
      update: {},
    });
    await generateCharges("2026-08", userId, "INVOICE");
    const draft = await prisma.charge.findFirstOrThrow({
      where: { clientId: c.id, period: "2026-08" },
    });
    const { invoiceNumber } = await approveInvoice(draft.id, userId);
    expect(invoiceNumber).toBeTruthy();

    const pdf = await renderInvoicePdf(draft.id);
    expect(pdf).not.toBeNull();
    expect(pdf!.length).toBeGreaterThan(1000); // a real PDF, not empty
  });
});
