import "server-only";
import { formatMKD } from "@smetko/shared";
import { prisma } from "@smetko/db";

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

/** All expenses (SM-90) — where categorized bank lines, cash expenses and pass-throughs are visible. */
export async function getExpenses(): Promise<ExpenseRow[]> {
  const expenses = await prisma.expense.findMany({
    orderBy: { date: "desc" },
    take: 500,
    include: { client: { select: { name: true } } },
  });
  return expenses.map((e) => ({
    id: e.id,
    date: dt(e.date),
    categoryLabel: CATEGORY_LABEL[e.category] ?? e.category,
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

/** Totals per category — the summary strip above the list. */
export async function getExpenseTotals(): Promise<CategoryTotal[]> {
  const grouped = await prisma.expense.groupBy({
    by: ["category"],
    _sum: { amount: true },
    _count: true,
  });
  return grouped
    .map((g) => ({
      label: CATEGORY_LABEL[g.category] ?? g.category,
      total: formatMKD(g._sum.amount ?? 0, { decimals: 0 }),
      count: g._count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "mk"));
}
