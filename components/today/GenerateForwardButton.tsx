"use client";

import { useState, useEffect, useRef } from "react";

interface DayResult {
  date: string;
  day_number: number;
  tier: string;
  status: string;
  error?: string;
}

interface CharResult {
  character: string;
  days: DayResult[];
}

export default function GenerateForwardButton({ characterId }: { characterId?: string }) {
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);
  const [results, setResults] = useState<CharResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  async function generate() {
    setLoading(true);
    setResults(null);
    setError(null);
    try {
      const res = await fetch("/api/characters/generate-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, ...(characterId ? { character_id: characterId } : {}) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Unknown error");
      setResults(data.generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const estimated = days * 25;
  const progress = loading ? Math.min((elapsed / estimated) * 100, 95) : 0;

  const statusColor = (s: string) =>
    s === "ready" ? "text-teal" :
    s === "partial_failed" ? "text-amber" :
    s === "failed" ? "text-red-400" :
    s === "already_exists" ? "text-muted" :
    "text-muted2";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="font-mono text-[9px] text-muted uppercase tracking-widest">Dni:</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          disabled={loading}
          className="font-mono text-[11px] bg-bg3 border border-border text-ink rounded px-2 py-1 focus:outline-none focus:border-accent disabled:opacity-50"
        >
          {[1, 2, 3, 5, 7, 10, 14].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={loading}
          className="font-mono text-[11px] bg-accent/10 border border-accent/30 text-accent px-4 py-1.5 rounded hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Generujem…" : `Generovať ${days} dní dopredu`}
        </button>
        {loading && (
          <span className="font-mono text-[9px] text-muted">
            {elapsed}s / ~{estimated}s
          </span>
        )}
      </div>

      {/* Progress bar */}
      {loading && (
        <div className="space-y-1.5">
          <div className="h-1 bg-bg3 border border-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent/60 transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="font-mono text-[8px] text-muted animate-pulse">
            Generujem príbehy a prompty pre {days} {days === 1 ? "deň" : days < 5 ? "dni" : "dní"}…
          </p>
        </div>
      )}

      {error && (
        <p className="font-mono text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
          ✗ {error}
        </p>
      )}

      {results && (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.character} className="bg-bg3 border border-border rounded px-4 py-3 space-y-2">
              <p className="font-mono text-[10px] text-muted uppercase tracking-widest">{r.character}</p>
              <div className="space-y-1">
                {r.days.map((d) => (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-ink w-24">{d.date}</span>
                    <span className="font-mono text-[9px] text-muted2">Day {d.day_number}</span>
                    <span className="font-mono text-[9px] bg-bg border border-border text-muted px-1.5 py-0.5 rounded">
                      {d.tier.replace(/_/g, " ")}
                    </span>
                    <span className={`font-mono text-[10px] ${statusColor(d.status)}`}>
                      {d.status === "ready" ? "✓ ready" :
                       d.status === "partial_failed" ? "⚠ partial" :
                       d.status === "failed" ? "✗ failed" :
                       d.status === "already_exists" ? "— already exists" :
                       d.status}
                    </span>
                    {d.error && <span className="font-mono text-[9px] text-red-400 truncate max-w-xs">{d.error}</span>}
                  </div>
                ))}
              </div>
              <p className="font-mono text-[9px] text-muted pt-1">
                Hotové dni nájdeš v <span className="text-accent">/today?date=YYYY-MM-DD</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
