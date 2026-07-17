import "server-only";
import { currentPeriod, formatMKD, invoiceNumber } from "@smetko/shared";
import { prisma } from "@smetko/db";

export interface EmployeeRow {
  id: string;
  name: string;
  position: string | null;
  gross: string;
}
export interface PayrollRunRow {
  id: string;
  period: string;
  employees: number;
  totalGross: string;
  status: string;
}

/** Settings data: payroll (employees + runs) + read-only config overview (§9.8). */
export async function getSettingsData() {
  const period = currentPeriod();
  const [employees, runs, vendorRules, bank, nextSeq] = await Promise.all([
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
    prisma.payrollRun.findMany({ orderBy: { period: "desc" }, take: 12 }),
    prisma.vendorRule.count(),
    prisma.bankAccount.findFirst(),
    prisma.charge.aggregate({
      where: { period, seqInMonth: { not: null } },
      _max: { seqInMonth: true },
    }),
  ]);

  const employeeRows: EmployeeRow[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    gross: formatMKD(e.grossSalary, { decimals: 0 }),
  }));

  const runRows: PayrollRunRow[] = runs.map((r) => {
    const items = (r.items as { gross: number }[]) ?? [];
    return {
      id: r.id,
      period: r.period,
      employees: items.length,
      totalGross: formatMKD(
        items.reduce((s, i) => s + i.gross, 0),
        { decimals: 0 },
      ),
      status: r.status,
    };
  });

  return {
    period,
    employees: employeeRows,
    runs: runRows,
    config: {
      vat: "18% (B11)",
      vendorRules,
      bank: bank ? `${bank.bank} · ${bank.accountNumber}` : "—",
      nextNumber: invoiceNumber((nextSeq._max.seqInMonth ?? 0) + 1, period),
    },
  };
}
