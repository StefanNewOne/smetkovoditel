"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@smetko/db";
import { type CreateEmployeeInput, zCreateEmployee } from "@smetko/shared";
import { categoryExists } from "@/lib/expenses";
import { requireWriter } from "@/lib/rbac";
import { createEmployee, runPayroll } from "@/lib/workflows/payroll";

export type Result = { ok: true } | { ok: false; error: string };

/** SM-91 — add a vendor→category rule (pattern matched against the card merchant on import, §4.2). */
export async function addVendorRuleAction(
  pattern: string,
  category: string,
  vendor: string,
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const p = pattern.trim().toUpperCase();
  if (p.length < 2) return { ok: false, error: "Шаблонот е прекратко." };
  if (!(await categoryExists(category))) return { ok: false, error: "Непозната категорија." };
  const existing = await prisma.vendorRule.findFirst({ where: { pattern: p, category } });
  if (existing) return { ok: false, error: "Правилото веќе постои." };
  await prisma.vendorRule.create({
    data: { pattern: p, category, vendor: vendor.trim() || null },
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** SM-91 — delete a vendor rule. */
export async function removeVendorRuleAction(id: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  await prisma.vendorRule.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function createEmployeeAction(input: CreateEmployeeInput): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;
  const parsed = zCreateEmployee.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  await createEmployee(parsed.data, user.id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function runPayrollAction(period: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;
  try {
    await runPayroll(period, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Платата не успеа." };
  }
  revalidatePath("/settings");
  return { ok: true };
}
