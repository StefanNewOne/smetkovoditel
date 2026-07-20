"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addGiroAccountAction, removeGiroAccountAction } from "../actions";

export function GiroAccounts({
  clientId,
  accounts,
}: {
  clientId: string;
  accounts: { id: string; account: string; label: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");

  function add() {
    setErr("");
    startTransition(async () => {
      const r = await addGiroAccountAction(clientId, value);
      if (r.ok) setValue("");
      else setErr(r.error);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-[14px] font-extrabold text-ink">Жиро-сметки</h3>
      <p className="mb-3 text-[12px] text-muted-2">
        Влезните уплати од овие сметки автоматски се препознаваат како овој клиент.
      </p>
      <div className="flex flex-col gap-2">
        {accounts.length === 0 && (
          <p className="text-[12.5px] text-muted-2">Нема внесени сметки.</p>
        )}
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-md bg-inset px-3 py-1.5 text-[12.5px]"
          >
            <span className="font-semibold text-ink">{a.account}</span>
            <button
              onClick={() =>
                startTransition(async () => {
                  await removeGiroAccountAction(a.id, clientId);
                  router.refresh();
                })
              }
              disabled={pending}
              className="text-muted-2 hover:text-danger disabled:opacity-40"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="300-0000000000-00"
          className="min-w-0 flex-1 rounded-md border border-input px-3 py-2 text-[13px]"
        />
        <button
          onClick={add}
          disabled={pending || !value.trim()}
          className="rounded-md bg-accent px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-40"
        >
          Додади
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
    </div>
  );
}
