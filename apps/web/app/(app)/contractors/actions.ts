"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@smetko/db";
import {
  type CalcHonorarInput,
  type CreateContractorInput,
  type PayoutInput,
  zCalcHonorar,
  zCreateContractor,
  zPayout,
} from "@smetko/shared";
import { currentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { calcHonorar, payoutHonorar } from "@/lib/workflows/w5";

export type Result = { ok: true } | { ok: false; error: string };

export async function createContractorAction(input: CreateContractorInput): Promise<Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  const parsed = zCreateContractor.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  const d = parsed.data;

  const created = await prisma.contractor.create({
    data: {
      name: d.name,
      idNumber: d.idNumber || null,
      contractType: d.contractType,
      taxMode: d.taxMode,
      isTalent: d.isTalent,
      defaultRate: d.defaultRate ?? null,
    },
  });
  await writeAudit(prisma, {
    entity: "Contractor",
    entityId: created.id,
    action: "create",
    diff: { name: d.name, taxMode: d.taxMode, isTalent: d.isTalent },
    userId: user.id,
  });
  revalidatePath("/contractors");
  return { ok: true };
}

export async function calcHonorarAction(input: CalcHonorarInput): Promise<Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  const parsed = zCalcHonorar.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  try {
    await calcHonorar(parsed.data, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Пресметката не успеа." };
  }
  revalidatePath("/contractors");
  return { ok: true };
}

export async function payoutAction(input: PayoutInput): Promise<Result> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };
  const parsed = zPayout.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  try {
    await payoutHonorar(parsed.data, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Исплатата не успеа." };
  }
  revalidatePath("/contractors");
  revalidatePath("/cash");
  return { ok: true };
}
