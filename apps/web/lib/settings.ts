import "server-only";
import { currentPeriod, formatMKD, invoiceNumber } from "@smetko/shared";
import { prisma } from "@smetko/db";
import { CATEGORY_LABEL } from "@/lib/expenses";

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
  const [employees, runs, vendorRules, bank, nextSeq, categoriesRaw] = await Promise.all([
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
    prisma.payrollRun.findMany({ orderBy: { period: "desc" }, take: 12 }),
    prisma.vendorRule.findMany({ orderBy: [{ hits: "desc" }, { pattern: "asc" }] }),
    prisma.bankAccount.findFirst(),
    prisma.charge.aggregate({
      where: { period, seqInMonth: { not: null } },
      _max: { seqInMonth: true },
    }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { vendorRules: true } } },
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

  // Labels come from the Category table now (custom categories aren't in the static CATEGORY_LABEL).
  const labelByKey = new Map(categoriesRaw.map((c) => [c.key, c.label]));
  const vendorRuleRows = vendorRules.map((v) => ({
    id: v.id,
    pattern: v.pattern,
    category: v.category as string,
    categoryLabel: labelByKey.get(v.category) ?? CATEGORY_LABEL[v.category] ?? v.category,
    vendor: v.vendor,
    hits: v.hits,
  }));

  const categories: CategoryAdminRow[] = categoriesRaw.map((c) => ({
    key: c.key,
    label: c.label,
    system: c.system,
    recurring: c.recurring,
    kind: c.kind,
    active: c.active,
    vendorCount: c._count.vendorRules,
  }));

  return {
    period,
    employees: employeeRows,
    runs: runRows,
    vendorRules: vendorRuleRows,
    categories,
    config: {
      vat: "18% (B11)",
      vendorRules: vendorRules.length,
      bank: bank ? `${bank.bank} · ${bank.accountNumber}` : "—",
      nextNumber: invoiceNumber((nextSeq._max.seqInMonth ?? 0) + 1, period),
    },
  };
}

export interface CategoryAdminRow {
  key: string;
  label: string;
  system: boolean;
  recurring: boolean;
  kind: string;
  active: boolean;
  vendorCount: number;
}

export interface VendorRuleRow {
  id: string;
  pattern: string;
  category: string;
  categoryLabel: string;
  vendor: string | null;
  hits: number;
}
