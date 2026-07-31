import "server-only";
import { currentPeriod, formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";

/** True if `key` is a known, active category (SM-99 — categories are data, validated at runtime). */
export async function categoryExists(key: string): Promise<boolean> {
  return (await prisma.category.count({ where: { key, active: true } })) > 0;
}

export interface CategoryOption {
  value: string;
  label: string;
}

/**
 * Categories offered for manual expense categorization / vendor rules (SM-99/SM-100): active
 * categories, ordered by sortOrder, EXCEPT the pass-through billables (ADS/ACTORS — booked only by
 * their Meta/talent workflows to preserve no-double-billing) and HONORAR (booked by W5 payout).
 * SALARY IS offered — payroll only calculates, it never books the expense, so the bank salary line is
 * where salary enters the ledger. Custom + recurring categories appear here automatically.
 */
export async function getExpenseCategoryOptions(): Promise<CategoryOption[]> {
  const cats = await prisma.category.findMany({
    where: { active: true, kind: { not: "BILLABLE" }, key: { not: "HONORAR" } },
    orderBy: { sortOrder: "asc" },
  });
  return cats.map((c) => ({ value: c.key, label: c.label }));
}

/**
 * Default labels for the seeded categories — fallback ONLY when a DB label isn't loaded. The
 * authoritative label is `Category.label` (editable, and custom categories like "Маркети" exist
 * only there). Never resolve a display label from this map alone, or custom categories render as
 * their raw key (`CAT_…`).
 */
export const CATEGORY_LABEL: Record<string, string> = {
  OPERATIONS: "Оперативни",
  ADS: "Реклами (Meta)",
  ACTORS: "Актери",
  EQUIPMENT: "Опрема",
  FUEL: "Гориво",
  RENT: "Кирија",
  UTILITIES: "Комуналии",
  PHONE: "Телефон / интернет",
  BANK_FEES: "Банкарски провизии",
  SALARY: "Плата",
  HONORAR: "Хонорар",
  REPRESENTATION: "Кафани / ресторани",
  MARKETING: "Маркетинг",
  OTHER: "Друго",
};

export interface ExpenseRow {
  id: string;
  date: string;
  categoryLabel: string;
  vendor: string | null;
  amount: string;
  channel: string;
  clientName: string | null;
  isBillable: boolean;
}

const dt = (d: Date) =>
  new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Variable expenses (ТРОШОЦИ, SM-90/SM-100) — everything EXCEPT the fixed recurring overhead, which
 * lives on the ТЕКОВНИ ТРОШОЦИ screen. Fuel, restaurants, marketing, equipment, one-offs, etc.
 */
export async function getExpenses(): Promise<ExpenseRow[]> {
  const expenses = await prisma.expense.findMany({
    where: { categoryRef: { recurring: false } },
    orderBy: { date: "desc" },
    take: 500,
    include: { client: { select: { name: true } }, categoryRef: { select: { label: true } } },
  });
  return expenses.map((e) => ({
    id: e.id,
    date: dt(e.date),
    // authoritative label from the Category table (custom categories only live there), key as last resort
    categoryLabel: e.categoryRef?.label ?? CATEGORY_LABEL[e.category] ?? e.category,
    vendor: e.vendor,
    amount: formatMKD(e.amount, { decimals: 0 }),
    channel: e.paymentChannel,
    clientName: e.client?.name ?? null,
    isBillable: e.isBillable,
  }));
}

export interface CategoryTotal {
  label: string;
  total: string;
  count: number;
}

/** Totals per category (variable only — recurring overhead is summarized on ТЕКОВНИ ТРОШОЦИ). */
export async function getExpenseTotals(): Promise<CategoryTotal[]> {
  const [grouped, cats] = await Promise.all([
    prisma.expense.groupBy({
      by: ["category"],
      where: { categoryRef: { recurring: false } },
      _sum: { amount: true },
      _count: true,
    }),
    // groupBy can't join the relation — resolve labels from the Category table separately.
    prisma.category.findMany({ select: { key: true, label: true } }),
  ]);
  const labelByKey = new Map(cats.map((c) => [c.key, c.label]));
  return grouped
    .map((g) => ({
      label: labelByKey.get(g.category) ?? CATEGORY_LABEL[g.category] ?? g.category,
      total: formatMKD(g._sum.amount ?? 0, { decimals: 0 }),
      count: g._count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "mk"));
}

export interface RecurringCostRow {
  key: string;
  label: string;
  current: string; // this period's total
  previous: string; // previous period's total (for comparison — rent/salary should be steady)
  currentRaw: number;
}

/**
 * Fixed monthly overhead per recurring category (SM-100) for `period` and the prior month — the
 * predictable "burn baseline" shown on ТЕКОВНИ ТРОШОЦИ. Grouped by expense date (economic month).
 */
export async function getRecurringCosts(period = currentPeriod()): Promise<{
  rows: RecurringCostRow[];
  total: string;
  period: string;
  prevPeriod: string;
}> {
  const [y, m] = period.split("-").map(Number);
  const curStart = new Date(Date.UTC(y!, m! - 1, 1));
  const curEnd = new Date(Date.UTC(y!, m!, 1));
  const prevStart = new Date(Date.UTC(y!, m! - 2, 1));
  const prevPeriod = `${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, "0")}`;

  const cats = await prisma.category.findMany({
    where: { recurring: true, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const keys = cats.map((c) => c.key);
  const [curG, prevG] = await Promise.all([
    prisma.expense.groupBy({
      by: ["category"],
      where: { category: { in: keys }, date: { gte: curStart, lt: curEnd } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { category: { in: keys }, date: { gte: prevStart, lt: curStart } },
      _sum: { amount: true },
    }),
  ]);
  const cur = new Map(curG.map((g) => [g.category, g._sum.amount ?? 0]));
  const prev = new Map(prevG.map((g) => [g.category, g._sum.amount ?? 0]));
  const rows = cats.map((c) => ({
    key: c.key,
    label: c.label,
    current: formatMKD(cur.get(c.key) ?? 0, { decimals: 0 }),
    previous: formatMKD(prev.get(c.key) ?? 0, { decimals: 0 }),
    currentRaw: cur.get(c.key) ?? 0,
  }));
  const total = formatMKD(
    rows.reduce((s, r) => s + r.currentRaw, 0),
    { decimals: 0 },
  );
  return { rows, total, period, prevPeriod };
}
