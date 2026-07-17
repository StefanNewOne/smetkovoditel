"use server";

import { revalidatePath } from "next/cache";
import { type CreateEmployeeInput, zCreateEmployee } from "@smetko/shared";
import { currentUser } from "@/lib/auth";
import { createEmployee, runPayroll } from "@/lib/workflows/payroll";

export type Result = { ok: true } | { ok: false; error: string };

export async function createEmployeeAction(input: CreateEmployeeInput): Promise<Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  const parsed = zCreateEmployee.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  await createEmployee(parsed.data, user.id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function runPayrollAction(period: string): Promise<Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  try {
    await runPayroll(period, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Платата не успеа." };
  }
  revalidatePath("/settings");
  return { ok: true };
}
