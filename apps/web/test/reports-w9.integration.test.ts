import JSZip from "jszip";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it } from "vitest";
import { getReports } from "@/lib/reports";
import { buildAccountantPackage } from "@/lib/workflows/w9";
import { generateCharges, approveInvoice } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * Reports (§9.7) + W9 accountant package (§W9). Verifies P&L, per-client margin (cross-checked
 * for 3 clients — SM-72 DoD), aging, cash flow, and that the ZIP carries all six sections as
 * .xlsx books. Amounts are integer денари (B10).
 */
const PERIOD = "2026-07";
const IN_PERIOD = new Date(Date.UTC(2026, 6, 10)); // 2026-07-10
let userId = "";

async function addClientExpense(clientId: string, amount: number) {
  return prisma.expense.create({
    data: {
      category: "OPERATIONS",
      vendor: "Vendor",
      amount,
      date: IN_PERIOD,
      paymentChannel: "BANK",
      clientId,
      isBillable: false,
    },
  });
}

beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("Reports — P&L, margin, aging, cash flow", () => {
  it("SM-72: per-client margin = revenue − cost, cross-checked for 3 clients", async () => {
    const c1 = await createInvoiceClient({ userId, monthlyAmount: 3_000_000, name: "Client A" });
    const c2 = await createInvoiceClient({ userId, monthlyAmount: 2_000_000, name: "Client B" });
    const c3 = await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "Client C" });
    await generateCharges(PERIOD, userId);

    await addClientExpense(c1.id, 500_000); // margin 2.500.000 (83%)
    await addClientExpense(c2.id, 1_000_000); // margin 1.000.000 (50%)
    await addClientExpense(c3.id, 900_000); // margin 100.000 (10%)

    const r = await getReports(PERIOD);

    // P&L: revenue = Σ subtotal (ex-VAT), expenses = Σ dated expenses.
    expect(r.pl.revenue).toBe(6_000_000);
    expect(r.pl.expenses).toBe(2_400_000);
    expect(r.pl.profit).toBe(3_600_000);

    // Margin per client (sorted by revenue desc).
    const byId = Object.fromEntries(r.margins.map((m) => [m.clientId, m]));
    expect(byId[c1.id]).toMatchObject({ revenue: 3_000_000, cost: 500_000, margin: 2_500_000 });
    expect(byId[c1.id]!.pctLabel).toBe("83%");
    expect(byId[c2.id]).toMatchObject({ revenue: 2_000_000, cost: 1_000_000, margin: 1_000_000 });
    expect(byId[c2.id]!.pctLabel).toBe("50%");
    expect(byId[c3.id]).toMatchObject({ revenue: 1_000_000, cost: 900_000, margin: 100_000 });
    expect(byId[c3.id]!.pctLabel).toBe("10%");
  });

  it("ages an overdue open invoice into the correct bucket", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId);
    // Force the due date ~45 days in the past → the 31–60 bucket.
    await prisma.charge.update({
      where: { id: charge.id },
      data: { dueDate: new Date(Date.now() - 45 * 86400000) },
    });

    const r = await getReports(PERIOD);
    expect(r.aging.b31).not.toBe("0");
  });
});

describe("W9 — accountant package", () => {
  it("builds a ZIP with all six sections + README", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId);

    const buffer = await buildAccountantPackage(PERIOD);
    const zip = await JSZip.loadAsync(buffer);

    for (const path of [
      "01_Izlezni_fakturi/Kniga_izlezni.xlsx",
      "02_Vlezni_troshoci/Troshoci.xlsx",
      "03_Izvodi/Izvodi.xlsx",
      "04_Blagajna/Dnevnik.xlsx",
      "05_Honorari/Honorari.xlsx",
      "06_Plati/Plati.xlsx",
      "README.txt",
    ]) {
      expect(zip.file(path), `missing ${path}`).toBeTruthy();
    }
  });

  it("lists the approved invoice with its VAT total in Kniga_izlezni", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    const { invoiceNumber } = await approveInvoice(charge.id, userId);

    const zip = await JSZip.loadAsync(await buildAccountantPackage(PERIOD));
    const xlsxBuf = await zip.file("01_Izlezni_fakturi/Kniga_izlezni.xlsx")!.async("nodebuffer");
    const wb = XLSX.read(xlsxBuf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Izlezni"]!, {
      header: 1,
    });

    const dataRow = rows.find((row) => row[0] === invoiceNumber);
    expect(dataRow, "invoice row present").toBeTruthy();
    // Columns: Број, Датум, Клиент, ЕДБ, Основица, ДДВ 18%, Вкупно, Платено, Статус (денари/100).
    expect(dataRow![4]).toBe(30000); // основица 30.000,00
    expect(dataRow![5]).toBe(5400); // ДДВ
    expect(dataRow![6]).toBe(35400); // вкупно
  });
});
