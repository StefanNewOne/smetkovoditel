import { z } from "zod";

/** Payment channel — mirrors Prisma enum PaymentChannel (kept here so shared/UI don't import Prisma). */
export const zPaymentChannel = z.enum(["INVOICE", "CASH"]);
export type PaymentChannelValue = z.infer<typeof zPaymentChannel>;

const zAdAccountInput = z.object({
  metaAccountId: z.string().trim().min(1, "Внеси Meta Account ID"),
  name: z.string().trim().min(1, "Внеси име на акаунтот"),
});

/**
 * New-client onboarding (wizard). Amounts are integer дени (parsed on the client via
 * parseDenari). B17: INVOICE requires ЕДБ (taxId).
 */
export const zCreateClient = z
  .object({
    name: z.string().trim().min(1, "Внеси име на клиент"),
    paymentChannel: zPaymentChannel,
    taxId: z.string().trim().optional(),
    address: z.string().trim().optional(),
    contactEmail: z.union([z.string().email("Невалидна е-пошта"), z.literal("")]).optional(),
    contactPhone: z.string().trim().optional(),
    paymentTermDays: z.number().int().min(0).max(120).default(15),
    monthlyAmount: z.number().int().min(0), // ОСНОВИЦА во дени
    packageDescription: z.string().trim().optional(),
    metaAds: z.boolean().default(false),
    actors: z.boolean().default(false),
    adAccounts: z.array(zAdAccountInput).default([]),
  })
  .refine((d) => d.paymentChannel !== "INVOICE" || !!d.taxId?.length, {
    message: "ЕДБ е задолжителен за фактура (B17)",
    path: ["taxId"],
  });

export type CreateClientInput = z.infer<typeof zCreateClient>;

/** W3 cash collection: a cash receipt against an open charge (D6 fiscal number required). */
export const zCollectCash = z.object({
  clientId: z.string().min(1),
  chargeId: z.string().min(1),
  amount: z.number().int().positive(), // дени received in cash
  fiscalNumber: z.string().trim().min(1, "Внеси број од фискалниот уред (D6)"),
});
export type CollectCashInput = z.infer<typeof zCollectCash>;

/** A new versioned service-package amount (B4 — never edit, always a new version). */
export const zChangePackage = z.object({
  clientId: z.string().min(1),
  monthlyAmount: z.number().int().min(0),
  description: z.string().trim().optional(),
  effectiveFrom: z.string().min(1), // ISO date; the first of a month typically
});
export type ChangePackageInput = z.infer<typeof zChangePackage>;
