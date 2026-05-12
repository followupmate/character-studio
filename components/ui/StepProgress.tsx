interface Props {
  current: number;
  total: number;
  label: string;
}

export default function StepProgress({ current, total, label }: Props) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mb-6">
      <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-2">
        Krok {current} z {total} — {label}
      </p>
      <div className="h-px bg-border overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
