"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { formatMKD, shiftPeriod } from "@smetko/shared";
import { StatusBadge } from "@/components/ui/badges";
import type { ChargeRow } from "@/lib/charges";
import { approveAllDrafts, approveCharge, runW1 } from "./actions";

const COLS = "1.6fr 1.1fr 0.9fr 1fr 0.9fr 1fr 0.9fr 0.9fr";

const KIND_LABEL: Record<string, string> = {
  INVOICE: "ФАКТУРА",
  CASH_OBLIGATION: "КЕШ ОБВ.",
  CREDIT_NOTE: "ОДОБРЕНИЕ",
};

export function ChargesView({
  period,
  charges,
  draftCount,
}: {
  period: string;
  charges: ChargeRow[];
  draftCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function go(p: string) {
    router.push(`/charges?period=${p}`);
  }

  function doRunW1() {
    setMsg(null);
    startTransition(async () => {
      const r = await runW1(period);
      setMsg(r.ok ? `W1 извршен: ${r.created} создадени, ${r.skipped} прескокнати.` : r.error);
      router.refresh();
    });
  }

  function doApprove(id: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await approveCharge(id);
      setMsg(r.ok ? `Фактура ${r.invoiceNumber} издадена.` : r.error);
      router.refresh();
    });
  }

  function doApproveAll() {
    setMsg(null);
    startTransition(async () => {
      const r = await approveAllDrafts(period);
      setMsg(`Издадени ${r.approved} фактури.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface">
          <button
            onClick={() => go(shiftPeriod(period, -1))}
            className="px-2 py-1.5 text-muted hover:text-ink"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[84px] text-center text-[13px] font-bold text-ink">{period}</span>
          <button
            onClick={() => go(shiftPeriod(period, 1))}
            className="px-2 py-1.5 text-muted hover:text-ink"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={doRunW1}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md border border-accent-200 px-3.5 py-2 text-[12px] font-bold text-accent hover:bg-accent-50 disabled:opacity-40"
          >
            <Play size={13} /> Изврши W1
          </button>
          <button
            onClick={doApproveAll}
            disabled={pending || draftCount === 0}
            className="rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            Одобри ги сите DRAFT ({draftCount})
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg bg-accent-50 px-4 py-2.5 text-[12.5px] text-accent-hover">
          {msg}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div
          className="grid items-center border-b border-border-2 px-5.5 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Клиент</span>
          <span>Број</span>
          <span>Вид</span>
          <span className="text-right">Основица</span>
          <span className="text-right">ДДВ 18%</span>
          <span className="text-right">Вкупно</span>
          <span>Статус</span>
          <span className="text-right">Акција</span>
        </div>

        {charges.length === 0 && (
          <p className="px-5.5 py-8 text-center text-[13px] text-muted-2">
            Нема задолжувања за {period}. Кликни „Изврши W1“.
          </p>
        )}

        {charges.map((c) => (
          <div
            key={c.id}
            className="grid items-center border-b border-border-3 px-5.5 py-3 text-[13px] last:border-0"
            style={{ gridTemplateColumns: COLS }}
          >
            <span className="font-bold text-ink">{c.clientName}</span>
            <span>
              {c.invoiceNumber ? (
                <a
                  href={`/charges/${c.id}/invoice`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-accent hover:underline"
                >
                  {c.invoiceNumber}
                </a>
              ) : (
                <span className="text-muted">—</span>
              )}
            </span>
            <span className="text-[11px] font-bold text-muted-2">
              {KIND_LABEL[c.kind] ?? c.kind}
            </span>
            <span className="text-right text-ink">{formatMKD(c.subtotal, { decimals: 0 })}</span>
            <span className="text-right text-muted">
              {c.kind === "CASH_OBLIGATION" ? "—" : formatMKD(c.vatAmount, { decimals: 0 })}
            </span>
            <span className="text-right font-bold text-ink">
              {formatMKD(c.total, { decimals: 0 })}
            </span>
            <span>
              <StatusBadge status={c.status} />
            </span>
            <span className="text-right">
              {c.kind === "INVOICE" && c.status === "DRAFT" ? (
                <button
                  onClick={() => doApprove(c.id)}
                  disabled={pending}
                  className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                >
                  Одобри
                </button>
              ) : (
                <span className="text-muted-2">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
