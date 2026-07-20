"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock, Play } from "lucide-react";
import { formatMKD, parseDenari, shiftPeriod } from "@smetko/shared";
import { StatusBadge } from "@/components/ui/badges";
import type { ChargeRow } from "@/lib/charges";
import { approveAllDrafts, approveCharge, closePeriodAction, creditNote, runW1 } from "./actions";

interface CloseBlocker {
  key: string;
  label: string;
  count: number;
}

const COLS = "1.5fr 1.1fr 0.8fr 0.9fr 0.8fr 0.9fr 0.8fr 1fr";

const KIND_LABEL: Record<string, string> = {
  INVOICE: "ФАКТУРА",
  CASH_OBLIGATION: "КЕШ ОБВ.",
  CREDIT_NOTE: "ОДОБРЕНИЕ",
};

function safeDeni(raw: string): number {
  try {
    return raw.trim() ? parseDenari(raw) : 0;
  } catch {
    return 0;
  }
}

export function ChargesView({
  period,
  charges,
  draftCount,
  blockers,
  closed,
}: {
  period: string;
  charges: ChargeRow[];
  draftCount: number;
  blockers: CloseBlocker[];
  closed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cnFor, setCnFor] = useState<ChargeRow | null>(null);

  const go = (p: string) => router.push(`/charges?period=${p}`);
  const run = (fn: () => Promise<void>) => {
    setMsg(null);
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

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
        {closed && (
          <span className="flex items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-[12px] font-bold text-white">
            <Lock size={12} /> Период ЗАТВОРЕН (B9)
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCloseOpen(true)}
            disabled={closed}
            className="rounded-md border border-border px-3.5 py-2 text-[12px] font-bold text-muted hover:bg-inset disabled:opacity-40"
          >
            Затвори период
          </button>
          <button
            onClick={() =>
              run(async () => {
                const r = await runW1(period);
                setMsg(r.ok ? `W1: ${r.created} создадени, ${r.skipped} прескокнати.` : r.error);
              })
            }
            disabled={pending || closed}
            className="flex items-center gap-1.5 rounded-md border border-accent-200 px-3.5 py-2 text-[12px] font-bold text-accent hover:bg-accent-50 disabled:opacity-40"
          >
            <Play size={13} /> Изврши W1
          </button>
          <button
            onClick={() =>
              run(async () => {
                const r = await approveAllDrafts(period);
                setMsg(`Издадени ${r.approved} фактури.`);
              })
            }
            disabled={pending || draftCount === 0 || closed}
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

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div
          className="grid min-w-[860px] items-center border-b border-border-2 px-5.5 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Клиент</span>
          <span>Број</span>
          <span>Вид</span>
          <span className="text-right">Основица</span>
          <span className="text-right">ДДВ</span>
          <span className="text-right">Вкупно</span>
          <span>Статус</span>
          <span className="text-right">Акција</span>
        </div>

        {charges.length === 0 && (
          <p className="px-5.5 py-8 text-center text-[13px] text-muted-2">
            Нема задолжувања за {period}.
          </p>
        )}

        {charges.map((c) => (
          <div
            key={c.id}
            className="grid min-w-[860px] items-center border-b border-border-3 px-5.5 py-3 text-[13px] last:border-0"
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
                  onClick={() =>
                    run(async () => {
                      const r = await approveCharge(c.id);
                      setMsg(r.ok ? `Фактура ${r.invoiceNumber} издадена.` : r.error);
                    })
                  }
                  disabled={pending || closed}
                  className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                >
                  Одобри
                </button>
              ) : c.kind === "INVOICE" && c.invoiceNumber ? (
                <button
                  onClick={() => setCnFor(c)}
                  disabled={closed}
                  className="text-[12px] font-bold text-muted hover:text-accent disabled:opacity-40"
                >
                  Одобрение
                </button>
              ) : (
                <span className="text-muted-2">—</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {closeOpen && (
        <Modal title={`Затворање на период ${period}`} onClose={() => setCloseOpen(false)}>
          {blockers.length === 0 ? (
            <p className="rounded-lg bg-success-50 px-3 py-2 text-[13px] text-success-700">
              ✓ Нема пречки — периодот може да се затвори.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-[12px] text-muted">Пречки за затворање (W8):</p>
              {blockers.map((b) => (
                <div
                  key={b.key}
                  className="flex items-center justify-between rounded-md bg-danger-50 px-3 py-1.5 text-[12.5px] text-danger"
                >
                  <span>{b.label}</span>
                  <span className="font-bold">{b.count}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-2">
            По затворање периодот е непроменлив (B9) — корекции само преку книжно одобрение /
            сторно.
          </p>
          <div className="mt-5 flex justify-between">
            <button
              onClick={() => setCloseOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
            >
              Откажи
            </button>
            <button
              disabled={pending || blockers.length > 0}
              onClick={() =>
                run(async () => {
                  const r = await closePeriodAction(period);
                  if (r.ok) {
                    setCloseOpen(false);
                    setMsg(`Период ${period} затворен.`);
                  } else if ("error" in r) setMsg(r.error);
                })
              }
              className="rounded-md bg-ink px-5 py-2 text-[13px] font-bold text-white disabled:opacity-40"
            >
              Затвори период
            </button>
          </div>
        </Modal>
      )}

      {cnFor && (
        <CreditNoteModal
          charge={cnFor}
          pending={pending}
          onClose={() => setCnFor(null)}
          onSubmit={(amount, reason) =>
            run(async () => {
              const r = await creditNote(cnFor.id, amount, reason);
              setCnFor(null);
              setMsg(r.ok ? "Книжно одобрение создадено." : r.error);
            })
          }
        />
      )}
    </div>
  );
}

function CreditNoteModal({
  charge,
  pending,
  onClose,
  onSubmit,
}: {
  charge: ChargeRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState("");
  const amount = safeDeni(raw);

  return (
    <Modal title={`Книжно одобрение · ${charge.invoiceNumber}`} onClose={onClose}>
      <p className="mb-3 text-[12px] text-muted-2">
        Оригинал: {formatMKD(charge.total, { decimals: 0 })} ден
      </p>
      <label className="block text-[12px] font-semibold text-muted">
        Износ на одобрение (МКД)
        <input
          className="mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-[12px] font-semibold text-muted">
        Причина
        <input
          className="mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="mt-5 flex justify-between">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
        >
          Откажи
        </button>
        <button
          disabled={pending || amount <= 0}
          onClick={() => onSubmit(amount, reason.trim())}
          className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          Создади одобрение
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(20,30,48,0.45)" }}
    >
      <div className="max-h-[90vh] w-full max-w-[460px] animate-fade-up overflow-y-auto rounded-[18px] bg-surface p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold text-ink">{title}</h3>
          <button onClick={onClose} className="text-[18px] text-muted-2 hover:text-ink">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
