export function StatCard({
  label,
  value,
  unit,
  delta,
  tone = "up",
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const toneClass =
    tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {delta ? <p className={`mt-1 text-xs ${toneClass}`}>{delta}</p> : null}
    </div>
  );
}
