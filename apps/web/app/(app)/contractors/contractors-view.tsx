"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { WITHHOLDING_RATE, currentPeriod, formatMKD, parseDenari } from "@smetko/shared";
import { Avatar, StatusBadge } from "@/components/ui/badges";
import type { ContractorClient, ContractorView, PaymentView } from "@/lib/contractors";
import { calcHonorarAction, createContractorAction, payoutAction } from "./actions";

function safeDeni(raw: string): number {
  try {
    return raw.trim() ? parseDenari(raw) : 0;
  } catch {
    return 0;
  }
}

const inputCls =
  "mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent";

export function ContractorsView({
  contractors,
  clients,
}: {
  contractors: ContractorView[];
  clients: ContractorClient[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(contractors[0]?.id ?? null);
  const [newOpen, setNewOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selected = contractors.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <div className="rounded-lg bg-accent-50 px-4 py-2.5 text-[12.5px] text-accent-hover">
          {msg}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1.3fr" }}>
        {/* Register */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold text-ink">Регистар</h3>
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
            >
              <Plus size={13} /> Нов
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {contractors.length === 0 && (
              <p className="py-4 text-[13px] text-muted-2">Нема хонорарци.</p>
            )}
            {contractors.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex items-center gap-2.5 rounded-lg p-2.5 text-left ${
                  selectedId === c.id ? "bg-accent-50" : "hover:bg-inset"
                }`}
              >
                <Avatar name={c.name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {c.name} {c.isTalent && "🎬"}
                  </p>
                  <p className="text-[11px] text-muted-2">
                    {c.contractType === "CONTRACTOR_INVOICE" ? "Фактура" : "Договор на дело"} ·{" "}
                    {c.taxMode === "WITHHOLD_10" ? "данок 10%" : "без данок"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Calculation + payments */}
        <div className="flex flex-col gap-4">
          {selected ? (
            <>
              <CalcForm
                contractor={selected}
                clients={clients}
                onDone={(m) => {
                  setMsg(m);
                  router.refresh();
                }}
              />
              <PaymentsList
                contractor={selected}
                onDone={(m) => {
                  setMsg(m);
                  router.refresh();
                }}
              />
            </>
          ) : (
            <div className="rounded-xl border border-border bg-surface p-8 text-[13px] text-muted-2">
              Избери хонорарец лево или додади нов.
            </div>
          )}
        </div>
      </div>

      {newOpen && (
        <NewContractorModal
          onClose={() => setNewOpen(false)}
          onDone={(m) => {
            setNewOpen(false);
            setMsg(m);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

interface AllocRow {
  clientId: string;
  amountRaw: string;
  billable: boolean;
}

function CalcForm({
  contractor,
  clients,
  onDone,
}: {
  contractor: ContractorView;
  clients: ContractorClient[];
  onDone: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [grossRaw, setGrossRaw] = useState("");
  const [allocs, setAllocs] = useState<AllocRow[]>([
    { clientId: "", amountRaw: "", billable: true },
  ]);
  const [error, setError] = useState<string | null>(null);

  const gross = safeDeni(grossRaw);
  const tax = contractor.taxMode === "WITHHOLD_10" ? Math.round(gross * WITHHOLDING_RATE) : 0;
  const net = gross - tax;
  const allocSum = allocs.reduce((s, a) => s + safeDeni(a.amountRaw), 0);
  const balanced = gross > 0 && allocSum === gross;
  const complete = allocs.every((a) => a.clientId && safeDeni(a.amountRaw) > 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await calcHonorarAction({
        contractorId: contractor.id,
        period: currentPeriod(),
        grossAmount: gross,
        allocations: allocs.map((a) => ({
          clientId: a.clientId,
          amount: safeDeni(a.amountRaw),
          billable: a.billable,
        })),
      });
      if (r.ok) {
        setGrossRaw("");
        setAllocs([{ clientId: "", amountRaw: "", billable: true }]);
        onDone("Пресметката е зачувана (CALCULATED).");
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="mb-3 text-[14px] font-extrabold text-ink">
        Нова пресметка · {contractor.name}
      </h3>

      <label className="block text-[12px] font-semibold text-muted">
        Бруто износ (МКД)
        <input
          className={inputCls}
          inputMode="decimal"
          value={grossRaw}
          onChange={(e) => setGrossRaw(e.target.value)}
          placeholder="30.000"
        />
      </label>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-inset p-3 text-[13px]">
        <div>
          <p className="text-[11px] text-muted-2">Бруто</p>
          <p className="font-bold text-ink">{formatMKD(gross, { decimals: 0 })}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-2">
            Данок {contractor.taxMode === "WITHHOLD_10" ? "10%" : "0%"}
          </p>
          <p className="font-bold text-ink">{formatMKD(tax, { decimals: 0 })}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-2">Нето</p>
          <p className="font-bold text-success-700">{formatMKD(net, { decimals: 0 })}</p>
        </div>
      </div>

      <p className="mb-2 mt-4 text-[12px] font-bold text-muted">Алокации по клиент</p>
      <div className="flex flex-col gap-2">
        {allocs.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className={`${inputCls} mt-0 flex-1`}
              value={a.clientId}
              onChange={(e) =>
                setAllocs((p) =>
                  p.map((x, j) => (j === i ? { ...x, clientId: e.target.value } : x)),
                )
              }
            >
              <option value="">— клиент —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className={`${inputCls} mt-0 w-28`}
              inputMode="decimal"
              placeholder="износ"
              value={a.amountRaw}
              onChange={(e) =>
                setAllocs((p) =>
                  p.map((x, j) => (j === i ? { ...x, amountRaw: e.target.value } : x)),
                )
              }
            />
            <button
              type="button"
              onClick={() =>
                setAllocs((p) => p.map((x, j) => (j === i ? { ...x, billable: !x.billable } : x)))
              }
              className={`rounded-md px-2.5 py-2 text-[11px] font-bold ${
                a.billable ? "bg-success-50 text-success-700" : "bg-chip text-muted-2"
              }`}
              title={a.billable ? "билабилно → ACTORS ставка (D2)" : "интерно → само маргина"}
            >
              {a.billable ? "билаб." : "интерно"}
            </button>
            {allocs.length > 1 && (
              <button
                type="button"
                onClick={() => setAllocs((p) => p.filter((_, j) => j !== i))}
                className="text-muted-2 hover:text-danger"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setAllocs((p) => [...p, { clientId: "", amountRaw: "", billable: true }])}
        className="mt-2 text-[12px] font-bold text-accent hover:underline"
      >
        + Додади алокација
      </button>

      <p className={`mt-3 text-[12px] ${balanced ? "text-success-700" : "text-warning-700"}`}>
        Збир алокации: {formatMKD(allocSum, { decimals: 0 })} / {formatMKD(gross, { decimals: 0 })}{" "}
        {balanced ? "✓" : "(мора да е еднаков на бруто)"}
      </p>
      {!contractor.isTalent && (
        <p className="mt-1 text-[11px] text-muted-2">
          Напомена: билабилни алокации создаваат ACTORS ставка само кај 🎬 talent хонорарци (D2).
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger">{error}</p>
      )}

      <button
        onClick={submit}
        disabled={pending || !balanced || !complete}
        className="mt-4 rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Се пресметува…" : "Пресметај"}
      </button>
    </div>
  );
}

function PaymentsList({
  contractor,
  onDone,
}: {
  contractor: ContractorView;
  onDone: (m: string) => void;
}) {
  const [payoutFor, setPayoutFor] = useState<PaymentView | null>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="mb-3 text-[14px] font-extrabold text-ink">Пресметки</h3>
      {contractor.payments.length === 0 && (
        <p className="py-3 text-[13px] text-muted-2">Нема пресметки.</p>
      )}
      <div className="flex flex-col gap-3">
        {contractor.payments.map((p) => (
          <div key={p.id} className="rounded-lg border border-border-2 p-3">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-semibold text-muted">{p.period}</span>
              <span className="text-[13px] text-ink">
                Бруто {formatMKD(p.gross, { decimals: 0 })} · Нето{" "}
                <span className="font-bold">{formatMKD(p.net, { decimals: 0 })}</span> ден
              </span>
              <div className="ml-auto flex items-center gap-2">
                <StatusBadge status={p.status === "PAID" ? "PAID" : "DRAFT"} />
                {p.status === "CALCULATED" && (
                  <button
                    onClick={() => setPayoutFor(p)}
                    className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
                  >
                    Исплати
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {p.allocations.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="flex-1 text-muted">{a.clientName}</span>
                  <span className="text-ink">{formatMKD(a.amount, { decimals: 0 })} ден</span>
                  <span
                    className={`rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${
                      a.billable && contractor.isTalent
                        ? "bg-success-50 text-success-700"
                        : "bg-chip text-muted-2"
                    }`}
                  >
                    {a.billable && contractor.isTalent ? "ACTORS ставка" : "само маргина"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {payoutFor && (
        <PayoutModal
          payment={payoutFor}
          onClose={() => setPayoutFor(null)}
          onDone={(m) => {
            setPayoutFor(null);
            onDone(m);
          }}
        />
      )}
    </div>
  );
}

function PayoutModal({
  payment,
  onClose,
  onDone,
}: {
  payment: PaymentView;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<"CASH" | "BANK">("CASH");
  const [doc, setDoc] = useState("");
  const [error, setError] = useState<string | null>(null);

  const valid = channel === "BANK" || doc.trim().length > 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await payoutAction({
        paymentId: payment.id,
        channel,
        documentNumber: doc.trim() || undefined,
      });
      if (r.ok)
        onDone(
          `Исплатено ${formatMKD(payment.net, { decimals: 0 })} ден. Билабилните алокации создадоа ACTORS ставки (B16).`,
        );
      else setError(r.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(20,30,48,0.45)" }}
    >
      <div className="max-h-[90vh] w-full max-w-[440px] animate-fade-up overflow-y-auto rounded-[18px] bg-surface p-7">
        <h3 className="mb-1 text-[15px] font-extrabold text-ink">Исплата на хонорар</h3>
        <p className="mb-5 text-[12px] text-muted-2">
          Нето за исплата: {formatMKD(payment.net, { decimals: 0 })} ден
        </p>

        <div className="flex gap-2">
          {(["CASH", "BANK"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`flex-1 rounded-lg border-2 py-2.5 text-[13px] font-bold ${
                channel === ch
                  ? "border-accent bg-accent-50 text-accent"
                  : "border-border text-muted"
              }`}
            >
              {ch === "CASH" ? "Благајна" : "Банка"}
            </button>
          ))}
        </div>

        {channel === "CASH" && (
          <label className="mt-3 block text-[12px] font-semibold text-muted">
            Документ (каса-исплати бр.) — B7
            <input className={inputCls} value={doc} onChange={(e) => setDoc(e.target.value)} />
          </label>
        )}

        {error && (
          <p className="mt-3 rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger">{error}</p>
        )}

        <div className="mt-6 flex justify-between">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
          >
            Откажи
          </button>
          <button
            onClick={submit}
            disabled={pending || !valid}
            className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Се исплаќа…" : "Исплати"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewContractorModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [contractType, setContractType] = useState<"DOGOVOR_NA_DELO" | "CONTRACTOR_INVOICE">(
    "DOGOVOR_NA_DELO",
  );
  const [taxMode, setTaxMode] = useState<"WITHHOLD_10" | "NO_WITHHOLDING">("WITHHOLD_10");
  const [isTalent, setIsTalent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await createContractorAction({
        name: name.trim(),
        idNumber: idNumber.trim() || undefined,
        contractType,
        taxMode,
        isTalent,
      });
      if (r.ok) onDone("Хонорарецот е додаден.");
      else setError(r.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(20,30,48,0.45)" }}
    >
      <div className="max-h-[90vh] w-full max-w-[440px] animate-fade-up overflow-y-auto rounded-[18px] bg-surface p-7">
        <h3 className="mb-5 text-[15px] font-extrabold text-ink">Нов хонорарец</h3>
        <label className="block text-[12px] font-semibold text-muted">
          Име
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mt-3 block text-[12px] font-semibold text-muted">
          ЕМБГ/ЕДБ (опционо)
          <input
            className={inputCls}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-[12px] font-semibold text-muted">
          Тип договор
          <select
            className={inputCls}
            value={contractType}
            onChange={(e) => setContractType(e.target.value as typeof contractType)}
          >
            <option value="DOGOVOR_NA_DELO">Договор на дело</option>
            <option value="CONTRACTOR_INVOICE">Фактура од изведувач</option>
          </select>
        </label>
        <label className="mt-3 block text-[12px] font-semibold text-muted">
          Даночен режим
          <select
            className={inputCls}
            value={taxMode}
            onChange={(e) => setTaxMode(e.target.value as typeof taxMode)}
          >
            <option value="WITHHOLD_10">Задржан данок 10%</option>
            <option value="NO_WITHHOLDING">Без данок (само со фактура, B8)</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setIsTalent((v) => !v)}
          className={`mt-3 flex w-full items-center justify-between rounded-lg border p-3 text-left ${
            isTalent ? "border-accent bg-accent-50" : "border-border"
          }`}
        >
          <span className="text-[13px] font-bold text-ink">🎬 Talent (актер) — D2</span>
          <span
            className={`h-5 w-5 rounded-full border-2 text-center text-white ${isTalent ? "border-accent bg-accent" : "border-border"}`}
          >
            {isTalent && "✓"}
          </span>
        </button>

        {error && (
          <p className="mt-3 rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger">{error}</p>
        )}

        <div className="mt-6 flex justify-between">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
          >
            Откажи
          </button>
          <button
            onClick={submit}
            disabled={pending || !name.trim()}
            className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Се додава…" : "Додади"}
          </button>
        </div>
      </div>
    </div>
  );
}
