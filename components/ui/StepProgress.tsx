interface Props {
  current: number;
  total: number;
  label: string;
}

export default function StepProgress({ current, total, label }: Props) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mb-6">
      <p className="font-mono text-[9px] text-muted mb-2">
        Krok {current} z {total} — {label}
      </p>
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
