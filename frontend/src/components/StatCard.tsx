export function StatCard({
  label,
  value,
  unit,
  delta,
  tone = "up",
  loading = false,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  tone?: "up" | "down" | "neutral";
  /** Shows a pulsing placeholder in place of the value. */
  loading?: boolean;
}) {
  const toneClass =
    tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-2/3 animate-pulse rounded bg-muted" aria-busy="true">
          <span className="sr-only">กำลังโหลด…</span>
        </div>
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {value}
          {unit ? <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span> : null}
        </p>
      )}
      {delta ? <p className={`mt-1 text-xs ${toneClass}`}>{delta}</p> : null}
    </div>
  );
}
