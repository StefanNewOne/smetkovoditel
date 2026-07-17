"use server";

import { revalidatePath } from "next/cache";
import { type CreateEmployeeInput, zCreateEmployee } from "@smetko/shared";
import { requireWriter } from "@/lib/rbac";
import { createEmployee, runPayroll } from "@/lib/workflows/payroll";

export type Result = { ok: true } | { ok: false; error: string };

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
