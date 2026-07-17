/**
 * Honest "not built yet" screen state (UI Completeness Matrix — a declared stub, never a silent
 * no-op). Every unbuilt screen renders this with its backlog item + phase so a reviewer can see
 * exactly what works in v1.
 */
export function ScreenPlaceholder({
  title,
  backlogId,
  phase,
  summary,
}: {
  title: string;
  backlogId: string;
  phase: string;
  summary: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8">
      <span className="inline-block rounded-[10px] bg-chip px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-2">
        Во изградба · {phase} · {backlogId}
      </span>
      <h2 className="mt-4 text-[19px] font-extrabold text-ink">{title}</h2>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-muted">{summary}</p>
      <p className="mt-4 text-[12px] text-muted-2">
        Спецификација:{" "}
        <code className="text-ink-2">_docs/architecture/MASTER_PLAN_v2.1_FINAL.md</code> · план:{" "}
        <code className="text-ink-2">_docs/plans/IMPLEMENTATION_PLAN.md</code>
      </p>
    </div>
  );
}
