export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatMKD } from "@smetko/shared";
import { getClient } from "@/lib/clients";
import { Avatar, ChannelBadge, StatusBadge } from "@/components/ui/badges";

function fmtDate(d: Date | null): string {
  return d
    ? new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
}

export default async function ClientProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const miniStats = [
    {
      label: "Пакет",
      value: client.activePackage
        ? `${formatMKD(client.activePackage.monthlyAmount, { decimals: 0 })} ден`
        : "—",
    },
    {
      label: "Отворено",
      value: client.openAmount > 0 ? `${formatMKD(client.openAmount, { decimals: 0 })} ден` : "0",
    },
    { label: "Маргина YTD", value: "—" },
    { label: "Преплата", value: `${formatMKD(client.creditBalance, { decimals: 0 })} ден` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/clients"
        className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft size={14} /> Клиенти
      </Link>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 320px" }}>
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-3.5">
              <Avatar name={client.name} size={48} />
              <div>
                <h2 className="text-[19px] font-extrabold text-ink">{client.name}</h2>
                <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-2">
                  {client.taxId ? `ЕДБ ${client.taxId}` : "без ЕДБ"}
                  <ChannelBadge channel={client.paymentChannel} />
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {miniStats.map((s) => (
                <div key={s.label} className="rounded-lg bg-inset p-3">
                  <p className="text-[11px] text-muted-2">{s.label}</p>
                  <p className="mt-1 text-[18px] font-extrabold text-ink">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="mb-3 text-[14px] font-extrabold text-ink">Задолжувања</h3>
            {client.charges.length === 0 ? (
              <p className="py-4 text-[13px] text-muted-2">
                Сè уште нема задолжувања. Првото се создава со W1.
              </p>
            ) : (
              <div className="flex flex-col">
                {client.charges.map((ch) => (
                  <div
                    key={ch.id}
                    className="flex items-center gap-3 border-b border-border-3 py-2.5 last:border-0"
                  >
                    <span className="w-[70px] text-[12px] font-semibold text-muted">
                      {ch.period}
                    </span>
                    <span className="flex-1 text-[13px] text-ink">
                      {ch.invoiceNumber ?? (ch.kind === "CASH_OBLIGATION" ? "Кеш обврска" : "—")}
                    </span>
                    <span className="text-[13px] font-semibold text-ink">
                      {formatMKD(ch.total, { decimals: 0 })} ден
                    </span>
                    <StatusBadge status={ch.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-[14px] font-extrabold text-ink">Пакет-историја</h3>
            <p className="mb-3 mt-0.5 text-[11px] text-muted-2">
              Верзионирано (B4) — промена = нова верзија, edit не постои.
            </p>
            <div className="flex flex-col gap-3">
              {client.packages.map((p) => {
                const activeVer = p.effectiveTo === null;
                return (
                  <div key={p.id} className="flex gap-2.5">
                    <span
                      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                        activeVer ? "bg-success" : "bg-[#c9d3e0]"
                      }`}
                    />
                    <div>
                      <p className="text-[13px] font-bold text-ink">
                        {formatMKD(p.monthlyAmount, { decimals: 0 })} ден
                      </p>
                      <p className="text-[11px] text-muted-2">
                        {fmtDate(p.effectiveFrom)} →{" "}
                        {activeVer ? "активен" : fmtDate(p.effectiveTo)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-[14px] font-extrabold text-ink">Дополнителни ставки</h3>
            {client.lineTemplates.length === 0 && client.adAccounts.length === 0 ? (
              <p className="text-[12px] text-muted-2">Нема дополнителни ставки.</p>
            ) : (
              <div className="flex flex-col gap-2 text-[12.5px]">
                {client.lineTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg bg-inset px-3 py-2"
                  >
                    <span className="font-semibold text-ink">
                      {t.type === "META_ADS" ? "Meta Ads" : t.type === "ACTORS" ? "Актери" : t.type}
                    </span>
                    <span className="text-[11px] text-muted-2">{t.billingMode}</span>
                  </div>
                ))}
                {client.adAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg bg-inset px-3 py-2"
                  >
                    <span className="font-semibold text-ink">{a.name}</span>
                    <span className="text-[11px] text-muted-2">{a.metaAccountId}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
