"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CategoryOption,
  ChargeOption,
  ClientOption,
  ExpenseLineItem,
  PaymentItem,
} from "@/lib/resolve";
import { categorizeLineAction, ignoreLineAction, matchPaymentAction } from "./actions";

export function ResolveView({
  payments,
  expenses,
  clients,
  openCharges,
  categories,
}: {
  payments: PaymentItem[];
  expenses: ExpenseLineItem[];
  clients: ClientOption[];
  openCharges: ChargeOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string>("");

  function run(fn: () => Promise<{ ok: boolean; error?: string; detail?: string }>) {
    setMsg("");
    startTransition(async () => {
      const r = await fn();
      if (!r.ok && r.error) setMsg(r.error);
      else if (r.ok && r.detail) setMsg(r.detail);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-extrabold text-ink">Решавање</h2>
          <p className="text-[12.5px] text-muted">
            Непрепознаени уплати и трошоци од изводите (§9.4)
          </p>
        </div>
        {msg && <span className="rounded-md bg-inset px-3 py-1.5 text-[12px] text-ink">{msg}</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Уплати за спарување */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold text-ink">Уплати за спарување</h3>
            <span className="rounded-[10px] bg-warning-50 px-2 py-0.5 text-[11px] font-bold text-warning-700">
              {payments.length}
            </span>
          </div>
          {payments.length === 0 ? (
            <p className="py-2 text-[12.5px] text-muted-2">✓ Нема неспарени уплати</p>
          ) : (
            <div className="flex flex-col gap-2">
              {payments.map((p) => (
                <PaymentRow
                  key={p.id}
                  item={p}
                  clients={clients}
                  openCharges={openCharges}
                  pending={pending}
                  onMatch={(chargeId) => run(() => matchPaymentAction(p.id, chargeId))}
                />
              ))}
            </div>
          )}
        </section>

        {/* Извод-линии за решавање (трошоци) */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold text-ink">Трошоци за категоризација</h3>
            <span className="rounded-[10px] bg-warning-50 px-2 py-0.5 text-[11px] font-bold text-warning-700">
              {expenses.length}
            </span>
          </div>
          {expenses.length === 0 ? (
            <p className="py-2 text-[12.5px] text-muted-2">✓ Нема нерешени трошоци</p>
          ) : (
            <div className="flex flex-col gap-2">
              {expenses.map((e) => (
                <ExpenseRow
                  key={e.id}
                  item={e}
                  categories={categories}
                  pending={pending}
                  onCategorize={(cat, remember) =>
                    run(() => categorizeLineAction(e.id, cat, remember))
                  }
                  onIgnore={() => run(() => ignoreLineAction(e.id))}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PaymentRow({
  item,
  clients,
  openCharges,
  pending,
  onMatch,
}: {
  item: PaymentItem;
  clients: ClientOption[];
  openCharges: ChargeOption[];
  pending: boolean;
  onMatch: (chargeId: string) => void;
}) {
  const [clientId, setClientId] = useState(item.suggestedClientId ?? "");
  const [chargeId, setChargeId] = useState("");
  const clientCharges = useMemo(
    () => openCharges.filter((c) => c.clientId === clientId),
    [openCharges, clientId],
  );
  const suggestion = item.suggestedChargeId
    ? openCharges.find((c) => c.id === item.suggestedChargeId)
    : undefined;

  return (
    <div className="rounded-md bg-inset px-2.5 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
        <span className="font-semibold text-success-700">{item.amount}</span>
      </div>
      {item.context && <p className="mt-0.5 truncate text-[11px] text-muted-2">{item.context}</p>}

      {/* One-click: exact-amount match to a single open charge (client paid without a повик). */}
      {suggestion && (
        <button
          onClick={() => onMatch(suggestion.id)}
          disabled={pending}
          className="mt-1.5 w-full truncate rounded bg-success-50 px-2 py-1 text-left text-[11px] font-bold text-success-700 hover:brightness-95 disabled:opacity-40"
        >
          ✓ Спари: {suggestion.label}
        </button>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setChargeId("");
          }}
          className="min-w-0 flex-1 rounded border border-input bg-surface px-1.5 py-1 text-[11px]"
        >
          <option value="">Избери клиент…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {clientId && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <select
            value={chargeId}
            onChange={(e) => setChargeId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-input bg-surface px-1.5 py-1 text-[11px]"
          >
            <option value="">
              {clientCharges.length ? "Избери фактура…" : "Нема отворени фактури"}
            </option>
            {clientCharges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => chargeId && onMatch(chargeId)}
            disabled={pending || !chargeId}
            className="rounded bg-accent px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
          >
            Спари
          </button>
        </div>
      )}
    </div>
  );
}

function ExpenseRow({
  item,
  categories,
  pending,
  onCategorize,
  onIgnore,
}: {
  item: ExpenseLineItem;
  categories: CategoryOption[];
  pending: boolean;
  onCategorize: (category: string, rememberVendor: boolean) => void;
  onIgnore: () => void;
}) {
  const [category, setCategory] = useState("");
  const [remember, setRemember] = useState(true);

  return (
    <div className="rounded-md bg-inset px-2.5 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
        <span className="font-semibold text-muted">{item.amount}</span>
      </div>
      {item.context && <p className="mt-0.5 truncate text-[11px] text-muted-2">{item.context}</p>}

      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-w-0 flex-1 rounded border border-input bg-surface px-1.5 py-1 text-[11px]"
        >
          <option value="">Категорија…</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => category && onCategorize(category, remember)}
          disabled={pending || !category}
          className="rounded bg-accent px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
        >
          Категоризирај
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-3 w-3"
          />
          Запомни го продавачот
        </label>
        <button
          onClick={onIgnore}
          disabled={pending}
          className="rounded border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:bg-chip disabled:opacity-40"
        >
          Игнорирај
        </button>
      </div>
    </div>
  );
}
