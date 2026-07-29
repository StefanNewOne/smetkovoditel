export const dynamic = "force-dynamic";

import { AlertTriangle, ClipboardList, FilePen, FileWarning, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { getDashboard } from "@/lib/dashboard";

const ATTENTION_ICONS: Record<string, LucideIcon> = {
  resolve: ClipboardList,
  facebk: AlertTriangle,
  partial: FileWarning,
  drafts: FilePen,
};

export default async function DashboardPage() {
  const d = await getDashboard();

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {d.kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface px-5.5 py-5">
            <p className="text-[12px] font-semibold text-muted-2">{k.label}</p>
            <p className="mt-1 text-[26px] font-extrabold text-ink">
              {k.value}
              <span className="ml-1 text-[12px] font-normal text-muted-2">ден</span>
            </p>
            <p className="mt-1 text-[12px] text-muted-2">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Row 2 — Задолжено vs наплатено · Топ должници */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-[14px] font-extrabold text-ink">Задолжено vs наплатено</h3>
          <div className="flex flex-col gap-4">
            <ProgressBar label={d.invoices.label} p={d.invoices} color="bg-accent" />
            <ProgressBar label={d.cash.label} p={d.cash} color="bg-warning" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border-2 pt-4">
            <Stat label="Задолжено" value={d.totals.billed} />
            <Stat label="Наплатено" value={d.totals.paid} accent="success" />
            <Stat label="Остаток" value={d.totals.remaining} accent="danger" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h3 className="mb-4 text-[14px] font-extrabold text-ink">Топ должници</h3>
          {d.topDebtors.length === 0 ? (
            <p className="text-[13px] text-muted-2">Нема отворени побарувања.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {d.topDebtors.map((t) => (
                <div key={t.clientId} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[12px] font-bold text-accent">
                    {t.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{t.name}</p>
                    <p className="text-[11.5px] text-muted-2">старост {t.ageDays} дена</p>
                  </div>
                  <span className="text-[13px] font-extrabold text-danger">
                    {t.amount} <span className="text-[11px] font-normal text-muted-2">ден</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3 — Редици за внимание */}
      <div>
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.5px] text-muted-2">
          Редици за внимание
        </h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {d.attention.map((a) => {
            const Icon = ATTENTION_ICONS[a.key] ?? ClipboardList;
            const active = a.count > 0;
            const body = (
              <>
                <div className="flex items-center justify-between">
                  <Icon size={18} className={active ? "text-accent" : "text-muted-2"} />
                  <span
                    className={`text-[22px] font-extrabold ${active ? "text-ink" : "text-muted-2"}`}
                  >
                    {a.count}
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] font-semibold text-muted">{a.label}</p>
              </>
            );
            return active ? (
              <Link
                key={a.key}
                href={a.href}
                className="rounded-xl border border-border bg-surface p-5 transition hover:border-accent-200 hover:bg-accent-50"
              >
                {body}
              </Link>
            ) : (
              <div
                key={a.key}
                className="rounded-xl border border-border bg-surface p-5 opacity-70"
                aria-disabled
              >
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  p,
  color,
}: {
  label: string;
  p: { paid: number; billed: number; remaining: string; pct: number };
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12.5px]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-muted-2">
          наплатено <span className="font-bold text-ink">{Math.round(p.pct * 100)}%</span> · остаток{" "}
          {p.remaining} ден
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-md bg-track">
        <div
          className={`h-full rounded-md ${color}`}
          style={{ width: `${Math.round(p.pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger";
}) {
  const color =
    accent === "success" ? "text-success" : accent === "danger" ? "text-danger" : "text-ink";
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-2">{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold ${color}`}>
        {value} <span className="text-[10px] font-normal text-muted-2">ден</span>
      </p>
    </div>
  );
}
