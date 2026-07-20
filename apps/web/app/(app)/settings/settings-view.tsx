"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { parseDenari } from "@smetko/shared";
import type { EmployeeRow, PayrollRunRow } from "@/lib/settings";
import { createEmployeeAction, runPayrollAction } from "./actions";

interface Config {
  vat: string;
  vendorRules: number;
  bank: string;
  nextNumber: string;
}

function safeDeni(raw: string): number {
  try {
    return raw.trim() ? parseDenari(raw) : 0;
  } catch {
    return 0;
  }
}

export function SettingsView({
  period,
  employees,
  runs,
  config,
}: {
  period: string;
  employees: EmployeeRow[];
  runs: PayrollRunRow[];
  config: Config;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const runPayroll = () =>
    startTransition(async () => {
      const r = await runPayrollAction(period);
      setMsg(r.ok ? `Плата за ${period} извршена.` : r.error);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <div className="rounded-lg bg-accent-50 px-4 py-2.5 text-[12.5px] text-accent-hover">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <ConfigCard label="ДДВ" value={config.vat} />
        <ConfigCard label="Банка и салда" value={config.bank} />
        <ConfigCard label="Следен фактурен број" value={config.nextNumber} />
        <ConfigCard label="Vendor правила" value={`${config.vendorRules} активни`} />
        <ConfigCard label="RBAC" value="admin (Кекиќ)" />
        <ConfigCard label="Ad акаунти" value="во клиент-профили" />
      </div>

      {/* Payroll (плати) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold text-ink">Вработени (плата)</h3>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
            >
              <Plus size={13} /> Нов
            </button>
          </div>
          {employees.length === 0 ? (
            <p className="py-3 text-[13px] text-muted-2">Нема вработени.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {employees.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg bg-inset px-3 py-2 text-[13px]"
                >
                  <span className="font-semibold text-ink">
                    {e.name}{" "}
                    {e.position && <span className="text-[11px] text-muted-2">· {e.position}</span>}
                  </span>
                  <span className="font-bold text-ink">{e.gross} ден</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-extrabold text-ink">Плати по период</h3>
            <button
              onClick={runPayroll}
              disabled={pending || employees.length === 0}
              className="rounded-md border border-accent-200 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent-50 disabled:opacity-40"
            >
              Изврши плата {period}
            </button>
          </div>
          {runs.length === 0 ? (
            <p className="py-3 text-[13px] text-muted-2">Нема извршени плати.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg bg-inset px-3 py-2 text-[13px]"
                >
                  <span className="font-semibold text-ink">{r.period}</span>
                  <span className="text-[11px] text-muted-2">{r.employees} вработени</span>
                  <span className="ml-auto font-bold text-ink">{r.totalGross} ден</span>
                  <span className="rounded-[10px] bg-success-50 px-2 py-0.5 text-[11px] font-bold text-success-700">
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <AddEmployeeModal
          pending={pending}
          onClose={() => setAddOpen(false)}
          onSubmit={(name, gross, position) =>
            startTransition(async () => {
              const r = await createEmployeeAction({ name, grossSalary: gross, position });
              setMsg(r.ok ? "Вработен додаден." : r.error);
              if (r.ok) setAddOpen(false);
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}

function ConfigCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-muted-2">{label}</p>
      <p className="mt-1 text-[14px] font-bold text-ink">{value}</p>
    </div>
  );
}

function AddEmployeeModal({
  pending,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string, gross: number, position: string | undefined) => void;
}) {
  const [name, setName] = useState("");
  const [grossRaw, setGrossRaw] = useState("");
  const [position, setPosition] = useState("");
  const gross = safeDeni(grossRaw);
  const cls =
    "mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(20,30,48,0.45)" }}
    >
      <div className="max-h-[90vh] w-full max-w-[420px] animate-fade-up overflow-y-auto rounded-[18px] bg-surface p-7">
        <h3 className="mb-5 text-[15px] font-extrabold text-ink">Нов вработен</h3>
        <label className="block text-[12px] font-semibold text-muted">
          Име
          <input className={cls} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mt-3 block text-[12px] font-semibold text-muted">
          Бруто плата (МКД)
          <input
            className={cls}
            inputMode="decimal"
            value={grossRaw}
            onChange={(e) => setGrossRaw(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-[12px] font-semibold text-muted">
          Позиција (опц.)
          <input className={cls} value={position} onChange={(e) => setPosition(e.target.value)} />
        </label>
        <div className="mt-6 flex justify-between">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
          >
            Откажи
          </button>
          <button
            disabled={pending || !name.trim() || gross <= 0}
            onClick={() => onSubmit(name.trim(), gross, position.trim() || undefined)}
            className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            Додади
          </button>
        </div>
      </div>
    </div>
  );
}
