"use server";

import { revalidatePath } from "next/cache";
import { BillingMode, ClientStatus, LineType, prisma } from "@smetko/db";
import {
  type CreateClientInput,
  type ChangePackageInput,
  zChangePackage,
  zCreateClient,
} from "@smetko/shared";
import { requireWriter } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import {
  type DeletionImpact,
  deleteClient,
  getDeletionImpact,
  setClientStatus,
} from "@/lib/workflows/client-admin";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

/** SM-86 — impact preview for the delete confirmation. */
export async function deletionImpactAction(
  clientId: string,
): Promise<{ ok: true; impact: DeletionImpact } | { ok: false; error: string }> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const impact = await getDeletionImpact(clientId);
  if (!impact) return { ok: false, error: "Клиентот не постои." };
  return { ok: true, impact };
}

/** SM-86 — deactivate / reactivate (non-ACTIVE clients are skipped by W1). */
export async function setClientStatusAction(
  clientId: string,
  status: ClientStatus,
): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    await setClientStatus(clientId, status, auth.user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не успеа." };
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return { ok: true, id: clientId };
}

/** SM-86 — hard-delete a client and all its records (frees the bank statement lines). */
export async function deleteClientAction(clientId: string): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    await deleteClient(clientId, auth.user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Бришењето не успеа." };
  }
  revalidatePath("/clients");
  return { ok: true, id: clientId };
}

/** Create a client + its first (versioned) package + optional Meta/Actors extras (SM-10). */
export async function createClient(input: CreateClientInput): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;

  const parsed = zCreateClient.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  }
  const d = parsed.data;

  const id = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        name: d.name,
        taxId: d.taxId || null,
        address: d.address || null,
        contactEmail: d.contactEmail || null,
        contactPhone: d.contactPhone || null,
        paymentChannel: d.paymentChannel,
        vatApplicable: d.paymentChannel === "INVOICE",
        paymentTermDays: d.paymentTermDays,
      },
    });

    // First versioned package (B4). effectiveTo = null → current.
    await tx.servicePackage.create({
      data: {
        clientId: client.id,
        monthlyAmount: d.monthlyAmount,
        description: d.packageDescription || null,
        effectiveFrom: new Date(),
        createdById: user.id,
      },
    });

    // Extras — pass-through templates (D2). META_ADS/ACTORS are always PASSTHROUGH_ACTUAL.
    if (d.metaAds) {
      await tx.recurringLineTemplate.create({
        data: {
          clientId: client.id,
          type: LineType.META_ADS,
          billingMode: BillingMode.PASSTHROUGH_ACTUAL,
        },
      });
    }
    if (d.actors) {
      await tx.recurringLineTemplate.create({
        data: {
          clientId: client.id,
          type: LineType.ACTORS,
          billingMode: BillingMode.PASSTHROUGH_ACTUAL,
        },
      });
    }
    for (const acc of d.adAccounts) {
      await tx.adAccount.create({
        data: { metaAccountId: acc.metaAccountId, name: acc.name, clientId: client.id },
      });
    }

    await writeAudit(tx, {
      entity: "Client",
      entityId: client.id,
      action: "create",
      diff: { name: d.name, paymentChannel: d.paymentChannel, monthlyAmount: d.monthlyAmount },
      userId: user.id,
    });

    return client.id;
  });

  revalidatePath("/clients");
  return { ok: true, id };
}

/** Change a client's monthly package = close the current version and open a new one (B4). */
export async function changePackage(input: ChangePackageInput): Promise<ActionResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const user = auth.user;

  const parsed = zChangePackage.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Невалидни податоци." };
  }
  const d = parsed.data;
  const effectiveFrom = new Date(d.effectiveFrom);

  await prisma.$transaction(async (tx) => {
    const current = await tx.servicePackage.findFirst({
      where: { clientId: d.clientId, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });
    if (current) {
      await tx.servicePackage.update({
        where: { id: current.id },
        data: { effectiveTo: effectiveFrom },
      });
    }
    const created = await tx.servicePackage.create({
      data: {
        clientId: d.clientId,
        monthlyAmount: d.monthlyAmount,
        description: d.description || null,
        effectiveFrom,
        createdById: user.id,
      },
    });
    await writeAudit(tx, {
      entity: "ServicePackage",
      entityId: created.id,
      action: "version",
      diff: { clientId: d.clientId, monthlyAmount: d.monthlyAmount, from: d.effectiveFrom },
      userId: user.id,
    });
  });

  revalidatePath(`/clients/${d.clientId}`);
  return { ok: true, id: d.clientId };
}
