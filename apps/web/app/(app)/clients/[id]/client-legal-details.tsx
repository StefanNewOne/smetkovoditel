"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClientDetails } from "../actions";

export function ClientLegalDetails({
  clientId,
  legalName,
  taxId,
  address,
}: {
  clientId: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    legalName: legalName ?? "",
    taxId: taxId ?? "",
    address: address ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await updateClientDetails({ clientId, ...form });
      setMsg(r.ok ? "Зачувано." : r.error);
      if (r.ok) router.refresh();
    });
  }

  const fields: { key: keyof typeof form; label: string; placeholder: string }[] = [
    { key: "legalName", label: "Правно име (за фактура)", placeholder: 'пр. „ДТУ СТАФФ 2014 ДОО"' },
    { key: "taxId", label: "ЕДБ (даночен број)", placeholder: "напр. 4012345678901" },
    { key: "address", label: "Адреса", placeholder: "ул. …, град" },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-[14px] font-extrabold text-ink">Правни податоци (фактура)</h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted-2">
        Се печатат на фактурата. ЕДБ е законски задолжителен за фактура кон правно лице.
      </p>
      <div className="flex flex-col gap-2.5">
        {fields.map((f) => (
          <label key={f.key}>
            <span className="mb-1 block text-[11px] font-semibold text-muted-2">{f.label}</span>
            <input
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="w-full rounded-md border border-input px-3 py-2 text-[13px]"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Зачувувам…" : "Зачувај"}
        </button>
        {msg && <span className="text-[12px] font-semibold text-accent-hover">{msg}</span>}
      </div>
    </div>
  );
}
