"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Upload } from "lucide-react";
import type { ChargeOption, QueueItem, StatementRow } from "@/lib/import";
import { ignoreLineAction, manualMatchAction, rematchAction, uploadAction } from "./actions";

interface Queues {
  payments: QueueItem[];
  lines: QueueItem[];
  receipts: QueueItem[];
  facebk: QueueItem[];
  partial: QueueItem[];
}

export function ImportView({
  statements,
  queues,
  openCharges,
}: {
  statements: StatementRow[];
  queues: Queues;
  openCharges: ChargeOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string[]>([]);

  function resolve(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok && r.error) setSummary([r.error]);
      router.refresh();
    });
  }

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    setSummary([]);
    startTransition(async () => {
      const r = await uploadAction(fd);
      setSummary(r.ok ? r.summary : [r.error]);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {/* Left: upload + statements */}
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-[14px] font-extrabold text-ink">НЛБ изводи · Meta фактури</h3>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="flex h-[120px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent-300 bg-accent-50 text-accent disabled:opacity-50"
          >
            <Upload size={28} />
            <span className="text-[12.5px] font-semibold">
              {pending ? "Се обработува…" : "Прикачи PDF-ови (multi-upload)"}
            </span>
          </button>
          {summary.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {summary.map((s, i) => (
                <p key={i} className="rounded-md bg-inset px-3 py-1.5 text-[12px] text-ink">
                  {s}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-[14px] font-extrabold text-ink">Изводи</h3>
          {statements.length === 0 && (
            <p className="py-3 text-[13px] text-muted-2">Нема внесени изводи.</p>
          )}
          <div className="flex flex-col gap-2">
            {statements.map((s) => (
              <div key={s.id} className="rounded-lg border border-border-2 p-3 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-ink">Извод {s.statementNumber}</span>
                  <span className="text-muted-2">{s.date}</span>
                  <span className="ml-auto text-[11px] font-bold">
                    {s.status === "PARSED" ? (
                      <span className="text-success-700">✓ PARSED</span>
                    ) : s.status === "FAILED" ? (
                      <span className="text-danger">✗ FAILED (B14)</span>
                    ) : (
                      <span className="text-muted-2">{s.status}</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-muted">
                  претх {s.opening} · долгува {s.debit} · побарува {s.credit} · ново {s.closing}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-2">
                  {s.integrityOk ? "✓" : "⚠"} {s.lineCount}/{s.orderCount} налози
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: 4 queues */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-extrabold text-ink">Редици за внимание</h3>
          <button
            onClick={() => resolve(rematchAction)}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent-50 disabled:opacity-50"
          >
            <RefreshCw size={13} /> Спари повторно
          </button>
        </div>
        <Queue
          title="Уплати за спарување"
          items={queues.payments}
          openCharges={openCharges}
          pending={pending}
          onMatch={(lineId, chargeId) => resolve(() => manualMatchAction(lineId, chargeId))}
        />
        <Queue
          title="Извод-линии за решавање"
          items={queues.lines}
          openCharges={openCharges}
          pending={pending}
          onMatch={(lineId, chargeId) => resolve(() => manualMatchAction(lineId, chargeId))}
          onIgnore={(lineId) => resolve(() => ignoreLineAction(lineId))}
        />
        <Queue title="Receipts без линија" items={queues.receipts} />
        <Queue title="FACEBK без receipt (аларм)" items={queues.facebk} danger />
        <Queue title="PARTIAL / FAILED" items={queues.partial} danger />
      </div>
    </div>
  );
}

function Queue({
  title,
  items,
  danger,
  openCharges,
  pending,
  onMatch,
  onIgnore,
}: {
  title: string;
  items: QueueItem[];
  danger?: boolean;
  openCharges?: ChargeOption[];
  pending?: boolean;
  onMatch?: (lineId: string, chargeId: string) => void;
  onIgnore?: (lineId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[13px] font-extrabold text-ink">{title}</h4>
        <span
          className={`rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${
            items.length === 0
              ? "bg-success-50 text-success-700"
              : danger
                ? "bg-danger-50 text-danger"
                : "bg-warning-50 text-warning-700"
          }`}
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-1 text-[12px] text-muted-2">✓ Редицата е празна</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.slice(0, 8).map((it) => (
            <QueueRow
              key={it.id}
              item={it}
              openCharges={openCharges}
              pending={pending}
              onMatch={onMatch}
              onIgnore={onIgnore}
            />
          ))}
          {items.length > 8 && (
            <p className="text-[11px] text-muted-2">+{items.length - 8} повеќе…</p>
          )}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  openCharges,
  pending,
  onMatch,
  onIgnore,
}: {
  item: QueueItem;
  openCharges?: ChargeOption[];
  pending?: boolean;
  onMatch?: (lineId: string, chargeId: string) => void;
  onIgnore?: (lineId: string) => void;
}) {
  const [chargeId, setChargeId] = useState("");
  // Matchable = an incoming payment (or a legacy CLIENT_PAYMENT line). OUT noise → ignore only.
  const matchable =
    !!onMatch && (item.direction === "IN" || item.classifiedAs === "CLIENT_PAYMENT");

  return (
    <div className="rounded-md bg-inset px-2.5 py-1.5 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
        {item.amount && <span className="font-semibold text-muted">{item.amount}</span>}
        <span className="max-w-[40%] truncate text-[11px] text-muted-2">{item.context}</span>
      </div>

      {/* One-click suggestion: an open invoice whose total exactly matches this incoming payment. */}
      {matchable && item.suggestion && (
        <button
          onClick={() => onMatch?.(item.id, item.suggestion!.id)}
          disabled={pending}
          className="mt-1.5 w-full truncate rounded bg-success-50 px-2 py-1 text-left text-[11px] font-bold text-success-700 hover:bg-success-100 disabled:opacity-40"
        >
          ✓ Спари: {item.suggestion.label}
        </button>
      )}

      {matchable && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <select
            value={chargeId}
            onChange={(e) => setChargeId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-input bg-surface px-1.5 py-1 text-[11px]"
          >
            <option value="">{item.suggestion ? "…или друга фактура" : "Избери фактура…"}</option>
            {(openCharges ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => chargeId && onMatch?.(item.id, chargeId)}
            disabled={pending || !chargeId}
            className="rounded bg-accent px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
          >
            Спари
          </button>
        </div>
      )}

      {!matchable && onIgnore && (
        <div className="mt-1.5">
          <button
            onClick={() => onIgnore?.(item.id)}
            disabled={pending}
            className="rounded border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:bg-chip disabled:opacity-40"
          >
            Игнорирај
          </button>
        </div>
      )}
    </div>
  );
}
