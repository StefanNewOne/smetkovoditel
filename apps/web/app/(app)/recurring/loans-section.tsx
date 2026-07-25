"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { LoanBalanceRow } from "@/lib/loans";
import { deleteLoanAction } from "./actions";

export function LoansSection({ loans }: { loans: LoanBalanceRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const del = (id: string) =>
    startTransition(async () => {
      const r = await deleteLoanAction(id);
      setMsg(r.ok ? "Записот е вратен во Решавање." : r.error);
      router.refresh();
    });

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[14px] font-extrabold text-ink">Позајмици · по лице</h3>
        {msg && <span className="rounded-md bg-inset px-2.5 py-1 text-[11px] text-ink">{msg}</span>}
      </div>
      <p className="mb-3 text-[11px] text-muted-2">
        Позитивно = фирмата должи (примена − поврат). Негативно = лицето должи (дадена − наплата).
        Не е трошок. Прошири за трансакциите.
      </p>
      {loans.length === 0 ? (
        <p className="py-2 text-[12.5px] text-muted-2">Нема евидентирани позајмици.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {loans.map((l) => (
            <LenderRow key={l.lenderName} row={l} pending={pending} onDelete={del} />
          ))}
        </div>
      )}
    </section>
  );
}

function LenderRow({
  row,
  pending,
  onDelete,
}: {
  row: LoanBalanceRow;
  pending: boolean;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const owes = row.netRaw > 0; // company owes the person
  const settled = row.netRaw === 0;

  return (
    <div className="rounded-md border border-border-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]"
      >
        <span className="text-muted-2">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="min-w-0 flex-1 truncate font-bold text-ink">{row.lenderName}</span>
        <span className="rounded-[8px] bg-chip px-1.5 py-0.5 text-[10.5px] text-muted-2">
          {row.count} трансакции
        </span>
        <span
          className={`font-bold ${settled ? "text-muted-2" : owes ? "text-danger" : "text-success-700"}`}
        >
          {settled ? "порамнето" : `${row.net} ден`}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-3 px-3 py-2">
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-2">
            <span>Примено: {row.received}</span>
            <span>Вратено: {row.repaid}</span>
            <span>Дадено: {row.given}</span>
            <span>Наплатено: {row.collected}</span>
          </div>
          <div className="flex flex-col gap-1">
            {row.txns.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[12px]">
                <span className="w-[64px] shrink-0 font-semibold text-ink">{t.kindLabel}</span>
                <span className="w-[90px] shrink-0 text-right font-bold text-ink">
                  {t.amount} ден
                </span>
                <span className="text-[11px] text-muted-2">{t.date}</span>
                {t.statementNumber != null && (
                  <span className="text-[11px] text-muted-2">· извод {t.statementNumber}</span>
                )}
                {t.note && <span className="truncate text-[11px] text-muted-2">· {t.note}</span>}
                <button
                  onClick={() => onDelete(t.id)}
                  disabled={pending}
                  title="Врати во Решавање (за поправка)"
                  className="ml-auto text-muted-2 hover:text-danger disabled:opacity-40"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
