"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { parseDenari } from "@smetko/shared";
import type { CategoryAdminRow, EmployeeRow, PayrollRunRow, VendorRuleRow } from "@/lib/settings";
import {
  addVendorRuleAction,
  createCategoryAction,
  createEmployeeAction,
  removeVendorRuleAction,
  renameCategoryAction,
  type Result,
  runPayrollAction,
  setCategoryActiveAction,
  setCategoryRecurringAction,
} from "./actions";

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
  vendorRules,
  catAdmin,
}: {
  period: string;
  employees: EmployeeRow[];
  runs: PayrollRunRow[];
  config: Config;
  vendorRules: VendorRuleRow[];
  catAdmin: CategoryAdminRow[];
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConfigCard label="ДДВ" value={config.vat} />
        <ConfigCard label="Банка и салда" value={config.bank} />
        <ConfigCard label="Следен фактурен број" value={config.nextNumber} />
        <ConfigCard label="Vendor правила" value={`${config.vendorRules} активни`} />
        <ConfigCard label="RBAC" value="admin (Кекиќ)" />
        <ConfigCard label="Ad акаунти" value="во клиент-профили" />
      </div>

      <CategoriesSection
        catAdmin={catAdmin}
        rules={vendorRules}
        pending={pending}
        onChanged={() => router.refresh()}
        onError={(e) => setMsg(e)}
      />

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

function CategoriesSection({
  catAdmin,
  rules,
  pending,
  onChanged,
  onError,
}: {
  catAdmin: CategoryAdminRow[];
  rules: VendorRuleRow[];
  pending: boolean;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newRecurring, setNewRecurring] = useState(false);
  const [busy, startTransition] = useTransition();
  const disabled = pending || busy;

  const rulesByCat = new Map<string, VendorRuleRow[]>();
  for (const r of rules) {
    const list = rulesByCat.get(r.category) ?? [];
    list.push(r);
    rulesByCat.set(r.category, list);
  }

  const act = (fn: () => Promise<Result>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) onChanged();
      else onError(r.error);
    });

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-1 text-[14px] font-extrabold text-ink">Категории и продавачи</h3>
      <p className="mb-3 text-[12px] text-muted-2">
        Категориите на трошоци. Избери една за да ги видиш/додадеш нејзините продавачи (шаблони што
        авто-категоризираат при увоз, §4.2). „Тековна“ ја носи во екранот Тековни трошоци.
      </p>

      {/* Add a custom category */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Нова категорија (пр. Осигурување)"
          className="min-w-[180px] flex-1 rounded-md border border-input px-3 py-2 text-[13px]"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={newRecurring}
            onChange={(e) => setNewRecurring(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Тековна
        </label>
        <button
          onClick={() =>
            act(async () => {
              const r = await createCategoryAction(newLabel, newRecurring);
              if (r.ok) {
                setNewLabel("");
                setNewRecurring(false);
              }
              return r;
            })
          }
          disabled={disabled || newLabel.trim().length < 2}
          className="flex items-center gap-1 rounded-md bg-accent px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-40"
        >
          <Plus size={13} /> Категорија
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {catAdmin.map((c) => (
          <CategoryCard
            key={c.key}
            cat={c}
            rules={rulesByCat.get(c.key) ?? []}
            disabled={disabled}
            act={act}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  cat,
  rules,
  disabled,
  act,
}: {
  cat: CategoryAdminRow;
  rules: VendorRuleRow[];
  disabled: boolean;
  act: (fn: () => Promise<Result>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(cat.label);
  const [pattern, setPattern] = useState("");
  const [vendor, setVendor] = useState("");

  return (
    <div className={`rounded-md border border-border-2 ${cat.active ? "" : "opacity-55"}`}>
      <div className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
        <button onClick={() => setExpanded((v) => !v)} className="text-muted-2">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {renaming ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="min-w-0 flex-1 rounded border border-input px-1.5 py-1 text-[12.5px]"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-bold text-ink">{cat.label}</span>
        )}
        {cat.system && (
          <span className="rounded-[8px] bg-chip px-1.5 py-0.5 text-[10px] font-bold text-muted-2">
            системска
          </span>
        )}
        <span className="rounded-[8px] bg-chip px-1.5 py-0.5 text-[10px] text-muted-2">
          {rules.length} продавачи
        </span>
        {/* recurring toggle */}
        <label
          className="flex items-center gap-1 text-[11px] text-muted"
          title="Фиксен тековен трошок (ТЕКОВНИ ТРОШОЦИ)"
        >
          <input
            type="checkbox"
            checked={cat.recurring}
            disabled={disabled}
            onChange={(e) => act(() => setCategoryRecurringAction(cat.key, e.target.checked))}
            className="h-3.5 w-3.5"
          />
          тековна
        </label>
        {renaming ? (
          <button
            onClick={() =>
              act(async () => {
                const r = await renameCategoryAction(cat.key, label);
                if (r.ok) setRenaming(false);
                return r;
              })
            }
            disabled={disabled}
            className="text-accent hover:opacity-80 disabled:opacity-40"
          >
            <Check size={14} />
          </button>
        ) : (
          <button
            onClick={() => setRenaming(true)}
            className="text-muted-2 hover:text-ink"
            title="Преименувај"
          >
            <Pencil size={13} />
          </button>
        )}
        {!cat.system && (
          <button
            onClick={() => act(() => setCategoryActiveAction(cat.key, !cat.active))}
            disabled={disabled}
            className="text-muted-2 hover:text-danger disabled:opacity-40"
            title={cat.active ? "Деактивирај" : "Активирај"}
          >
            {cat.active ? <X size={14} /> : <Check size={14} />}
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border-3 px-3 py-2">
          {rules.length === 0 && (
            <p className="mb-2 text-[11.5px] text-muted-2">Нема продавачи во оваа категорија.</p>
          )}
          <div className="mb-2 flex flex-col gap-1">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-ink">{r.pattern}</span>
                {r.vendor && <span className="text-muted-2">· {r.vendor}</span>}
                <span className="ml-auto text-[11px] text-muted-2">{r.hits}×</span>
                <button
                  onClick={() => act(() => removeVendorRuleAction(r.id))}
                  disabled={disabled}
                  className="text-muted-2 hover:text-danger disabled:opacity-40"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Шаблон (пр. PETROL или сметка)"
              className="min-w-[140px] flex-1 rounded border border-input px-2 py-1 text-[12px]"
            />
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Продавач (опц.)"
              className="min-w-[110px] flex-1 rounded border border-input px-2 py-1 text-[12px]"
            />
            <button
              onClick={() =>
                act(async () => {
                  const r = await addVendorRuleAction(pattern, cat.key, vendor);
                  if (r.ok) {
                    setPattern("");
                    setVendor("");
                  }
                  return r;
                })
              }
              disabled={disabled || pattern.trim().length < 2}
              className="rounded bg-accent px-3 py-1 text-[12px] font-bold text-white disabled:opacity-40"
            >
              Додади продавач
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
