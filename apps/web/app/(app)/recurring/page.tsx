export const dynamic = "force-dynamic";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { currentPeriod, isValidPeriod, shiftPeriod } from "@smetko/shared";
import { getRecurringCosts } from "@/lib/expenses";
import { getLoanBalances } from "@/lib/loans";
import { LoansSection } from "./loans-section";

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  // Default to the last COMPLETE month, not the in-progress current one — fixed monthly bills (rent,
  // utilities, phone, subscriptions) are paid later in the month, so the current month reads as ~0
  // and makes the baseline look empty. The stepper reaches the in-progress month when wanted.
  const period = raw && isValidPeriod(raw) ? raw : shiftPeriod(currentPeriod(), -1);
  const inProgress = period === currentPeriod();

  const [recurring, loans] = await Promise.all([getRecurringCosts(period), getLoanBalances()]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[16px] font-extrabold text-ink">Тековни трошоци</h2>
          <p className="text-[12.5px] text-muted">
            Фиксни месечни давачки (плати, кирија, струја, телефон, претплати) и салдо на
            позајмиците.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface">
          <Link
            href={`/recurring?period=${shiftPeriod(period, -1)}`}
            className="px-2 py-1.5 text-muted hover:text-ink"
            aria-label="Претходен месец"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="min-w-[84px] text-center text-[13px] font-bold text-ink">{period}</span>
          <Link
            href={`/recurring?period=${shiftPeriod(period, 1)}`}
            className="px-2 py-1.5 text-muted hover:text-ink"
            aria-label="Следен месец"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* Fixed recurring overhead — selected month vs the month before it */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[14px] font-extrabold text-ink">
            Фиксни тековни трошоци · {recurring.period}
            {inProgress && (
              <span className="rounded-[6px] bg-chip px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-muted-2">
                во тек
              </span>
            )}
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
          <span className="text-right">{recurring.period}</span>
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
