/**
 * SM-99 — canonical seed for the Category table. Single source shared by the Prisma seed, the
 * integration test baseline (resetDb re-seeds these), and the initial migration. System categories
 * carry billing/payroll/report logic — their `key` is immutable and they cannot be deleted.
 */
export type CategoryKindSeed = "OPERATING" | "BILLABLE" | "PAYROLL" | "BANK";

export interface CategorySeed {
  key: string;
  label: string;
  system: boolean;
  kind: CategoryKindSeed;
  sortOrder: number;
}

export const CATEGORY_SEED: CategorySeed[] = [
  { key: "OPERATIONS", label: "Оперативни", system: false, kind: "OPERATING", sortOrder: 10 },
  { key: "ADS", label: "Реклами (Meta)", system: true, kind: "BILLABLE", sortOrder: 20 },
  { key: "ACTORS", label: "Актери", system: true, kind: "BILLABLE", sortOrder: 30 },
  { key: "EQUIPMENT", label: "Опрема", system: false, kind: "OPERATING", sortOrder: 40 },
  { key: "FUEL", label: "Гориво", system: false, kind: "OPERATING", sortOrder: 50 },
  { key: "RENT", label: "Кирија", system: false, kind: "OPERATING", sortOrder: 60 },
  { key: "UTILITIES", label: "Комуналии", system: false, kind: "OPERATING", sortOrder: 70 },
  { key: "PHONE", label: "Телефон / интернет", system: false, kind: "OPERATING", sortOrder: 80 },
  { key: "BANK_FEES", label: "Банкарски провизии", system: true, kind: "BANK", sortOrder: 90 },
  { key: "SALARY", label: "Плата", system: true, kind: "PAYROLL", sortOrder: 100 },
  { key: "HONORAR", label: "Хонорар", system: true, kind: "PAYROLL", sortOrder: 110 },
  {
    key: "REPRESENTATION",
    label: "Кафани / ресторани",
    system: false,
    kind: "OPERATING",
    sortOrder: 120,
  },
  { key: "MARKETING", label: "Маркетинг", system: false, kind: "OPERATING", sortOrder: 130 },
  { key: "OTHER", label: "Друго", system: false, kind: "OPERATING", sortOrder: 140 },
];
