"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Upload, X } from "lucide-react";
import { removeContractAction, uploadContractAction } from "../actions";

export function ClientContract({
  clientId,
  contractUrl,
  contractName,
  uploadedAt,
}: {
  clientId: string;
  contractUrl: string | null;
  contractName: string | null;
  uploadedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setErr("");
    const fd = new FormData();
    fd.set("contract", file);
    startTransition(async () => {
      const r = await uploadContractAction(clientId, fd);
      if (!r.ok) setErr(r.error);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-[14px] font-extrabold text-ink">Договор за соработка</h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted-2">
        Прикачи го потпишаниот договор (PDF или слика).
      </p>

      {contractUrl ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-inset px-3 py-2.5">
            <FileCheck2 size={18} className="shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <a
                href={contractUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-[13px] font-bold text-accent hover:underline"
              >
                {contractName ?? "Договор"}
              </a>
              {uploadedAt && <p className="text-[11px] text-muted-2">Прикачен {uploadedAt}</p>}
            </div>
            <button
              onClick={() =>
                startTransition(async () => {
                  await removeContractAction(clientId);
                  router.refresh();
                })
              }
              disabled={pending}
              title="Отстрани договор"
              className="text-muted-2 hover:text-danger disabled:opacity-40"
            >
              <X size={15} />
            </button>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="self-start text-[12px] font-semibold text-accent hover:underline disabled:opacity-40"
          >
            Замени договор
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input py-4 text-[12.5px] font-semibold text-muted hover:bg-inset disabled:opacity-40"
        >
          <Upload size={15} /> {pending ? "Прикачувам…" : "Прикачи договор"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
    </div>
  );
}
