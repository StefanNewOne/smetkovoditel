"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardCheck, Plus } from "lucide-react";
import { formatMKD, parseDenari } from "@smetko/shared";
import type { CashEntryRow, CollectClient } from "@/lib/cash";
import { collectCashAction, stocktakeAction } from "./actions";

interface Ledger {
  balance: number;
  periodIn: number;
  periodOut: number;
  entries: CashEntryRow[];
}

const DOC_LABEL: Record<string, string> = {
  FISCAL: "ФИСКАЛНА",
  KASA_PRIMI: "КАСА-ПРИМИ",
  KASA_ISPLATI: "КАСА-ИСПЛАТИ",
};

function safeDeni(raw: string): number {
  try {
    return raw.trim() ? parseDenari(raw) : 0;
  } catch {
    return 0;
  }
}

export function CashView({
  ledger,
  clients,
}: {
  period: string;
  ledger: Ledger;
  clients: CollectClient[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Салдо благајна" value={ledger.balance} sub="B3: никогаш негативна" />
        <Kpi label="Влез (месец)" value={ledger.periodIn} positive />
        <Kpi label="Излез (месец)" value={ledger.periodOut} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setStockOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[12px] font-bold text-muted hover:bg-inset"
        >
          <ClipboardCheck size={14} /> Попис
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => router.push("/expense")}
            className="flex items-center gap-1.5 rounded-md border border-accent-200 px-3.5 py-2 text-[12px] font-bold text-accent hover:bg-accent-50"
          >
            <Camera size={14} /> Кеш-трошок (мобилен)
          </button>
          <button
            onClick={() => setCollectOpen(true)}
            disabled={clients.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            <Plus size={15} /> Наплати кеш
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
          className="grid min-w-[720px] items-center gap-3 border-b border-border-2 px-5.5 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2"
          style={{ gridTemplateColumns: "90px 1.8fr 1.2fr 1fr 110px 40px" }}
        >
          <span>Датум</span>
          <span>Опис</span>
          <span>Документ</span>
          <span>Страна</span>
          <span className="text-right">Износ</span>
          <span />
        </div>
        {ledger.entries.length === 0 && (
          <p className="px-5.5 py-8 text-center text-[13px] text-muted-2">
            Нема ставки во дневникот.
          </p>
        )}
        {ledger.entries.map((e) => (
          <div
            key={e.id}
            className="grid min-w-[720px] items-center gap-3 border-b border-border-3 px-5.5 py-3 text-[13px] last:border-0"
            style={{ gridTemplateColumns: "90px 1.8fr 1.2fr 1fr 110px 40px" }}
          >
            <span className="text-[12px] text-muted">{e.date}</span>
            <span className="text-ink">{e.description}</span>
            <span className="text-[11.5px] text-muted">
              {DOC_LABEL[e.documentType] ?? e.documentType}
              {e.documentNumber ? ` бр. ${e.documentNumber}` : ""}
            </span>
            <span className="text-[12px] text-muted-2">{e.counterpartyType}</span>
            <span
              className={`text-right font-bold ${e.direction === "IN" ? "text-success" : "text-danger"}`}
            >
              {e.direction === "IN" ? "+" : "−"}
              {formatMKD(e.amount, { decimals: 0 })}
            </span>
            <span className="text-center text-muted-2">{e.hasAttachment ? "📎" : ""}</span>
          </div>
        ))}
      </div>

      {collectOpen && (
        <CollectModal
          clients={clients}
          pending={pending}
          onClose={() => setCollectOpen(false)}
          onSubmit={(input) => {
            setMsg(null);
            startTransition(async () => {
              const r = await collectCashAction(input);
              if (r.ok) {
                setCollectOpen(false);
                setMsg("Кеш наплата запишана.");
                router.refresh();
              } else {
                setMsg(r.error);
              }
            });
          }}
        />
      )}

      {stockOpen && (
        <StocktakeModal
          computed={ledger.balance}
          pending={pending}
          onClose={() => setStockOpen(false)}
          onSubmit={(counted) => {
            setMsg(null);
            startTransition(async () => {
              const r = await stocktakeAction(counted);
              if (r.ok) {
                setStockOpen(false);
                setMsg("Пописот е евидентиран.");
                router.refresh();
              } else {
                setMsg(r.error);
              }
            });
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: number;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5.5 py-5">
      <p className="text-[12px] font-semibold text-muted-2">{label}</p>
      <p className={`mt-1 text-[26px] font-extrabold ${positive ? "text-success" : "text-ink"}`}>
        {formatMKD(value, { decimals: 0 })} ден
      </p>
      {sub && <p className="mt-1 text-[12px] text-muted-2">{sub}</p>}
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent";

function CollectModal({
  clients,
  pending,
  onClose,
  onSubmit,
}: {
  clients: CollectClient[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: {
    clientId: string;
    chargeId: string;
    amount: number;
    fiscalNumber: string;
  }) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [chargeId, setChargeId] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [fiscal, setFiscal] = useState("");

  const client = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);
  const charge = client?.charges.find((ch) => ch.id === chargeId);
  const amount = safeDeni(amountRaw);
  const valid = clientId && chargeId && amount > 0 && fiscal.trim().length > 0;

  return (
    <Modal title="Наплати кеш (W3)" onClose={onClose}>
      <label className="block text-[12px] font-semibold text-muted">
        Клиент
        <select
          className={inputCls}
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setChargeId("");
            setAmountRaw("");
          }}
        >
          <option value="">— избери —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {client && (
        <label className="mt-3 block text-[12px] font-semibold text-muted">
          Задолжување
          <select
            className={inputCls}
            value={chargeId}
            onChange={(e) => {
              setChargeId(e.target.value);
              const ch = client.charges.find((x) => x.id === e.target.value);
              setAmountRaw(ch ? formatMKD(ch.remaining, { decimals: 0 }) : "");
            }}
          >
            <option value="">— избери —</option>
            {client.charges.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.label} · остаток {formatMKD(ch.remaining, { decimals: 0 })} ден
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-3 block text-[12px] font-semibold text-muted">
        Износ (МКД)
        <input
          className={inputCls}
          inputMode="decimal"
          value={amountRaw}
          onChange={(e) => setAmountRaw(e.target.value)}
        />
      </label>
      {charge && amount > charge.remaining && (
        <p className="mt-1 text-[11px] text-warning-700">
          Преплата {formatMKD(amount - charge.remaining, { decimals: 0 })} ден → creditBalance
          (B18).
        </p>
      )}

      <label className="mt-3 block text-[12px] font-semibold text-muted">
        Фискален број (D6)
        <input className={inputCls} value={fiscal} onChange={(e) => setFiscal(e.target.value)} />
      </label>

      <div className="mt-6 flex justify-between">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
        >
          Откажи
        </button>
        <button
          disabled={!valid || pending}
          onClick={() => onSubmit({ clientId, chargeId, amount, fiscalNumber: fiscal.trim() })}
          className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Се запишува…" : "Наплати"}
        </button>
      </div>
    </Modal>
  );
}

function StocktakeModal({
  computed,
  pending,
  onClose,
  onSubmit,
}: {
  computed: number;
  pending: boolean;
  onClose: () => void;
  onSubmit: (counted: number) => void;
}) {
  const [raw, setRaw] = useState("");
  const counted = safeDeni(raw);
  const diff = counted - computed;

  return (
    <Modal title="Попис на благајна" onClose={onClose}>
      <div className="rounded-lg bg-inset p-4 text-[13px]">
        <div className="flex justify-between py-1">
          <span className="text-muted">Пресметано салдо</span>
          <span className="font-bold text-ink">{formatMKD(computed, { decimals: 0 })} ден</span>
        </div>
      </div>
      <label className="mt-3 block text-[12px] font-semibold text-muted">
        Физички изброено (МКД)
        <input
          className={inputCls}
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </label>
      {raw.trim() && (
        <p className={`mt-2 text-[12px] ${diff === 0 ? "text-success-700" : "text-warning-700"}`}>
          Разлика: {diff === 0 ? "0 (се совпаѓа)" : `${formatMKD(diff, { decimals: 0 })} ден`}
        </p>
      )}
      <div className="mt-6 flex justify-between">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
        >
          Откажи
        </button>
        <button
          disabled={!raw.trim() || pending}
          onClick={() => onSubmit(counted)}
          className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          Евидентирај попис
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
