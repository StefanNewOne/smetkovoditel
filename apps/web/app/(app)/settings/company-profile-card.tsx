"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanyProfileData } from "@/lib/company";
import { updateCompanyProfileAction } from "./actions";

const FIELDS: { key: keyof CompanyProfileData; label: string; wide?: boolean }[] = [
  { key: "name", label: "Назив", wide: true },
  { key: "address", label: "Адреса", wide: true },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Е-пошта" },
  { key: "taxId", label: "ЕДБ (даночен број)" },
  { key: "director", label: "Управител" },
  { key: "bankName", label: "Банка" },
  { key: "account", label: "Жиро-сметка" },
  { key: "invoiceFooter", label: "Забелешка на фактура (клаузули)", wide: true },
];

export function CompanyProfileCard({ profile }: { profile: CompanyProfileData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<CompanyProfileData>(profile);
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await updateCompanyProfileAction(form);
      setMsg(r.ok ? "Профилот е зачуван." : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-[14px] font-extrabold text-ink">Профил на компанија</h3>
      <p className="mb-4 mt-0.5 text-[12px] text-muted-2">
        Податоците на издавачот што се печатат на секоја фактура (D1).
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
            <span className="mb-1 block text-[11px] font-semibold text-muted-2">{f.label}</span>
            {f.key === "invoiceFooter" ? (
              <textarea
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-input px-3 py-2 text-[13px]"
              />
            ) : (
              <input
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full rounded-md border border-input px-3 py-2 text-[13px]"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Зачувувам…" : "Зачувај"}
        </button>
        {msg && <span className="text-[12.5px] font-semibold text-accent-hover">{msg}</span>}
      </div>
    </div>
  );
}
