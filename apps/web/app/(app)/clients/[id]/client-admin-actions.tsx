"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, Trash2 } from "lucide-react";
import { deleteClientAction, deletionImpactAction, setClientStatusAction } from "../actions";

interface Impact {
  name: string;
  charges: number;
  payments: number;
  expenses: number;
  statementLinesFreed: number;
}

export function ClientAdminActions({
  clientId,
  name,
  status,
}: {
  clientId: string;
  name: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const active = status === "ACTIVE";

  function toggleStatus() {
    setErr("");
    startTransition(async () => {
      const r = await setClientStatusAction(clientId, active ? "CHURNED" : "ACTIVE");
      if (!r.ok) setErr(r.error);
      router.refresh();
    });
  }

  function openConfirm() {
    setErr("");
    setTyped("");
    setImpact(null);
    setConfirmOpen(true);
    startTransition(async () => {
      const r = await deletionImpactAction(clientId);
      if (r.ok) setImpact(r.impact);
      else setErr(r.error);
    });
  }

  function doDelete() {
    setErr("");
    startTransition(async () => {
      const r = await deleteClientAction(clientId);
      if (r.ok) router.push("/clients");
      else setErr(r.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleStatus}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold text-muted hover:bg-inset disabled:opacity-40"
      >
        <Power size={13} />
        {active ? "Деактивирај" : "Активирај"}
      </button>
      <button
        onClick={openConfirm}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-danger-50 px-3 py-1.5 text-[12px] font-bold text-danger hover:bg-danger-50 disabled:opacity-40"
      >
        <Trash2 size={13} />
        Избриши
      </button>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: "rgba(20,30,48,0.45)" }}
          onClick={() => !pending && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-[440px] animate-fade-up overflow-y-auto rounded-[18px] bg-surface p-7"
          >
            <h3 className="mb-1 text-[15px] font-extrabold text-danger">Избриши клиент</h3>
            <p className="mb-4 text-[12.5px] text-muted">
              Трајно го брише <b>{name}</b> и целата негова евиденција. Извод-линиите ќе се
              ослободат за повторно спарување. Ова е неповратно.
            </p>
            {impact && (
              <div className="mb-4 rounded-lg bg-inset px-3 py-2 text-[12px] text-ink">
                Ќе се избришат: <b>{impact.charges}</b> задолжувања · <b>{impact.payments}</b>{" "}
                уплати · <b>{impact.expenses}</b> трошоци; ослободени извод-линии:{" "}
                <b>{impact.statementLinesFreed}</b>.
              </div>
            )}
            <label className="block text-[12px] font-semibold text-muted">
              Внеси „{name}“ за потврда
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-[13px]"
            />
            {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-lg border border-border px-3.5 py-2 text-[12.5px] font-bold text-muted hover:bg-inset disabled:opacity-40"
              >
                Откажи
              </button>
              <button
                onClick={doDelete}
                disabled={pending || typed.trim() !== name}
                className="rounded-lg bg-danger px-3.5 py-2 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-40"
              >
                Избриши трајно
              </button>
            </div>
          </div>
        </div>
      )}
      {err && !confirmOpen && <span className="text-[12px] text-danger">{err}</span>}
    </div>
  );
}
