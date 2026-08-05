"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock, Play, X } from "lucide-react";
import { formatMKD, parseDenari, shiftPeriod } from "@smetko/shared";
import { StatusBadge } from "@/components/ui/badges";
import type { ChargeRow, PaymentOption } from "@/lib/charges";
import {
  approveAllDrafts,
  approveCharge,
  closePeriodAction,
  collectCashOnChargeAction,
  creditNote,
  deleteChargeAction,
  editChargeAction,
  loadChargeForEditAction,
  matchInvoiceLineAction,
  runW1,
} from "./actions";

interface CloseBlocker {
  key: string;
  label: string;
  count: number;
}

const COLS = "1.6fr 1.2fr 0.9fr 0.9fr 1fr 1.4fr";

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
  blockers,
  closed,
  unmatchedPayments,
}: {
  period: string;
  charges: ChargeRow[];
  blockers: CloseBlocker[];
  closed: boolean;
  unmatchedPayments: PaymentOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cnFor, setCnFor] = useState<ChargeRow | null>(null);
  const [payFor, setPayFor] = useState<ChargeRow | null>(null);
  const [cashFor, setCashFor] = useState<ChargeRow | null>(null);
  const [delFor, setDelFor] = useState<ChargeRow | null>(null);
  const [editFor, setEditFor] = useState<ChargeRow | null>(null);

  const deleteNow = (c: ChargeRow) =>
    run(async () => {
      const r = await deleteChargeAction(c.id);
      setDelFor(null);
      if (!r.ok) setMsg(r.error);
    });

  const go = (p: string) => router.push(`/charges?period=${p}`);
  const run = (fn: () => Promise<void>) => {
    setMsg(null);
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  const invoices = charges.filter((c) => c.kind !== "CASH_OBLIGATION");
  const cash = charges.filter((c) => c.kind === "CASH_OBLIGATION");

  const rowActions = {
    closed,
    pending,
    onApprove: (c: ChargeRow) =>
      run(async () => {
        const r = await approveCharge(c.id);
        setMsg(
          r.ok ? (r.invoiceNumber ? `Фактура ${r.invoiceNumber} издадена.` : "Одобрено.") : r.error,
        );
      }),
    // Issued invoice (has a number) → double-confirm; drafts / cash obligations delete directly.
    onDelete: (c: ChargeRow) => (c.invoiceNumber ? setDelFor(c) : deleteNow(c)),
    onPay: (c: ChargeRow) => setPayFor(c),
    onCollect: (c: ChargeRow) => setCashFor(c),
    onCreditNote: (c: ChargeRow) => setCnFor(c),
    onEdit: (c: ChargeRow) => setEditFor(c),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <button
          onClick={() => setCloseOpen(true)}
          disabled={closed}
          className="ml-auto rounded-md border border-border px-3.5 py-2 text-[12px] font-bold text-muted hover:bg-inset disabled:opacity-40"
        >
          Затвори период
        </button>
      </div>

      {msg && (
        <div className="rounded-lg bg-accent-50 px-4 py-2.5 text-[12.5px] text-accent-hover">
          {msg}
        </div>
      )}

      <ChargeSection
        title="Фактури"
        channel="INVOICE"
        rows={invoices}
        actions={rowActions}
        onRunW1={() =>
          run(async () => {
            const r = await runW1(period, "INVOICE");
            setMsg(
              r.ok ? `W1 фактури: ${r.created} создадени, ${r.skipped} прескокнати.` : r.error,
            );
          })
        }
        onApproveAll={() =>
          run(async () => {
            const r = await approveAllDrafts(period, "INVOICE");
            setMsg(
              r.failed
                ? `Издадени ${r.approved}, ${r.failed} неуспешни: ${r.firstError ?? ""}`
                : `Издадени ${r.approved} фактури.`,
            );
          })
        }
      />

      <ChargeSection
        title="Кеш"
        channel="CASH"
        rows={cash}
        actions={rowActions}
        onRunW1={() =>
          run(async () => {
            const r = await runW1(period, "CASH");
            setMsg(r.ok ? `W1 кеш: ${r.created} создадени, ${r.skipped} прескокнати.` : r.error);
          })
        }
        onApproveAll={() =>
          run(async () => {
            const r = await approveAllDrafts(period, "CASH");
            setMsg(
              r.failed
                ? `Одобрени ${r.approved}, ${r.failed} неуспешни: ${r.firstError ?? ""}`
                : `Одобрени ${r.approved} кеш обврски.`,
            );
          })
        }
      />

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

      {payFor && (
        <PayModal
          charge={payFor}
          payments={unmatchedPayments}
          pending={pending}
          onClose={() => setPayFor(null)}
          onSubmit={(lineId) =>
            run(async () => {
              const r = await matchInvoiceLineAction(payFor.id, lineId);
              setPayFor(null);
              setMsg(r.ok ? "Фактурата е спарена со уплата." : r.error);
            })
          }
        />
      )}

      {cashFor && (
        <CashModal
          charge={cashFor}
          pending={pending}
          onClose={() => setCashFor(null)}
          onSubmit={(amount, fiscalNumber) =>
            run(async () => {
              const r = await collectCashOnChargeAction(cashFor.id, amount, fiscalNumber);
              setCashFor(null);
              setMsg(r.ok ? "Кеш наплата запишана." : r.error);
            })
          }
        />
      )}

      {delFor && (
        <Modal title="Избриши издадена фактура" onClose={() => setDelFor(null)}>
          <p className="mb-4 text-[12.5px] text-muted">
            Ќе ја избришеш издадената фактура <b>{delFor.invoiceNumber}</b> (
            {formatMKD(delFor.total, { decimals: 0 })} ден). Ова остава празнина во низата на броеви
            — направи го само ако фактурата е одобрена по грешка. Уплатите се ослободуваат за
            повторно спарување.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDelFor(null)}
              className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
            >
              Откажи
            </button>
            <button
              disabled={pending}
              onClick={() => deleteNow(delFor)}
              className="rounded-md bg-danger px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              Избриши трајно
            </button>
          </div>
        </Modal>
      )}

      {editFor && (
        <EditChargeModal
          charge={editFor}
          pending={pending}
          onClose={() => setEditFor(null)}
          onSaved={(m) => {
            setEditFor(null);
            setMsg(m);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DeleteBtn({ actions, c }: { actions: RowActions; c: ChargeRow }) {
  return (
    <button
      onClick={() => actions.onDelete(c)}
      disabled={actions.pending || actions.closed}
      className="text-[12px] font-bold text-danger hover:underline disabled:opacity-40"
    >
      Избриши
    </button>
  );
}

interface RowActions {
  closed: boolean;
  pending: boolean;
  onApprove: (c: ChargeRow) => void;
  onDelete: (c: ChargeRow) => void;
  onPay: (c: ChargeRow) => void;
  onCollect: (c: ChargeRow) => void;
  onCreditNote: (c: ChargeRow) => void;
  onEdit: (c: ChargeRow) => void;
}

function ChargeSection({
  title,
  channel,
  rows,
  actions,
  onRunW1,
  onApproveAll,
}: {
  title: string;
  channel: "INVOICE" | "CASH";
  rows: ChargeRow[];
  actions: RowActions;
  onRunW1: () => void;
  onApproveAll: () => void;
}) {
  const drafts = rows.filter((r) => r.status === "DRAFT").length;
  const isInvoice = channel === "INVOICE";
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-2 px-5 py-3">
        <h3 className="text-[14px] font-extrabold text-ink">{title}</h3>
        <span className="rounded-[10px] bg-chip px-2 py-0.5 text-[11px] font-bold text-muted">
          {rows.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onRunW1}
            disabled={actions.pending || actions.closed}
            className="flex items-center gap-1.5 rounded-md border border-accent-200 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent-50 disabled:opacity-40"
          >
            <Play size={12} /> Изврши
          </button>
          <button
            onClick={onApproveAll}
            disabled={actions.pending || drafts === 0 || actions.closed}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            Одобри DRAFT ({drafts})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          className="hidden min-w-[720px] items-center border-b border-border-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2 md:grid"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Клиент</span>
          <span>Број</span>
          <span className="text-right">Основица</span>
          <span className="text-right">Вкупно</span>
          <span>Статус</span>
          <span className="text-right">Акција</span>
        </div>
        {rows.length === 0 && (
          <p className="px-5 py-6 text-center text-[13px] text-muted-2">Нема ставки.</p>
        )}
        {rows.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-1.5 border-b border-border-3 px-4 py-3 text-[13px] last:border-0 md:grid md:min-w-[720px] md:items-center md:gap-0 md:px-5"
            style={{ gridTemplateColumns: COLS }}
          >
            <span className="flex items-center justify-between gap-2 md:block">
              <span className="font-bold text-ink">{c.clientName}</span>
              <span className="md:hidden">
                <StatusBadge status={c.status} />
              </span>
            </span>
            <span className="text-[12px]">
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
              {c.internalRef && <span className="ml-1.5 text-muted-2">({c.internalRef})</span>}
            </span>
            <span className="text-left text-ink md:text-right">
              <span className="text-muted-2 md:hidden">Основица: </span>
              {formatMKD(c.subtotal, { decimals: 0 })}
            </span>
            <span className="text-left font-bold text-ink md:text-right">
              <span className="font-normal text-muted-2 md:hidden">Вкупно: </span>
              {formatMKD(c.total, { decimals: 0 })}
            </span>
            <span className="hidden md:block">
              <StatusBadge status={c.status} />
            </span>
            <span className="flex items-center justify-start gap-2 md:justify-end">
              {c.status === "DRAFT" ? (
                <>
                  <button
                    onClick={() => actions.onEdit(c)}
                    disabled={actions.pending || actions.closed}
                    className="rounded-[7px] border border-border px-3 py-1.5 text-[12px] font-bold text-muted hover:bg-inset disabled:opacity-40"
                  >
                    Едитирај
                  </button>
                  <button
                    onClick={() => actions.onApprove(c)}
                    disabled={actions.pending || actions.closed}
                    className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    Одобри
                  </button>
                  <button
                    onClick={() => actions.onDelete(c)}
                    disabled={actions.pending || actions.closed}
                    className="text-[12px] font-bold text-danger hover:underline disabled:opacity-40"
                  >
                    Избриши
                  </button>
                </>
              ) : c.status === "PAID" ? (
                <>
                  <span className="text-[12px] font-bold text-success-700">✓ Платено</span>
                  <DeleteBtn actions={actions} c={c} />
                </>
              ) : isInvoice && c.kind === "INVOICE" ? (
                <>
                  <button
                    onClick={() => actions.onPay(c)}
                    disabled={actions.pending || actions.closed}
                    className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    Наплати
                  </button>
                  <button
                    onClick={() => actions.onCreditNote(c)}
                    disabled={actions.closed}
                    className="text-[12px] font-bold text-muted hover:text-accent disabled:opacity-40"
                  >
                    Одобрение
                  </button>
                  <DeleteBtn actions={actions} c={c} />
                </>
              ) : !isInvoice ? (
                <>
                  <button
                    onClick={() => actions.onCollect(c)}
                    disabled={actions.pending || actions.closed}
                    className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    Наплата кеш
                  </button>
                  <DeleteBtn actions={actions} c={c} />
                </>
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

function PayModal({
  charge,
  payments,
  pending,
  onClose,
  onSubmit,
}: {
  charge: ChargeRow;
  payments: PaymentOption[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (lineId: string) => void;
}) {
  const [lineId, setLineId] = useState("");
  return (
    <Modal
      title={`Наплати · ${charge.invoiceNumber ?? charge.internalRef ?? ""}`}
      onClose={onClose}
    >
      <p className="mb-3 text-[12px] text-muted-2">
        Остаток: {formatMKD(charge.total - charge.paidAmount, { decimals: 0 })} ден. Избери ја
        влезната уплата од изводот што ја покрива оваа фактура.
      </p>
      <select
        value={lineId}
        onChange={(e) => setLineId(e.target.value)}
        className="w-full rounded-md border border-input px-3 py-2.5 text-[13px]"
      >
        <option value="">Избери уплата од извод…</option>
        {payments.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <div className="mt-5 flex justify-between">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
        >
          Откажи
        </button>
        <button
          disabled={pending || !lineId}
          onClick={() => onSubmit(lineId)}
          className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          Спари и наплати
        </button>
      </div>
    </Modal>
  );
}

function CashModal({
  charge,
  pending,
  onClose,
  onSubmit,
}: {
  charge: ChargeRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (amount: number, fiscalNumber: string) => void;
}) {
  const remaining = charge.total - charge.paidAmount;
  const [raw, setRaw] = useState(String(remaining / 100).replace(".", ","));
  const [fiscal, setFiscal] = useState("");
  const amount = safeDeni(raw);
  return (
    <Modal title={`Наплата кеш · ${charge.clientName}`} onClose={onClose}>
      <p className="mb-3 text-[12px] text-muted-2">
        Должи: {formatMKD(remaining, { decimals: 0 })} ден · платено досега{" "}
        {formatMKD(charge.paidAmount, { decimals: 0 })} ден
      </p>
      <label className="block text-[12px] font-semibold text-muted">
        Примен кеш (МКД)
        <input
          className="mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-[12px] font-semibold text-muted">
        Број од фискален уред (D6)
        <input
          className="mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
          value={fiscal}
          onChange={(e) => setFiscal(e.target.value)}
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
          disabled={pending || amount <= 0 || !fiscal.trim()}
          onClick={() => onSubmit(amount, fiscal.trim())}
          className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          Запиши наплата
        </button>
      </div>
    </Modal>
  );
}

function EditChargeModal({
  charge,
  pending,
  onClose,
  onSaved,
}: {
  charge: ChargeRow;
  pending: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [lines, setLines] = useState<{ description: string; amountRaw: string }[]>([]);
  const [passthrough, setPassthrough] = useState<{ description: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, startSave] = useTransition();

  useEffect(() => {
    loadChargeForEditAction(charge.id).then((r) => {
      if (r.ok) {
        setLines(
          r.data.editableLines.length > 0
            ? r.data.editableLines.map((l) => ({
                description: l.description,
                amountRaw: String(l.amount / 100).replace(".", ","),
              }))
            : [{ description: "Услуга", amountRaw: "" }],
        );
        setPassthrough(r.data.passthrough);
      } else setErr(r.error);
      setLoading(false);
    });
  }, [charge.id]);

  const isInvoice = charge.kind === "INVOICE";
  const amounts = [...lines.map((l) => safeDeni(l.amountRaw)), ...passthrough.map((p) => p.amount)];
  const subtotal = amounts.reduce((s, a) => s + a, 0);
  const vat = isInvoice ? amounts.reduce((s, a) => s + Math.round(a * 0.18), 0) : 0;
  const total = subtotal + vat;
  const setLine = (i: number, patch: Partial<{ description: string; amountRaw: string }>) =>
    setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () =>
    startSave(async () => {
      setErr("");
      const payload = lines
        .map((l) => ({ description: l.description.trim(), amount: safeDeni(l.amountRaw) }))
        .filter((l) => l.description);
      if (payload.length === 0) {
        setErr("Внеси барем една ставка.");
        return;
      }
      const r = await editChargeAction(charge.id, payload);
      if (r.ok) onSaved("Задолжувањето е ажурирано.");
      else setErr(r.error);
    });

  return (
    <Modal title={`Едитирај · ${charge.clientName}`} onClose={onClose}>
      {loading ? (
        <p className="text-[13px] text-muted-2">Вчитувам…</p>
      ) : (
        <>
          <p className="mb-2 text-[11.5px] text-muted-2">
            Промени ја цената или додади ставка. ДДВ и вкупното се пресметуваат автоматски.
          </p>
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  placeholder={i === 0 ? "Услуга" : "Опис на ставка"}
                  className="min-w-0 flex-1 rounded-md border border-input px-2.5 py-1.5 text-[12.5px]"
                />
                <input
                  value={l.amountRaw}
                  onChange={(e) => setLine(i, { amountRaw: e.target.value })}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="w-28 rounded-md border border-input px-2.5 py-1.5 text-right text-[12.5px]"
                />
                {lines.length > 1 && (
                  <button
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="text-muted-2 hover:text-danger"
                    title="Отстрани ставка"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setLines([...lines, { description: "", amountRaw: "" }])}
              className="self-start text-[12px] font-semibold text-accent hover:underline"
            >
              + Додади ставка
            </button>
          </div>

          {passthrough.length > 0 && (
            <div className="mt-3 rounded-lg bg-inset px-3 py-2 text-[11.5px] text-muted-2">
              <p className="mb-1 font-semibold">Автоматски ставки (не се едитираат):</p>
              {passthrough.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>{p.description}</span>
                  <span>{formatMKD(p.amount, { decimals: 0 })} ден</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-0.5 text-[12.5px]">
            <div className="flex justify-between text-muted">
              <span>Основица</span>
              <span>{formatMKD(subtotal, { decimals: 0 })} ден</span>
            </div>
            {isInvoice && (
              <div className="flex justify-between text-muted">
                <span>ДДВ 18%</span>
                <span>{formatMKD(vat, { decimals: 0 })} ден</span>
              </div>
            )}
            <div className="flex justify-between text-[14px] font-extrabold text-ink">
              <span>Вкупно</span>
              <span>{formatMKD(total, { decimals: 0 })} ден</span>
            </div>
          </div>

          {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}

          <div className="mt-5 flex justify-between">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
            >
              Откажи
            </button>
            <button
              disabled={saving || pending}
              onClick={save}
              className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Зачувувам…" : "Зачувај"}
            </button>
          </div>
        </>
      )}
    </Modal>
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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-[460px] animate-fade-up overflow-y-auto rounded-[18px] bg-surface p-7"
      >
        <h3 className="mb-4 text-[15px] font-extrabold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}
