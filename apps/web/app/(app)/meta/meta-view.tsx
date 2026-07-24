"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, X } from "lucide-react";
import type {
  AdAccountRow,
  ClientOption,
  FacebkLineRow,
  OrphanReceiptRow,
  SpendRow,
} from "@/lib/meta";
import {
  bookFacebkAction,
  deleteReceiptAction,
  ignoreFacebkAction,
  mapAdAccountAction,
  matchReceiptAction,
} from "./actions";

export function MetaView({
  spend,
  adAccounts,
  facebkLines,
  orphanReceipts,
  clientOptions,
  from,
  to,
}: {
  spend: SpendRow[];
  adAccounts: AdAccountRow[];
  facebkLines: FacebkLineRow[];
  orphanReceipts: OrphanReceiptRow[];
  clientOptions: ClientOption[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string>("");
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMsg("");
    startTransition(async () => {
      const r = await fn();
      if (!r.ok && r.error) setMsg(r.error);
      router.refresh();
    });
  };
  const applyDates = () => {
    const q = new URLSearchParams();
    if (f) q.set("from", f);
    if (t) q.set("to", t);
    router.push(`/meta?${q.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-extrabold text-ink">META Реклами</h2>
          <p className="text-[12.5px] text-muted">
            Мета трошок преку НЛБ картичката — потрошено по клиент, нерешени трошоци и фактури.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-[11px] font-semibold text-muted-2">
            Од
            <input
              type="date"
              value={f}
              onChange={(e) => setF(e.target.value)}
              className="mt-0.5 block rounded-md border border-input px-2 py-1.5 text-[12px]"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-2">
            До
            <input
              type="date"
              value={t}
              onChange={(e) => setT(e.target.value)}
              className="mt-0.5 block rounded-md border border-input px-2 py-1.5 text-[12px]"
            />
          </label>
          <button
            onClick={applyDates}
            className="rounded-md bg-accent px-3 py-2 text-[12px] font-bold text-white"
          >
            Филтер
          </button>
          {(from || to) && (
            <button
              onClick={() => router.push("/meta")}
              className="rounded-md border border-border px-3 py-2 text-[12px] font-bold text-muted"
            >
              Ресетирај
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="rounded-lg bg-danger-50 px-4 py-2 text-[12.5px] text-danger">{msg}</div>
      )}

      {/* 1. Потрошено по клиент */}
      <Section title="Потрошено по клиент" count={spend.length}>
        {spend.length === 0 ? (
          <Empty>Нема Мета трошоци за периодот.</Empty>
        ) : (
          <div className="flex flex-col">
            {spend.map((s) => (
              <div
                key={s.clientId ?? "own"}
                className="flex items-center justify-between border-b border-border-3 px-4 py-2.5 text-[13px] last:border-0"
              >
                <span
                  className={s.clientId ? "font-semibold text-ink" : "font-semibold text-muted"}
                >
                  {s.clientName}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-2">{s.count} трошоци</span>
                  <span className="font-bold text-ink">{s.total} ден</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 2. Ad-сметки → клиент */}
      <Section title="Ad-сметки → клиент" count={adAccounts.length}>
        <div className="flex flex-col">
          {adAccounts.map((a) => (
            <div
              key={a.metaAccountId}
              className="flex flex-wrap items-center gap-2 border-b border-border-3 px-4 py-2.5 text-[13px] last:border-0"
            >
              <span className="font-semibold text-ink">{a.name}</span>
              <span className="text-[11px] text-muted-2">{a.metaAccountId}</span>
              <select
                value={a.clientId ?? ""}
                onChange={(e) =>
                  run(() => mapAdAccountAction(a.metaAccountId, e.target.value || null))
                }
                disabled={pending}
                className="ml-auto min-w-[180px] rounded-md border border-input bg-surface px-2 py-1.5 text-[12px]"
              >
                <option value="">Сопствен маркетинг</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. FACEBK без receipt */}
      <Section title="FACEBK без receipt (нерешени трошоци)" count={facebkLines.length} danger>
        {facebkLines.length === 0 ? (
          <Empty>✓ Нема нерешени FACEBK трошоци.</Empty>
        ) : (
          <div className="flex max-h-[420px] flex-col overflow-y-auto">
            {facebkLines.map((l) => (
              <FacebkRow key={l.id} line={l} clients={clientOptions} pending={pending} run={run} />
            ))}
          </div>
        )}
      </Section>

      {/* 4. Receipts без линија */}
      <Section title="Receipts без банкарска линија" count={orphanReceipts.length} danger>
        {orphanReceipts.length === 0 ? (
          <Empty>✓ Нема сирачиња фактури.</Empty>
        ) : (
          <div className="flex flex-col">
            {orphanReceipts.map((r) => (
              <ReceiptRow key={r.id} receipt={r} lines={facebkLines} pending={pending} run={run} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function FacebkRow({
  line,
  clients,
  pending,
  run,
}: {
  line: FacebkLineRow;
  clients: ClientOption[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [clientId, setClientId] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-3 px-4 py-2 text-[12.5px] last:border-0">
      <span className="text-muted-2">{line.date}</span>
      <span className="font-bold text-ink">−{line.amount}</span>
      <span className="text-[11px] text-muted-2">
        {line.reference} · извод {line.statementNumber}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="min-w-[150px] rounded-md border border-input bg-surface px-2 py-1 text-[11px]"
        >
          <option value="">Сопствен маркетинг…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => run(() => bookFacebkAction(line.id, clientId || null))}
          disabled={pending}
          className="rounded bg-accent px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40"
        >
          Книжи
        </button>
        <button
          onClick={() => run(() => ignoreFacebkAction(line.id))}
          disabled={pending}
          className="rounded border border-border px-2 py-1 text-[11px] font-semibold text-muted disabled:opacity-40"
        >
          Игнорирај
        </button>
      </div>
    </div>
  );
}

function ReceiptRow({
  receipt,
  lines,
  pending,
  run,
}: {
  receipt: OrphanReceiptRow;
  lines: FacebkLineRow[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [lineId, setLineId] = useState("");
  const hasPdf = receipt.attachmentUrl?.startsWith("/api/");
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-3 px-4 py-2 text-[12.5px] last:border-0">
      <span className="font-semibold text-ink">{receipt.accountName}</span>
      <span className="text-[11px] text-muted-2">
        {receipt.reference} · {receipt.usd} · {receipt.date}
      </span>
      {hasPdf && (
        <a
          href={receipt.attachmentUrl!}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"
        >
          <ExternalLink size={12} /> PDF
        </a>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <select
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
          className="min-w-[150px] rounded-md border border-input bg-surface px-2 py-1 text-[11px]"
        >
          <option value="">Спари со линија…</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.date} · −{l.amount} · {l.reference}
            </option>
          ))}
        </select>
        <button
          onClick={() => lineId && run(() => matchReceiptAction(receipt.id, lineId))}
          disabled={pending || !lineId}
          className="rounded bg-accent px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40"
        >
          Спари
        </button>
        <button
          onClick={() => run(() => deleteReceiptAction(receipt.id))}
          disabled={pending}
          className="rounded border border-danger-50 px-2 py-1 text-[11px] font-bold text-danger disabled:opacity-40"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  danger,
  children,
}: {
  title: string;
  count: number;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border-2 px-4 py-3">
        <h3 className="text-[14px] font-extrabold text-ink">{title}</h3>
        <span
          className={`rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${
            count === 0
              ? "bg-success-50 text-success-700"
              : danger
                ? "bg-danger-50 text-danger"
                : "bg-chip text-muted"
          }`}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[13px] text-muted-2">{children}</p>;
}
