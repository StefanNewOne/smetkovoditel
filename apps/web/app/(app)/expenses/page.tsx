export const dynamic = "force-dynamic";

import { getExpenses, getExpenseTotals } from "@/lib/expenses";

const COLS = "0.8fr 1.3fr 1.4fr 0.9fr 1fr";

export default async function ExpensesPage() {
  const [rows, totals] = await Promise.all([getExpenses(), getExpenseTotals()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[16px] font-extrabold text-ink">Трошоци</h2>
        <p className="text-[12.5px] text-muted">
          Категоризирани трошоци од изводи, благајна и префактурирања.
        </p>
      </div>

      {totals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {totals.map((t) => (
            <div key={t.label} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-[11px] font-semibold text-muted-2">{t.label}</p>
              <p className="text-[14px] font-extrabold text-ink">
                {t.total}{" "}
                <span className="text-[11px] font-normal text-muted-2">ден · {t.count}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div
          className="hidden min-w-[720px] items-center border-b border-border-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2 md:grid"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Датум</span>
          <span>Категорија</span>
          <span>Продавач</span>
          <span>Канал</span>
          <span className="text-right">Износ</span>
        </div>
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-[13px] text-muted-2">Нема трошоци.</p>
        )}
        {rows.map((e) => (
          <div
            key={e.id}
            className="flex flex-col gap-1 border-b border-border-3 px-4 py-3 text-[13px] last:border-0 md:grid md:min-w-[720px] md:items-center md:gap-0 md:px-5"
            style={{ gridTemplateColumns: COLS }}
          >
            <span className="text-[12px] text-muted">{e.date}</span>
            <span className="font-semibold text-ink md:font-normal">
              {e.categoryLabel}
              {e.isBillable && e.clientName && (
                <span className="ml-1.5 text-[11px] text-accent">→ {e.clientName}</span>
              )}
            </span>
            <span className="truncate text-[12.5px] text-muted">{e.vendor ?? "—"}</span>
            <span className="text-[12px] text-muted-2">{e.channel}</span>
            <span className="text-left font-bold text-ink md:text-right">
              <span className="font-normal text-muted-2 md:hidden">Износ: </span>
              {e.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
