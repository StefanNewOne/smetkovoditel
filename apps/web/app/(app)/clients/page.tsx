export const dynamic = "force-dynamic";

import Link from "next/link";
import { formatMKD } from "@smetko/shared";
import { getClients } from "@/lib/clients";
import { Avatar, ChannelBadge } from "@/components/ui/badges";
import { NewClientWizard } from "./new-client-wizard";

const FILTERS = [
  { key: "all", label: "Сите" },
  { key: "INVOICE", label: "Фактура" },
  { key: "CASH", label: "Кеш" },
] as const;

const COLS = "2fr 1fr 1fr 1fr 1.2fr 0.8fr";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel } = await searchParams;
  const active = channel === "INVOICE" || channel === "CASH" ? channel : "all";
  const clients = await getClients(active === "all" ? undefined : active);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/clients" : `/clients?channel=${f.key}`}
            className={`rounded-[20px] border px-3.5 py-1.5 text-[12.5px] font-bold ${
              active === f.key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-muted hover:bg-inset"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <div className="ml-auto">
          <NewClientWizard />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div
          className="grid items-center border-b border-border-2 px-5.5 py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Клиент</span>
          <span>Канал</span>
          <span>Месечен пакет</span>
          <span>Отворено</span>
          <span>Дополнителни</span>
          <span>Статус</span>
        </div>

        {clients.length === 0 && (
          <p className="px-5.5 py-8 text-center text-[13px] text-muted-2">
            Нема клиенти. Додај го првиот со „+ Нов клиент“.
          </p>
        )}

        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="grid items-center border-b border-border-3 px-5.5 py-3.5 text-[13px] hover:bg-[#fbfcfe]"
            style={{ gridTemplateColumns: COLS }}
          >
            <span className="flex items-center gap-2.5 font-bold text-ink">
              <Avatar name={c.name} size={30} />
              {c.name}
            </span>
            <span>
              <ChannelBadge channel={c.paymentChannel} />
            </span>
            <span className="text-ink">
              {c.activePackage
                ? `${formatMKD(c.activePackage.monthlyAmount, { decimals: 0 })} ден`
                : "—"}
            </span>
            <span className={c.openAmount > 0 ? "font-bold text-danger" : "text-muted-2"}>
              {c.openAmount > 0 ? `${formatMKD(c.openAmount, { decimals: 0 })} ден` : "—"}
            </span>
            <span className="flex flex-wrap gap-1.5 text-[11px] text-muted">
              {c.hasMetaAds && <span className="rounded-md bg-chip px-2 py-0.5">Meta Ads</span>}
              {c.hasActors && <span className="rounded-md bg-chip px-2 py-0.5">Актери</span>}
              {!c.hasMetaAds && !c.hasActors && <span className="text-muted-2">—</span>}
            </span>
            <span className="text-[12px] font-semibold text-muted">
              {c.status === "ACTIVE" ? "Активен" : c.status === "PAUSED" ? "Паузиран" : "Напуштен"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
