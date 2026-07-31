/**
 * SM-99 — canonical seed for the Category table. Single source shared by the Prisma seed, the
 * integration test baseline (resetDb re-seeds these), and the initial migration. System categories
 * carry billing/payroll/report logic — their `key` is immutable and they cannot be deleted.
 * `recurring` (SM-100) marks fixed monthly overhead surfaced on the ТЕКОВНИ ТРОШОЦИ screen.
 */
export type CategoryKindSeed = "OPERATING" | "BILLABLE" | "PAYROLL" | "BANK";

export interface CategorySeed {
  key: string;
  label: string;
  system: boolean;
  kind: CategoryKindSeed;
  sortOrder: number;
  recurring: boolean;
}

export const CATEGORY_SEED: CategorySeed[] = [
  { key: "OPERATIONS", label: "Оперативни", system: false, kind: "OPERATING", sortOrder: 10, recurring: false }, // prettier-ignore
  {
    key: "ADS",
    label: "Реклами (Meta)",
    system: true,
    kind: "BILLABLE",
    sortOrder: 20,
    recurring: false,
  },
  {
    key: "ACTORS",
    label: "Актери",
    system: true,
    kind: "BILLABLE",
    sortOrder: 30,
    recurring: false,
  },
  {
    key: "EQUIPMENT",
    label: "Опрема",
    system: false,
    kind: "OPERATING",
    sortOrder: 40,
    recurring: false,
  },
  {
    key: "FUEL",
    label: "Гориво",
    system: false,
    kind: "OPERATING",
    sortOrder: 50,
    recurring: false,
  },
  {
    key: "RENT",
    label: "Кирија",
    system: false,
    kind: "OPERATING",
    sortOrder: 60,
    recurring: true,
  },
  {
    key: "UTILITIES",
    label: "Комуналии",
    system: false,
    kind: "OPERATING",
    sortOrder: 70,
    recurring: true,
  },
  { key: "PHONE", label: "Телефон / интернет", system: false, kind: "OPERATING", sortOrder: 80, recurring: true }, // prettier-ignore
  {
    key: "BANK_FEES",
    label: "Банкарски провизии",
    system: true,
    kind: "BANK",
    sortOrder: 90,
    recurring: false,
  },
  { key: "SALARY", label: "Плата", system: true, kind: "PAYROLL", sortOrder: 100, recurring: true },
  {
    key: "HONORAR",
    label: "Хонорар",
    system: true,
    kind: "PAYROLL",
    sortOrder: 110,
    recurring: false,
  },
  { key: "REPRESENTATION", label: "Кафани / ресторани", system: false, kind: "OPERATING", sortOrder: 120, recurring: false }, // prettier-ignore
  {
    key: "MARKETING",
    label: "Маркетинг",
    system: false,
    kind: "OPERATING",
    sortOrder: 130,
    recurring: false,
  },
  { key: "SUBSCRIPTIONS", label: "Претплати / Системи", system: false, kind: "OPERATING", sortOrder: 135, recurring: true }, // prettier-ignore
  {
    key: "OTHER",
    label: "Друго",
    system: false,
    kind: "OPERATING",
    sortOrder: 140,
    recurring: false,
  },
];
