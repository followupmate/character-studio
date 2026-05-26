"use client";

import { useRouter } from "next/navigation";

interface Props {
  currentDate: string;
  todayDate: string;
  charId?: string;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export default function DateNav({ currentDate, todayDate, charId }: Props) {
  const router = useRouter();

  function go(date: string) {
    const params = new URLSearchParams();
    params.set("date", date);
    if (charId) params.set("char", charId);
    router.push(`/today?${params.toString()}`);
  }

  const isToday = currentDate === todayDate;
  const prev = addDays(currentDate, -1);
  const next = addDays(currentDate, 1);
  const canGoNext = next <= addDays(todayDate, 30);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => go(prev)}
        className="font-mono text-[11px] text-muted hover:text-ink border border-border hover:border-border2 rounded px-2 py-1 transition-colors"
        title={prev}
      >
        ←
      </button>
      <input
        type="date"
        value={currentDate}
        onChange={(e) => { if (e.target.value) go(e.target.value); }}
        className="font-mono text-[10px] bg-bg3 border border-border text-ink rounded px-2 py-1 focus:outline-none focus:border-accent"
      />
      <button
        onClick={() => go(next)}
        disabled={!canGoNext}
        className="font-mono text-[11px] text-muted hover:text-ink border border-border hover:border-border2 rounded px-2 py-1 transition-colors disabled:opacity-30"
        title={next}
      >
        →
      </button>
      {!isToday && (
        <button
          onClick={() => go(todayDate)}
          className="font-mono text-[9px] text-accent border border-accent/30 rounded px-2 py-1 hover:bg-accent/10 transition-colors"
        >
          dnes
        </button>
      )}
    </div>
  );
}
