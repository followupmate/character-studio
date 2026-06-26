"use client";

import { useState, useEffect, useRef } from "react";

// One-click generation of ALL image slots for a day's batch (5 carousel + reel start frame + story BTS).
// Replaces the old workflow of clicking each slot individually. Video (reel) stays a separate click
// because it needs the start frame to exist first (which this button just created).
export default function GenerateDayButton({ batchId }: { batchId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/characters/generate-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, imageOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      const ok = data.generated ?? 0;
      const total = data.total ?? 0;
      setResult(`Hotovo: ${ok}/${total} obrázkov`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const progress = loading ? Math.min((elapsed / 180) * 100, 95) : 0;

  return (
    <div className="space-y-2">
      <button
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] bg-accent/15 border border-accent/40 text-accent px-4 py-2 rounded hover:bg-accent/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-[15px]">bolt</span>
        {loading ? `Generujem všetky obrázky… ${elapsed}s` : "⚡ Vygenerovať celý deň (1 klik)"}
      </button>

      {loading && (
        <div className="h-1 bg-bg3 border border-border rounded-full overflow-hidden max-w-sm">
          <div
            className="h-full bg-accent/60 transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {result && <p className="font-mono text-[10px] text-teal">✓ {result}</p>}
      {error && <p className="font-mono text-[10px] text-red-400">✗ {error}</p>}
    </div>
  );
}
