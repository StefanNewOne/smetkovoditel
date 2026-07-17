const KPIS = [
  { label: "Салдо банка", sub: "НЛБ · последен извод", value: "—" },
  { label: "Салдо благајна", sub: "по последен попис", value: "—" },
  { label: "Задолжено", sub: "отворени фактури + кеш", value: "—" },
  { label: "Наплатено", sub: "тековен месец", value: "—" },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface px-5.5 py-5">
            <p className="text-[12px] font-semibold text-muted-2">{k.label}</p>
            <p className="mt-1 text-[26px] font-extrabold text-ink">{k.value}</p>
            <p className="mt-1 text-[12px] text-muted-2">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-8">
        <span className="inline-block rounded-[10px] bg-chip px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2">
          Во изградба · Ф1–Ф2 · SM-12 / SM-30
        </span>
        <h2 className="mt-4 text-[19px] font-extrabold text-ink">Dashboard</h2>
        <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted">
          Живите KPI-и (салдо банка/благајна, задолжено vs наплатено, топ должници, редици за
          внимание) се полнат кога ќе се вклучат W1 задолжувањата (Ф1) и Import-от (Ф2). Скелетот и
          дизајн-токените се веќе на место.
        </p>
      </div>
    </div>
  );
}
