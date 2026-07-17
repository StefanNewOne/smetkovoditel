import "server-only";
import { type CreateEmployeeInput } from "@smetko/shared";
import { type Prisma, prisma } from "@smetko/db";
import { writeAudit } from "@/lib/audit";

/** Register a salaried employee. */
export async function createEmployee(input: CreateEmployeeInput, userId: string) {
  const e = await prisma.employee.create({
    data: { name: input.name, grossSalary: input.grossSalary, position: input.position || null },
  });
  await writeAudit(prisma, {
    entity: "Employee",
    entityId: e.id,
    action: "create",
    diff: { name: input.name, grossSalary: input.grossSalary },
    userId,
  });
  return e.id;
}

/**
 * Run payroll for a period (Master Plan §W5 плати). Records one PayrollRun with a line per
 * employee (gross). One run per period. The accountant computes contributions/PIT; the system
 * records that salaries for the period were run/paid (feeds the W8 close check + W9 package).
 */
export async function runPayroll(period: string, userId: string) {
  const existing = await prisma.payrollRun.findFirst({ where: { period } });
  if (existing) throw new Error(`Плата за ${period} веќе постои.`);

  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" } });
  if (employees.length === 0) throw new Error("Нема регистрирани вработени.");

  const items = employees.map((e) => ({ employeeId: e.id, name: e.name, gross: e.grossSalary }));
  const totalGross = items.reduce((s, i) => s + i.gross, 0);

  const run = await prisma.payrollRun.create({
    data: { period, items: items as unknown as Prisma.InputJsonValue, status: "PAID" },
  });
  await writeAudit(prisma, {
    entity: "PayrollRun",
    entityId: run.id,
    action: "run",
    diff: { period, employees: items.length, totalGross },
    userId,
  });
  return run.id;
}
