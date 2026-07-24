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
    monthlyAmount: z.number().int().min(0), // ОСНОВИЦА за еден циклус, во дени
    billingCycle: z.enum(["MONTHLY", "QUARTERLY"]).default("MONTHLY"), // SM-88
    startDate: z.string().trim().optional(), // "YYYY-MM-DD" — од кога клиентот е активен (SM-85)
    packageDescription: z.string().trim().optional(),
    giroAccounts: z.array(z.string().trim().min(1)).default([]), // жиро-сметки за спарување (SM-85)
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

// ── Contractors / honorari (W5) ──────────────────────────────────────────────
export const zContractType = z.enum(["DOGOVOR_NA_DELO", "CONTRACTOR_INVOICE"]);
export const zTaxMode = z.enum(["WITHHOLD_10", "NO_WITHHOLDING"]);
export const zPayoutChannel = z.enum(["CASH", "BANK"]);

/** Register a contractor. B8: NO_WITHHOLDING is only allowed with a CONTRACTOR_INVOICE. */
export const zCreateContractor = z
  .object({
    name: z.string().trim().min(1, "Внеси име"),
    idNumber: z.string().trim().optional(),
    contractType: zContractType,
    taxMode: zTaxMode,
    isTalent: z.boolean().default(false),
    defaultRate: z.number().int().min(0).optional(),
  })
  .refine((d) => d.taxMode !== "NO_WITHHOLDING" || d.contractType === "CONTRACTOR_INVOICE", {
    message: "NO_WITHHOLDING е дозволено само со фактура од изведувач (B8).",
    path: ["taxMode"],
  });
export type CreateContractorInput = z.infer<typeof zCreateContractor>;

export const zAllocation = z.object({
  clientId: z.string().min(1),
  amount: z.number().int().positive(), // дени (bruto share)
  billable: z.boolean(),
});

/** Calculate an honorar: gross + allocations that must sum to gross. */
export const zCalcHonorar = z
  .object({
    contractorId: z.string().min(1),
    period: z.string().regex(/^\d{4}-\d{2}$/),
    grossAmount: z.number().int().positive(),
    allocations: z.array(zAllocation).min(1, "Додади барем една алокација"),
  })
  .refine((d) => d.allocations.reduce((s, a) => s + a.amount, 0) === d.grossAmount, {
    message: "Збирот на алокациите мора да е еднаков на бруто износот.",
    path: ["allocations"],
  });
export type CalcHonorarInput = z.infer<typeof zCalcHonorar>;

export const zPayout = z.object({
  paymentId: z.string().min(1),
  channel: zPayoutChannel,
  documentNumber: z.string().trim().optional(), // required for CASH (B7)
});
export type PayoutInput = z.infer<typeof zPayout>;

// ── Mobile cash expense (W6) ─────────────────────────────────────────────────
/** Cash-expense categories offered in the mobile form (a fixed subset of the system category keys). */
export const zCashExpenseCategory = z.enum([
  "OPERATIONS",
  "FUEL",
  "EQUIPMENT",
  "PHONE",
  "UTILITIES",
  "RENT",
  "OTHER",
]);
export type CashExpenseCategory = z.infer<typeof zCashExpenseCategory>;

/** W6 cash expense fields (the photo is handled separately as a File — mandatory, B5). */
export const zCashExpense = z.object({
  amount: z.number().int().positive(), // дени
  category: zCashExpenseCategory,
  description: z.string().trim().min(1, "Внеси опис"),
  vendor: z.string().trim().optional(),
  receiptNumber: z.string().trim().optional(),
});
export type CashExpenseInput = z.infer<typeof zCashExpense>;

/** Register a salaried employee (плата). grossSalary in дени. */
export const zCreateEmployee = z.object({
  name: z.string().trim().min(1, "Внеси име"),
  grossSalary: z.number().int().positive(),
  position: z.string().trim().optional(),
});
export type CreateEmployeeInput = z.infer<typeof zCreateEmployee>;

/** A new versioned service-package amount (B4 — never edit, always a new version). */
export const zChangePackage = z.object({
  clientId: z.string().min(1),
  monthlyAmount: z.number().int().min(0),
  description: z.string().trim().optional(),
  effectiveFrom: z.string().min(1), // ISO date; the first of a month typically
});
export type ChangePackageInput = z.infer<typeof zChangePackage>;
