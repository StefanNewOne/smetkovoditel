"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBillingCycleAction } from "../actions";

export function BillingCycle({ clientId, cycle }: { clientId: string; cycle: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cur, setCur] = useState(cycle);
  const [msg, setMsg] = useState("");

  const set = (c: "MONTHLY" | "QUARTERLY") =>
    start(async () => {
      setMsg("");
      const r = await setBillingCycleAction(clientId, c);
      if (r.ok) {
        setCur(c);
        setMsg("Зачувано.");
        router.refresh();
      } else setMsg(r.error);
    });

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-[14px] font-extrabold text-ink">Циклус на наплата</h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted-2">
        Колку често W1 создава задолжување. Може да се менува во секое време.
      </p>
      <div className="flex gap-2">
        {(["MONTHLY", "QUARTERLY"] as const).map((c) => (
          <button
            key={c}
            onClick={() => set(c)}
            disabled={pending || cur === c}
            className={`flex-1 rounded-md border px-3 py-2 text-[12.5px] font-bold ${
              cur === c
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-muted hover:bg-inset"
            } disabled:cursor-default`}
          >
            {c === "MONTHLY" ? "Месечен" : "3-месечен"}
          </button>
        ))}
      </div>
      {msg && <p className="mt-2 text-[12px] text-accent">{msg}</p>}
    </div>
  );
}
