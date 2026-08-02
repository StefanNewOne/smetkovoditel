"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Wallet, X } from "lucide-react";
import { formatMKD, parseDenari, vatOf, withVat, type PaymentChannelValue } from "@smetko/shared";
import { createClient } from "./actions";

const STEPS = ["Основни податоци", "Канал на наплата", "Пакет", "Дополнителни ставки", "Потврда"];

interface AdAccount {
  metaAccountId: string;
  name: string;
}

function safeDeni(raw: string): number {
  try {
    return raw.trim() ? parseDenari(raw) : 0;
  } catch {
    return 0;
  }
}

function nextMonthLabel(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return d.toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function NewClientWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<PaymentChannelValue | null>(null);
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [cycle, setCycle] = useState<"MONTHLY" | "QUARTERLY">("MONTHLY");
  const [startDate, setStartDate] = useState("");
  const [giroAccounts, setGiroAccounts] = useState<string[]>([]);
  const [metaAds, setMetaAds] = useState(false);
  const [actors, setActors] = useState(false);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);

  const base = safeDeni(amountRaw);
  const isInvoice = channel === "INVOICE";

  function reset() {
    setStep(0);
    setError(null);
    setName("");
    setEmail("");
    setPhone("");
    setChannel(null);
    setLegalName("");
    setTaxId("");
    setAmountRaw("");
    setCycle("MONTHLY");
    setStartDate("");
    setGiroAccounts([]);
    setMetaAds(false);
    setActors(false);
    setAdAccounts([]);
  }

  function close() {
    setOpen(false);
    reset();
  }

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && channel !== null) || // ЕДБ optional (owner decision)
    (step === 2 && base > 0) ||
    step === 3 ||
    step === 4;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createClient({
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        paymentChannel: channel!,
        taxId: taxId.trim() || undefined,
        contactEmail: email.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        paymentTermDays: 15,
        monthlyAmount: base,
        billingCycle: cycle,
        startDate: startDate || undefined,
        giroAccounts: giroAccounts.map((a) => a.trim()).filter(Boolean),
        metaAds,
        actors,
        adAccounts: adAccounts.filter((a) => a.metaAccountId && a.name),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
      router.push(`/clients/${res.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
      >
        <Plus size={15} /> Нов клиент
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: "rgba(20,30,48,0.45)" }}
        >
          <div className="max-h-[90vh] w-full max-w-[560px] animate-fade-up overflow-y-auto rounded-[18px] bg-surface p-7">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[0.5px] text-muted-2">
                Чекор {step + 1} од 5 · {STEPS[step]}
              </span>
              <button
                type="button"
                onClick={close}
                className="text-[18px] text-muted-2 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-6 flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-[2px] ${i <= step ? "bg-accent" : "bg-border"}`}
                />
              ))}
            </div>

            {step === 0 && (
              <div className="flex flex-col gap-3">
                <Field label="Име на клиент">
                  <input
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Правно име (за фактура, опционо)">
                  <input
                    className={inputCls}
                    value={legalName}
                    placeholder='пр. „ДТУ СТАФФ 2014 ДОО"'
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </Field>
                <Field label="Е-пошта (опционо)">
                  <input
                    className={inputCls}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Телефон (опционо)">
                  <input
                    className={inputCls}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <ChannelCard
                    active={channel === "INVOICE"}
                    onClick={() => setChannel("INVOICE")}
                    icon={<FileText size={20} />}
                    title="Фактура"
                    sub="+18% ДДВ · бара ЕДБ"
                  />
                  <ChannelCard
                    active={channel === "CASH"}
                    onClick={() => setChannel("CASH")}
                    icon={<Wallet size={20} />}
                    title="Кеш"
                    sub="без ДДВ · интерна обврска"
                  />
                </div>
                {isInvoice && (
                  <Field label="ЕДБ (даночен број) — по желба">
                    <input
                      className={inputCls}
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                    />
                  </Field>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCycle("MONTHLY")}
                    className={`rounded-lg border-2 p-3 text-left text-[13px] font-bold ${
                      cycle === "MONTHLY"
                        ? "border-accent bg-accent-50 text-accent"
                        : "border-border text-muted hover:bg-inset"
                    }`}
                  >
                    Месечен
                    <span className="block text-[11px] font-normal text-muted-2">
                      фактура секој месец
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCycle("QUARTERLY")}
                    className={`rounded-lg border-2 p-3 text-left text-[13px] font-bold ${
                      cycle === "QUARTERLY"
                        ? "border-accent bg-accent-50 text-accent"
                        : "border-border text-muted hover:bg-inset"
                    }`}
                  >
                    Тромесечен
                    <span className="block text-[11px] font-normal text-muted-2">
                      една фактура / 3 месеци
                    </span>
                  </button>
                </div>
                <Field
                  label={
                    cycle === "QUARTERLY"
                      ? "Основица (за 3 месеци, МКД)"
                      : "Основица (месечен пакет, МКД)"
                  }
                >
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder="30.000"
                    value={amountRaw}
                    onChange={(e) => setAmountRaw(e.target.value)}
                  />
                </Field>
                <Field label="Стартен датум (од кога влегува во W1)">
                  <input
                    className={inputCls}
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Field>
                <div className="rounded-lg bg-inset p-4 text-[13px]">
                  <Row label="Основица" value={`${formatMKD(base)} ден`} />
                  <Row
                    label="ДДВ 18%"
                    value={isInvoice ? `${formatMKD(vatOf(base))} ден` : "0 (кеш)"}
                  />
                  <Row
                    label="Вкупно"
                    value={isInvoice ? `${formatMKD(withVat(base))} ден` : `${formatMKD(base)} ден`}
                    strong
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-border-2 p-3">
                  <p className="mb-2 text-[12px] font-semibold text-muted">
                    Жиро-сметки (за спарување на уплати)
                  </p>
                  {giroAccounts.map((acc, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <input
                        className={inputCls}
                        placeholder="300-0000000000-00"
                        value={acc}
                        onChange={(e) =>
                          setGiroAccounts((prev) =>
                            prev.map((x, j) => (j === i ? e.target.value : x)),
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setGiroAccounts((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded-md border border-border px-2 text-muted hover:bg-inset"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setGiroAccounts((p) => [...p, ""])}
                    className="text-[12px] font-bold text-accent hover:underline"
                  >
                    + Додади жиро-сметка
                  </button>
                </div>
                <Toggle
                  checked={metaAds}
                  onChange={setMetaAds}
                  label="Meta Ads"
                  sub="префактурирање 1:1 од изводот"
                />
                {metaAds && (
                  <div className="rounded-lg border border-border-2 p-3">
                    {adAccounts.map((a, i) => (
                      <div key={i} className="mb-2 flex gap-2">
                        <input
                          className={inputCls}
                          placeholder="Meta Account ID"
                          value={a.metaAccountId}
                          onChange={(e) =>
                            setAdAccounts((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, metaAccountId: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <input
                          className={inputCls}
                          placeholder="Име"
                          value={a.name}
                          onChange={(e) =>
                            setAdAccounts((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            )
                          }
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAdAccounts((p) => [...p, { metaAccountId: "", name: "" }])}
                      className="text-[12px] font-bold text-accent hover:underline"
                    >
                      + Додади ad акаунт
                    </button>
                  </div>
                )}
                <Toggle
                  checked={actors}
                  onChange={setActors}
                  label="Актери (D2)"
                  sub="автоматски од хонорарска алокација"
                />
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-2 text-[13px]">
                <Row label="Клиент" value={name} />
                <Row label="Канал" value={isInvoice ? "Фактура (+ДДВ)" : "Кеш"} />
                {isInvoice && <Row label="ЕДБ" value={taxId} />}
                <Row label="Пакет" value={cycle === "QUARTERLY" ? "Тромесечен" : "Месечен"} />
                <Row label="Основица" value={`${formatMKD(base)} ден`} />
                {startDate && <Row label="Стартен датум" value={startDate} />}
                {giroAccounts.filter((a) => a.trim()).length > 0 && (
                  <Row
                    label="Жиро-сметки"
                    value={`${giroAccounts.filter((a) => a.trim()).length}`}
                  />
                )}
                <Row
                  label="Дополнителни"
                  value={
                    [metaAds && "Meta Ads", actors && "Актери"].filter(Boolean).join(" · ") || "—"
                  }
                />
                <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-[12.5px] text-accent-hover">
                  Од {nextMonthLabel()} влегува во W1 (месечно задолжување).
                </p>
              </div>
            )}

            {error && (
              <p className="mt-3 rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger">
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
                className="rounded-md border border-border px-4 py-2 text-[12px] font-bold text-muted hover:bg-inset"
              >
                {step === 0 ? "Откажи" : "Назад"}
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setStep((s) => s + 1)}
                  className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                >
                  Понатаму
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={submit}
                  className="rounded-md bg-accent px-5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {pending ? "Се зачувува…" : "Создади клиент"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-input px-3.5 py-2.5 text-[14px] outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-semibold text-muted">
      {label}
      {children}
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border-3 py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className={strong ? "font-extrabold text-ink" : "font-semibold text-ink"}>{value}</span>
    </div>
  );
}

function ChannelCard({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-[12px] border-2 p-4 text-left ${
        active ? "border-accent bg-accent-50" : "border-border hover:border-accent-300"
      }`}
    >
      <span className="text-accent">{icon}</span>
      <span className="text-[14px] font-extrabold text-ink">{title}</span>
      <span className="text-[12px] text-muted-2">{sub}</span>
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between rounded-lg border p-3.5 text-left ${
        checked ? "border-accent bg-accent-50" : "border-border hover:bg-inset"
      }`}
    >
      <span>
        <span className="block text-[13px] font-bold text-ink">{label}</span>
        <span className="block text-[12px] text-muted-2">{sub}</span>
      </span>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
          checked ? "border-accent bg-accent text-white" : "border-border"
        }`}
      >
        {checked && "✓"}
      </span>
    </button>
  );
}
