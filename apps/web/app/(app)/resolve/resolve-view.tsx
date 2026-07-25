"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type {
  CategoryOption,
  ChargeOption,
  ClientOption,
  ExpenseGroup,
  ExpenseLineItem,
  LineSource,
  PaymentItem,
} from "@/lib/resolve";
import {
  bulkCategorizeAction,
  categorizeLineAction,
  fifoAction,
  ignoreLineAction,
  linkAccountAction,
  matchPaymentAction,
  recordLoanAction,
} from "./actions";

/** Mark a line as a loan movement (SM-100): expands to a lender-name input, then records it. IN →
 *  "позајмица (примена)", OUT → "поврат на позајмица" — the direction is fixed by the line. */
function LoanControl({
  label,
  pending,
  onLoan,
}: {
  label: string;
  pending: boolean;
  onLoan: (lender: string, note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lender, setLender] = useState("");
  const [note, setNote] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={pending}
        className="mt-1.5 w-full rounded border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:bg-chip disabled:opacity-40"
      >
        {label}
      </button>
    );
  }
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded border border-border-2 bg-surface p-2">
      <p className="text-[11px] font-bold text-ink">{label}</p>
      <input
        value={lender}
        onChange={(e) => setLender(e.target.value)}
        placeholder="Име на заемодавач (приватно лице)"
        list="loan-lenders"
        className="rounded border border-input px-1.5 py-1 text-[11px]"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Забелешка (по желба)"
        className="rounded border border-input px-1.5 py-1 text-[11px]"
      />
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => lender.trim() && onLoan(lender.trim(), note)}
          disabled={pending || lender.trim().length < 2}
          className="flex-1 rounded bg-accent px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
        >
          Запиши
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded border border-border px-2 py-1 text-[11px] font-semibold text-muted"
        >
          Откажи
        </button>
      </div>
    </div>
  );
}

/** Source-document context for a Решавање row: statement № + date + payer/payee account + PDF link. */
function SourceLine({ src }: { src: LineSource }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-2">
      <span className="font-semibold text-muted">Извод {src.statementNumber}</span>
      <span>· {src.date}</span>
      {src.account && <span className="truncate">· {src.account}</span>}
      {src.pdfUrl ? (
        <a
          href={src.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-bold text-accent hover:bg-accent-50"
        >
          <FileText size={11} /> Види извод
        </a>
      ) : (
        src.pdfName && (
          <span
            title={`Оригиналот е импортиран од диск: ${src.pdfName}`}
            className="ml-auto flex items-center gap-1 text-muted-2"
          >
            <FileText size={11} /> {src.pdfName}
          </span>
        )
      )}
    </div>
  );
}

export function ResolveView({
  payments,
  expenseGroups,
  clients,
  openCharges,
  categories,
  lenders,
}: {
  payments: PaymentItem[];
  expenseGroups: ExpenseGroup[];
  clients: ClientOption[];
  openCharges: ChargeOption[];
  categories: CategoryOption[];
  lenders: string[];
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

  const expenseCount = expenseGroups.reduce((s, g) => s + g.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <datalist id="loan-lenders">
        {lenders.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-extrabold text-ink">Решавање</h2>
          <p className="text-[12.5px] text-muted">
            Непрепознаени уплати и трошоци од изводите (§9.4)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className="rounded-md bg-inset px-3 py-1.5 text-[12px] text-ink">{msg}</span>
          )}
          <button
            onClick={() => run(() => fifoAction())}
            disabled={pending}
            className="rounded-md border border-accent-200 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent-50 disabled:opacity-40"
          >
            Раздолжи FIFO
          </button>
        </div>
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
                  onLinkAccount={(clientId) => run(() => linkAccountAction(p.id, clientId))}
                  onLoan={(lender, note) => run(() => recordLoanAction(p.id, lender, note))}
                />
              ))}
            </div>
          )}
        </section>

        {/* Извод-линии за решавање (трошоци) — групирани по продавач/сметка */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold text-ink">Трошоци за категоризација</h3>
            <span className="rounded-[10px] bg-warning-50 px-2 py-0.5 text-[11px] font-bold text-warning-700">
              {expenseCount}
            </span>
          </div>
          {expenseGroups.length === 0 ? (
            <p className="py-2 text-[12.5px] text-muted-2">✓ Нема нерешени трошоци</p>
          ) : (
            <div className="flex flex-col gap-2">
              {expenseGroups.map((g) => (
                <ExpenseGroupCard
                  key={g.key}
                  group={g}
                  categories={categories}
                  pending={pending}
                  onBulk={(cat, learn) =>
                    run(() => bulkCategorizeAction(g.lineIds, cat, learn ? g.learnPattern : null))
                  }
                  onCategorize={(lineId, cat, remember) =>
                    run(() => categorizeLineAction(lineId, cat, remember))
                  }
                  onIgnore={(lineId) => run(() => ignoreLineAction(lineId))}
                  onLoan={(lineId, lender, note) =>
                    run(() => recordLoanAction(lineId, lender, note))
                  }
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
  onLinkAccount,
  onLoan,
}: {
  item: PaymentItem;
  clients: ClientOption[];
  openCharges: ChargeOption[];
  pending: boolean;
  onMatch: (chargeId: string) => void;
  onLinkAccount: (clientId: string) => void;
  onLoan: (lender: string, note: string) => void;
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
      <SourceLine src={item} />
      {item.suggestedClientName && (
        <p className="mt-0.5 text-[11px] font-bold text-success-700">
          → {item.suggestedClientName}
        </p>
      )}

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
      {clientId && item.hasAccount && (
        <button
          onClick={() => onLinkAccount(clientId)}
          disabled={pending}
          title="Ја поврзува сметката на плаќачот со клиентот и ја раздолжува најстарата отворена фактура (FIFO). Идните уплати од таа сметка се раздолжуваат автоматски."
          className="mt-1.5 w-full rounded border border-accent-200 px-2 py-1 text-[11px] font-bold text-accent hover:bg-accent-50 disabled:opacity-40"
        >
          Поврзи ја сметката со клиентот → раздолжи (FIFO)
        </button>
      )}
      <LoanControl label="Позајмица (примена)" pending={pending} onLoan={onLoan} />
    </div>
  );
}

/** A merchant/account group of outgoing lines (SM-99 phase C): bulk-categorize all at once (with an
 *  optional learned rule), or expand to resolve lines individually. A single-line group is just a row. */
function ExpenseGroupCard({
  group,
  categories,
  pending,
  onBulk,
  onCategorize,
  onIgnore,
  onLoan,
}: {
  group: ExpenseGroup;
  categories: CategoryOption[];
  pending: boolean;
  onBulk: (category: string, learn: boolean) => void;
  onCategorize: (lineId: string, category: string, remember: boolean) => void;
  onIgnore: (lineId: string) => void;
  onLoan: (lineId: string, lender: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [bulkCat, setBulkCat] = useState("");
  const [learn, setLearn] = useState(true);

  const rows = group.items.map((item) => (
    <ExpenseRow
      key={item.id}
      item={item}
      categories={categories}
      pending={pending}
      onCategorize={(cat, remember) => onCategorize(item.id, cat, remember)}
      onIgnore={() => onIgnore(item.id)}
      onLoan={(lender, note) => onLoan(item.id, lender, note)}
    />
  ));

  // A lone line needs no grouping ceremony — show it directly.
  if (group.count === 1) return rows[0]!;

  return (
    <div className="rounded-md border border-border-2 bg-inset/50 p-2">
      <div className="flex items-center gap-2 text-[12px]">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="text-muted-2">{expanded ? "▾" : "▸"}</span>
          <span className="truncate font-bold text-ink">{group.label}</span>
          <span className="rounded-[8px] bg-chip px-1.5 py-0.5 text-[10.5px] font-bold text-muted">
            {group.count}
          </span>
          <span className="text-[11px] text-muted-2">
            · {group.kind === "CARD" ? "картични" : "трансфери"}
          </span>
        </button>
        <span className="font-semibold text-muted">−{group.total}</span>
      </div>

      {/* Bulk categorize the whole group */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={bulkCat}
          onChange={(e) => setBulkCat(e.target.value)}
          className="min-w-0 flex-1 rounded border border-input bg-surface px-1.5 py-1 text-[11px]"
        >
          <option value="">Категорија за сите…</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => bulkCat && onBulk(bulkCat, learn)}
          disabled={pending || !bulkCat}
          className="rounded bg-accent px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
        >
          Сите {group.count}
        </button>
      </div>
      {group.learnPattern.length >= 3 && (
        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={learn}
            onChange={(e) => setLearn(e.target.checked)}
            className="h-3 w-3"
          />
          Научи правило ({group.learnPattern})
        </label>
      )}

      {expanded && <div className="mt-2 flex flex-col gap-2">{rows}</div>}
    </div>
  );
}

function ExpenseRow({
  item,
  categories,
  pending,
  onCategorize,
  onIgnore,
  onLoan,
}: {
  item: ExpenseLineItem;
  categories: CategoryOption[];
  pending: boolean;
  onCategorize: (category: string, rememberVendor: boolean) => void;
  onIgnore: () => void;
  onLoan: (lender: string, note: string) => void;
}) {
  const [category, setCategory] = useState("");
  const [remember, setRemember] = useState(true);

  return (
    <div className="rounded-md bg-inset px-2.5 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
        <span className="font-semibold text-muted">{item.amount}</span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-2">
        {item.context}
        {item.bankRef ? ` · ${item.bankRef}` : ""}
      </p>
      <SourceLine src={item} />

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
      <LoanControl label="Поврат на позајмица" pending={pending} onLoan={onLoan} />
    </div>
  );
}
