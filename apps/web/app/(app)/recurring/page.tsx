export const dynamic = "force-dynamic";

import { getRecurringCosts } from "@/lib/expenses";
import { getLoanBalances } from "@/lib/loans";
import { LoansSection } from "./loans-section";

export default async function RecurringPage() {
  const [recurring, loans] = await Promise.all([getRecurringCosts(), getLoanBalances()]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[16px] font-extrabold text-ink">Тековни трошоци</h2>
        <p className="text-[12.5px] text-muted">
          Фиксни месечни давачки (плати, кирија, струја, телефон, претплати) и салдо на позајмиците.
        </p>
      </div>

      {/* Fixed recurring overhead — this month vs last month */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-extrabold text-ink">
            Фиксни тековни трошоци · {recurring.period}
          </h3>
          <span className="text-[13px] font-extrabold text-ink">
            {recurring.total} <span className="text-[11px] font-normal text-muted-2">ден</span>
          </span>
        </div>
        <div
          className="hidden items-center border-b border-border-2 pb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2 md:grid"
          style={{ gridTemplateColumns: "1.5fr 1fr 1fr" }}
        >
          <span>Категорија</span>
          <span className="text-right">Овој месец</span>
          <span className="text-right">Претходен ({recurring.prevPeriod})</span>
        </div>
        {recurring.rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between border-b border-border-3 py-2.5 text-[13px] last:border-0 md:grid"
            style={{ gridTemplateColumns: "1.5fr 1fr 1fr" }}
          >
            <span className="font-semibold text-ink md:font-normal">{r.label}</span>
            <span className="text-right font-bold text-ink">
              {r.current} <span className="text-[11px] font-normal text-muted-2">ден</span>
            </span>
            <span className="text-right text-[12px] text-muted-2">{r.previous} ден</span>
          </div>
        ))}
      </section>

      <LoansSection loans={loans} />
    </div>
  );
}
