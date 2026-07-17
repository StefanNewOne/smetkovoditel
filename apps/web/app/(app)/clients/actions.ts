"use server";

import { revalidatePath } from "next/cache";
import { BillingMode, LineType, prisma } from "@smetko/db";
import {
  type CreateClientInput,
  type ChangePackageInput,
  zChangePackage,
  zCreateClient,
} from "@smetko/shared";
import { currentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

/** Create a client + its first (versioned) package + optional Meta/Actors extras (SM-10). */
export async function createClient(input: CreateClientInput): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };

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
  const user = await currentUser();
  if (!user) return { ok: false, error: "Не сте најавени." };

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
