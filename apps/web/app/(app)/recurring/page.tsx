export const dynamic = "force-dynamic";

import { getRecurringCosts } from "@/lib/expenses";
import { getLoanBalances } from "@/lib/loans";

export default async function RecurringPage() {
  const [recurring, loans] = await Promise.all([getRecurringCosts(), getLoanBalances()]);
  const totalOutstanding = loans.reduce((s, l) => s + l.outstandingRaw, 0);

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

      {/* Loans — outstanding balance per lender (a liability, never summed with costs) */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[14px] font-extrabold text-ink">Позајмици · салдо</h3>
          <span className="text-[13px] font-extrabold text-ink">
            {new Intl.NumberFormat("de-DE").format(totalOutstanding / 100)}{" "}
            <span className="text-[11px] font-normal text-muted-2">ден долг</span>
          </span>
        </div>
        <p className="mb-3 text-[11px] text-muted-2">
          Обврска на фирмата кон приватни лица (примено − вратено). Не е трошок.
        </p>
        {loans.length === 0 ? (
          <p className="py-2 text-[12.5px] text-muted-2">Нема евидентирани позајмици.</p>
        ) : (
          <>
            <div
              className="hidden items-center border-b border-border-2 pb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2 md:grid"
              style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}
            >
              <span>Заемодавач</span>
              <span className="text-right">Примено</span>
              <span className="text-right">Вратено</span>
              <span className="text-right">Долг</span>
            </div>
            {loans.map((l) => (
              <div
                key={l.lenderName}
                className="flex flex-col gap-1 border-b border-border-3 py-2.5 text-[13px] last:border-0 md:grid md:items-center md:gap-0"
                style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}
              >
                <span className="font-semibold text-ink">{l.lenderName}</span>
                <span className="text-right text-[12px] text-success-700">{l.received} ден</span>
                <span className="text-right text-[12px] text-muted">{l.repaid} ден</span>
                <span className="text-right font-bold text-ink">{l.outstanding} ден</span>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
