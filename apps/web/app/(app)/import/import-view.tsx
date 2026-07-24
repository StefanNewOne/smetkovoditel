"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Upload } from "lucide-react";
import type { QueueItem, StatementRow } from "@/lib/import";
import { uploadAction } from "./actions";

interface Queues {
  payments: QueueItem[];
  lines: QueueItem[];
  receipts: QueueItem[];
  facebk: QueueItem[];
  partial: QueueItem[];
}

export function ImportView({ statements, queues }: { statements: StatementRow[]; queues: Queues }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string[]>([]);

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    setSummary([]);
    startTransition(async () => {
      try {
        const r = await uploadAction(fd);
        setSummary(r.ok ? r.summary : [r.error]);
      } catch {
        setSummary([
          "Датотеките се преголеми за еден upload. Прикачи помалку одеднаш (пр. по 50–100 PDF-и).",
        ]);
      }
      router.refresh();
    });
  }

  const toResolve = queues.payments.length + queues.lines.length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <h3 className="mb-3 flex items-center gap-2 text-[14px] font-extrabold text-ink">
            Изводи
            <span className="rounded-[10px] bg-chip px-2 py-0.5 text-[11px] font-bold text-muted">
              {statements.length}
            </span>
          </h3>
          {statements.length === 0 && (
            <p className="py-3 text-[13px] text-muted-2">Нема внесени изводи.</p>
          )}
          <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto">
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

      {/* Right: link to Решавање + alarm queues */}
      <div className="flex flex-col gap-4">
        <Link
          href="/resolve"
          className="flex items-center justify-between rounded-xl border border-accent-300 bg-accent-50 p-4 hover:bg-accent-200"
        >
          <div>
            <h3 className="text-[14px] font-extrabold text-accent">Решавање</h3>
            <p className="text-[12px] text-muted">
              {queues.payments.length} уплати за спарување · {queues.lines.length} трошоци за
              категоризација
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-accent">
            {toResolve > 0 && (
              <span className="rounded-[10px] bg-warning-50 px-2 py-0.5 text-[11px] text-warning-700">
                {toResolve}
              </span>
            )}
            <ArrowRight size={16} />
          </span>
        </Link>

        <h3 className="text-[14px] font-extrabold text-ink">Редици за внимание</h3>
        <Queue title="Receipts без линија" items={queues.receipts} />
        <Queue title="FACEBK без receipt (аларм)" items={queues.facebk} danger />
        <Queue title="PARTIAL / FAILED" items={queues.partial} danger />
      </div>
    </div>
  );
}

function Queue({ title, items, danger }: { title: string; items: QueueItem[]; danger?: boolean }) {
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
            <div key={it.id} className="rounded-md bg-inset px-2.5 py-1.5 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-ink">{it.title}</span>
                {it.amount && <span className="font-semibold text-muted">{it.amount}</span>}
                <span className="max-w-[40%] truncate text-[11px] text-muted-2">{it.context}</span>
              </div>
            </div>
          ))}
          {items.length > 8 && (
            <p className="text-[11px] text-muted-2">+{items.length - 8} повеќе…</p>
          )}
        </div>
      )}
    </div>
  );
}
