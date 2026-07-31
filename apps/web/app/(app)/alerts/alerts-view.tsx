"use client";

import { useState, useTransition } from "react";
import type { AlertRow } from "@/lib/alerts";
import { acknowledgeAlertAction } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  INTEGRITY_FAILED: "Интегритет (B14)",
  CONTINUITY_GAP: "Континуитет",
  IMPORT_FAILED: "Увоз",
  RATE_SANITY: "Курс ±6%",
  MATCH_ERROR: "Спарување",
};

export function AlertsView({ alerts }: { alerts: AlertRow[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const open = alerts.filter((a) => !a.acknowledgedAt);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[16px] font-extrabold text-ink">Аларми</h2>
        <p className="text-[12.5px] text-muted">
          Интегритет-неуспеси, прекини на континуитет и предупредувања од увозот/спарувањето.{" "}
          {open.length > 0 ? `${open.length} нови.` : "Нема нови."}
        </p>
      </div>

      {msg && <p className="text-[12.5px] font-semibold text-accent">{msg}</p>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div className="hidden min-w-[760px] items-center gap-3 border-b border-border-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2 md:flex">
          <span className="w-[130px]">Тип</span>
          <span className="flex-1">Опис</span>
          <span className="w-[140px]">Време</span>
          <span className="w-[120px] text-right">Статус</span>
        </div>

        {alerts.length === 0 && (
          <p className="px-5 py-8 text-center text-[13px] text-muted-2">Нема аларми. 🎉</p>
        )}

        {alerts.map((a) => (
          <div
            key={a.id}
            className={`flex flex-col gap-2 border-b border-border-3 px-4 py-3 text-[13px] last:border-0 md:flex-row md:items-center md:gap-3 md:px-5 ${
              a.acknowledgedAt ? "opacity-55" : ""
            }`}
          >
            <span className="w-[130px]">
              <span
                className={`rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${
                  a.severity === "warn" ? "bg-warning-50 text-warning" : "bg-danger-50 text-danger"
                }`}
              >
                {TYPE_LABEL[a.type] ?? a.type}
              </span>
            </span>
            <span className="flex-1">
              <span className="font-semibold text-ink">{a.title}</span>
              <span className="block text-[12px] text-muted">{a.detail}</span>
            </span>
            <span className="w-[140px] text-[12px] text-muted-2">{a.createdAt}</span>
            <span className="w-[120px] text-left md:text-right">
              {a.acknowledgedAt ? (
                <span className="text-[12px] text-muted-2">Видено</span>
              ) : (
                <button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await acknowledgeAlertAction(a.id);
                      setMsg(r.ok ? "Означено како видено." : r.error);
                    })
                  }
                  className="rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Означи видено
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
