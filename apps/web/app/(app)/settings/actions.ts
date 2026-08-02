"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@smetko/db";
import {
  type CompanyProfileInput,
  type CreateEmployeeInput,
  zCompanyProfile,
  zCreateEmployee,
} from "@smetko/shared";
import { writeAudit } from "@/lib/audit";
import { categoryExists } from "@/lib/expenses";
import { requireWriter } from "@/lib/rbac";
import { createEmployee, runPayroll } from "@/lib/workflows/payroll";

export type Result = { ok: true } | { ok: false; error: string };

/** SM-99 — add a custom expense category (kind OPERATING; owner-managed). */
export async function createCategoryAction(label: string, recurring: boolean): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const name = label.trim();
  if (name.length < 2) return { ok: false, error: "Внеси име на категорија." };
  const dup = await prisma.category.findFirst({ where: { label: name } });
  if (dup) return { ok: false, error: "Категорија со тоа име веќе постои." };
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const key = `CAT_${randomUUID().slice(0, 8).toUpperCase()}`;
  await prisma.category.create({
    data: {
      key,
      label: name,
      system: false,
      kind: "OPERATING",
      recurring,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
    },
  });
  await writeAudit(prisma, {
    entity: "Category",
    entityId: key,
    action: "category.created",
    diff: { label: name, recurring },
    userId: auth.user.id,
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** SM-99 — rename a category's label (allowed for system categories too; the key stays immutable). */
export async function renameCategoryAction(key: string, label: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const name = label.trim();
  if (name.length < 2) return { ok: false, error: "Внеси име на категорија." };
  await prisma.category.update({ where: { key }, data: { label: name } });
  await writeAudit(prisma, {
    entity: "Category",
    entityId: key,
    action: "category.renamed",
    diff: { label: name },
    userId: auth.user.id,
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** SM-100 — toggle whether a category is fixed recurring overhead (ТЕКОВНИ ТРОШОЦИ). */
export async function setCategoryRecurringAction(key: string, recurring: boolean): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  await prisma.category.update({ where: { key }, data: { recurring } });
  await writeAudit(prisma, {
    entity: "Category",
    entityId: key,
    action: "category.recurring",
    diff: { recurring },
    userId: auth.user.id,
  });
  revalidatePath("/settings");
  revalidatePath("/recurring");
  revalidatePath("/expenses");
  return { ok: true };
}

/** SM-99 — deactivate/reactivate a category. System categories are load-bearing and cannot be hidden. */
export async function setCategoryActiveAction(key: string, active: boolean): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const cat = await prisma.category.findUnique({ where: { key } });
  if (!cat) return { ok: false, error: "Категоријата не постои." };
  if (cat.system && !active)
    return { ok: false, error: "Системска категорија не може да се деактивира." };
  await prisma.category.update({ where: { key }, data: { active } });
  await writeAudit(prisma, {
    entity: "Category",
    entityId: key,
    action: "category.active",
    diff: { active },
    userId: auth.user.id,
  });
  revalidatePath("/settings");
  return { ok: true };
}

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

/** SM-113 — update the company profile (issuer identity for invoices). Singleton "default" row. */
export async function updateCompanyProfileAction(input: CompanyProfileInput): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const parsed = zCompanyProfile.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  const d = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.companyProfile.upsert({
      where: { id: "default" },
      update: { ...d, phone: d.phone || null, email: d.email || null },
      create: { id: "default", ...d, phone: d.phone || null, email: d.email || null },
    });
    await writeAudit(tx, {
      entity: "CompanyProfile",
      entityId: "default",
      action: "update",
      diff: { name: d.name, taxId: d.taxId, account: d.account },
      userId: auth.user.id,
    });
  });
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
