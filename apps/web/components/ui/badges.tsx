import type { PaymentChannelValue } from "@smetko/shared";

/** Charge/invoice status badge — colors + labels from the prototype statusBadge() map. */
const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: "bg-chip", text: "text-muted", label: "DRAFT" },
  OPEN: { bg: "bg-accent-50", text: "text-accent-hover", label: "OPEN" },
  PARTIALLY_PAID: { bg: "bg-warning-50", text: "text-warning-700", label: "ДЕЛУМНО" },
  PAID: { bg: "bg-success-50", text: "text-success-700", label: "PAID" },
  OVERDUE: { bg: "bg-danger-50", text: "text-danger", label: "OVERDUE" },
  CANCELLED: { bg: "bg-chip", text: "text-muted-2", label: "ОТКАЖАНО" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.DRAFT!;
  return (
    <span
      className={`inline-block rounded-[12px] px-2.5 py-0.5 text-[11px] font-bold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: PaymentChannelValue }) {
  const invoice = channel === "INVOICE";
  return (
    <span
      className={`inline-block rounded-[12px] px-2.5 py-0.5 text-[11px] font-bold ${
        invoice ? "bg-accent-50 text-accent-hover" : "bg-warning-50 text-warning-700"
      }`}
    >
      {invoice ? "ФАКТУРА" : "КЕШ"}
    </span>
  );
}

/** Initials avatar tile (prototype: bg accent-50, accent text, weight 800). */
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-accent-50 font-extrabold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
