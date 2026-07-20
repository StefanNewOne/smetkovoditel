export const dynamic = "force-dynamic";

import { currentPeriod, isValidPeriod } from "@smetko/shared";
import { getReports } from "@/lib/reports";

function pctColor(pct: number): string {
  if (pct >= 0.3) return "bg-success";
  if (pct >= 0.1) return "bg-warning";
  return "bg-danger";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  const period = raw && isValidPeriod(raw) ? raw : currentPeriod();
  const r = await getReports(period);
  const maxRev = Math.max(1, ...r.margins.map((m) => m.revenue));

  return (
    <div className="flex flex-col gap-4">
      {/* P&L */}
      <div className="grid grid-cols-4 gap-4">
        <Kpi label={`Приходи · ${period}`} value={r.pl.revenueF} />
        <Kpi label="Трошоци" value={r.pl.expensesF} />
        <Kpi
          label="Добивка"
          value={r.pl.profitF}
          accent={r.pl.profit >= 0 ? "success" : "danger"}
        />
        <Kpi
          label="Cash flow (благајна)"
          value={`+${r.cashFlow.cashIn} / −${r.cashFlow.cashOut}`}
          small
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* Margin per client */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-[14px] font-extrabold text-ink">Маргина по клиент</h3>
          {r.margins.length === 0 ? (
            <p className="text-[13px] text-muted-2">Нема податоци за {period}.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {r.margins.map((m) => (
                <div key={m.clientId}>
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold text-ink">{m.name}</span>
                    <span className="text-muted">
                      {m.revenueF} ден · маргина{" "}
                      <span className="font-bold text-ink">{m.pctLabel}</span>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-md bg-track">
                    <div
                      className={`h-full rounded-md ${pctColor(m.pct)}`}
                      style={{ width: `${Math.max(2, (m.revenue / maxRev) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aging + accountant package */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="mb-3 text-[14px] font-extrabold text-ink">
              Aging (отворени побарувања)
            </h3>
            <div className="flex flex-col gap-2 text-[13px]">
              <AgingRow label="0–15 дена" value={r.aging.b0} />
              <AgingRow label="16–30 дена" value={r.aging.b16} />
              <AgingRow label="31–60 дена" value={r.aging.b31} />
              <AgingRow label="60+ дена" value={r.aging.b60} danger />
            </div>
          </div>

          <div className="rounded-xl bg-ink p-6 text-white">
            <h3 className="text-[14px] font-extrabold">Пакет за сметководител (W9)</h3>
            <p className="mt-1 text-[12px] text-[#9daabd]">
              6 секции: излезни фактури, влезни трошоци, изводи, благајна, хонорари, плати.
            </p>
            <a
              href={`/api/reports/accountant-package?period=${period}`}
              className="mt-4 inline-block rounded-md bg-accent px-4 py-2.5 text-[13px] font-bold text-white hover:opacity-90"
            >
              ⬇ Преземи ZIP · {period}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger";
  small?: boolean;
}) {
  const color =
    accent === "success" ? "text-success" : accent === "danger" ? "text-danger" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface px-5.5 py-5">
      <p className="text-[12px] font-semibold text-muted-2">{label}</p>
      <p className={`mt-1 font-extrabold ${color} ${small ? "text-[15px]" : "text-[22px]"}`}>
        {value}
        {small ? "" : " ден"}
      </p>
    </div>
  );
}

function AgingRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-bold ${danger ? "text-danger" : "text-ink"}`}>{value} ден</span>
    </div>
  );
}
