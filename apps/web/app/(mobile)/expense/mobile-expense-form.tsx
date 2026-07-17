"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check } from "lucide-react";
import { formatMKD, parseDenari } from "@smetko/shared";
import { recordCashExpenseAction } from "./actions";

const CATEGORIES: { key: string; label: string }[] = [
  { key: "OPERATIONS", label: "Тековни" },
  { key: "FUEL", label: "Гориво" },
  { key: "EQUIPMENT", label: "Опрема" },
  { key: "PHONE", label: "Телефон" },
  { key: "UTILITIES", label: "Комуналии" },
  { key: "RENT", label: "Кирија" },
  { key: "OTHER", label: "Друго" },
];

function safeDeni(raw: string): number {
  try {
    return raw.trim() ? parseDenari(raw) : 0;
  } catch {
    return 0;
  }
}

export function MobileExpenseForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [amountRaw, setAmountRaw] = useState("");
  const [category, setCategory] = useState("OPERATIONS");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [receipt, setReceipt] = useState("");
  const [saveTried, setSaveTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const amount = safeDeni(amountRaw);
  const canSave = !!file && amount > 0 && description.trim().length > 0;

  function onPick(f: File | null) {
    setFile(f);
    setSaveTried(false);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function submit() {
    if (!file) {
      setSaveTried(true); // B5: red state, blocked
      return;
    }
    if (!canSave) return;
    setError(null);
    const fd = new FormData();
    fd.append("photo", file);
    fd.append("amountDeni", String(amount));
    fd.append("category", category);
    fd.append("description", description.trim());
    fd.append("vendor", vendor.trim());
    fd.append("receiptNumber", receipt.trim());
    startTransition(async () => {
      const r = await recordCashExpenseAction(fd);
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[440px] flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-700">
          <Check size={32} />
        </span>
        <p className="text-[16px] font-extrabold text-ink">✓ Зачувано атомски</p>
        <p className="text-[13px] text-muted">
          Трошокот, благајничката ставка и сликата се запишани заедно.
        </p>
        <div className="mt-2 flex gap-2">
          <Link
            href="/cash"
            className="rounded-md border border-border px-4 py-2 text-[13px] font-bold text-muted"
          >
            Кон благајна
          </Link>
          <button
            onClick={() => {
              setDone(false);
              onPick(null);
              setAmountRaw("");
              setDescription("");
              setVendor("");
              setReceipt("");
            }}
            className="rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-white"
          >
            Нов трошок
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[440px] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/cash" className="text-muted hover:text-ink">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-[16px] font-extrabold text-ink">Нов кеш-трошок (W6)</h1>
      </div>

      {/* Photo zone */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={`flex h-[170px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed ${
          saveTried && !file
            ? "border-danger bg-danger-50"
            : file
              ? "border-success bg-success-50"
              : "border-accent-300 bg-accent-50"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="сметка"
            className="h-full w-full rounded-2xl object-contain p-2"
          />
        ) : (
          <>
            <Camera size={34} className={saveTried && !file ? "text-danger" : "text-accent"} />
            <span
              className={`text-[12px] font-semibold ${saveTried && !file ? "text-danger" : "text-muted"}`}
            >
              Фотографирај сметка · задолжително за кеш-трошок (B5)
            </span>
          </>
        )}
      </button>
      {saveTried && !file && (
        <p className="mt-2 rounded-md bg-danger-50 px-3 py-2 text-[12px] font-semibold text-danger">
          ⛔ B5: кеш-трошок без слика е блокиран
        </p>
      )}
      {file && (
        <p className="mt-2 rounded-md bg-success-50 px-3 py-2 text-[12px] text-success-700">
          ✓ Сликата е прикачена. Внеси износ и опис.
        </p>
      )}

      <label className="mt-4 block text-[12px] font-semibold text-muted">
        Износ (МКД)
        <input
          className="mt-1 w-full rounded-xl border border-input px-4 py-3 text-[17px] font-bold outline-none focus:border-accent"
          inputMode="decimal"
          placeholder="0,00"
          value={amountRaw}
          onChange={(e) => setAmountRaw(e.target.value)}
        />
        {amount > 0 && (
          <span className="mt-1 block text-[11px] text-muted-2">{formatMKD(amount)} ден</span>
        )}
      </label>

      <p className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-[0.5px] text-muted-2">
        Категорија
      </p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${
              category === c.key ? "bg-accent text-white" : "bg-chip text-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-[12px] font-semibold text-muted">
        Опис
        <input
          className="mt-1 w-full rounded-xl border border-input px-4 py-3 text-[14px] outline-none focus:border-accent"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-[12px] font-semibold text-muted">
          Добавувач (опц.)
          <input
            className="mt-1 w-full rounded-xl border border-input px-4 py-3 text-[14px] outline-none focus:border-accent"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-semibold text-muted">
          Бр. сметка (опц.)
          <input
            className="mt-1 w-full rounded-xl border border-input px-4 py-3 text-[14px] outline-none focus:border-accent"
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger">{error}</p>
      )}

      <button
        onClick={submit}
        disabled={pending}
        className={`mt-6 w-full rounded-xl py-4 text-[14px] font-extrabold ${
          canSave ? "bg-accent text-white hover:opacity-90" : "bg-[#e3e9f1] text-[#9aa6b7]"
        } disabled:opacity-60`}
      >
        {pending ? "Се зачувува…" : "Зачувај трошок"}
      </button>
    </div>
  );
}
