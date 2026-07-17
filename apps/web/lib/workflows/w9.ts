import "server-only";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { periodStart, shiftPeriod } from "@smetko/shared";
import { prisma } from "@smetko/db";

/** денари as a number for the accountant's spreadsheets (дени / 100). */
const den = (v: number) => v / 100;
const fmtDate = (d: Date) => new Date(d).toISOString().slice(0, 10);

function xlsx(sheetName: string, rows: (string | number | null)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * W9 — accountant package (Master Plan §W9): a ZIP with 6 sections as .xlsx books for the
 * period. Individual invoice PDFs are downloadable per invoice; this bundles the books.
 */
export async function buildAccountantPackage(period: string): Promise<Buffer> {
  const start = periodStart(period);
  const next = periodStart(shiftPeriod(period, 1));
  const zip = new JSZip();

  // 01 — Излезни фактури (Kniga na izlezni)
  const invoices = await prisma.charge.findMany({
    where: { period, kind: "INVOICE", invoiceNumber: { not: null } },
    include: { client: true },
    orderBy: { seqInMonth: "asc" },
  });
  zip.file(
    "01_Izlezni_fakturi/Kniga_izlezni.xlsx",
    xlsx("Izlezni", [
      ["Број", "Датум", "Клиент", "ЕДБ", "Основица", "ДДВ 18%", "Вкупно", "Платено", "Статус"],
      ...invoices.map((c) => [
        c.invoiceNumber,
        fmtDate(c.issueDate),
        c.client.name,
        c.client.taxId,
        den(c.subtotal),
        den(c.vatAmount),
        den(c.total),
        den(c.paidAmount),
        c.status,
      ]),
    ]),
  );

  // 02 — Влезни трошоци (со reverse-charge колона)
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: start, lt: next } },
    orderBy: { date: "asc" },
  });
  zip.file(
    "02_Vlezni_troshoci/Troshoci.xlsx",
    xlsx("Troshoci", [
      ["Датум", "Категорија", "Добавувач", "Износ", "ДДВ", "Канал", "Reverse-charge", "Билабилно"],
      ...expenses.map((e) => [
        fmtDate(e.date),
        e.category,
        e.vendor ?? "",
        den(e.amount),
        e.vatAmount != null ? den(e.vatAmount) : "",
        e.paymentChannel,
        e.category === "ADS" ? "ДА" : "",
        e.isBillable ? "ДА" : "",
      ]),
    ]),
  );

  // 03 — Изводи
  const imports = await prisma.bankStatementImport.findMany({
    where: { statementDate: { gte: start, lt: next } },
    orderBy: { statementNumber: "asc" },
  });
  zip.file(
    "03_Izvodi/Izvodi.xlsx",
    xlsx("Izvodi", [
      ["Извод бр.", "Датум", "Претходно", "Долгува", "Побарува", "Ново", "Налози", "Статус"],
      ...imports.map((s) => [
        s.statementNumber,
        fmtDate(s.statementDate),
        den(s.openingBalance),
        den(s.totalDebit),
        den(s.totalCredit),
        den(s.closingBalance),
        s.orderCount,
        s.status,
      ]),
    ]),
  );

  // 04 — Благајна (дневник)
  const cash = await prisma.cashLedgerEntry.findMany({
    where: { periodId: period },
    orderBy: { date: "asc" },
  });
  zip.file(
    "04_Blagajna/Dnevnik.xlsx",
    xlsx("Blagajna", [
      ["Датум", "Опис", "Документ", "Број", "Насока", "Износ", "Слика"],
      ...cash.map((c) => [
        fmtDate(c.date),
        c.description,
        c.documentType,
        c.documentNumber ?? "",
        c.direction,
        den(c.amount),
        c.attachmentUrl ? "ДА" : "",
      ]),
    ]),
  );

  // 05 — Хонорари
  const honorari = await prisma.contractorPayment.findMany({
    where: { period },
    include: { contractor: true },
  });
  zip.file(
    "05_Honorari/Honorari.xlsx",
    xlsx("Honorari", [
      ["Хонорарец", "Бруто", "Данок", "Нето", "Канал", "Статус"],
      ...honorari.map((h) => [
        h.contractor.name,
        den(h.grossAmount),
        den(h.taxAmount),
        den(h.netAmount),
        h.paymentChannel,
        h.status,
      ]),
    ]),
  );

  // 06 — Плати
  const payroll = await prisma.payrollRun.findMany({ where: { period } });
  const payrollRows: (string | number)[][] = [["Период", "Вработен", "Бруто", "Статус"]];
  for (const run of payroll) {
    for (const it of (run.items as { name: string; gross: number }[]) ?? []) {
      payrollRows.push([run.period, it.name, den(it.gross), run.status]);
    }
  }
  zip.file("06_Plati/Plati.xlsx", xlsx("Plati", payrollRows));

  zip.file(
    "README.txt",
    `Пакет за сметководител · период ${period}\nГенерирано од GoDigital Finance OS (W9).\nФактурните PDF-ови се преземаат поединечно од екранот Задолжувања.\n`,
  );

  return zip.generateAsync({ type: "nodebuffer" });
}
