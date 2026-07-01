"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// One-click generation of ALL image slots for a day's batch (5 carousel + reel start frame + story BTS).
// Replaces the old workflow of clicking each slot individually. Video (reel) stays a separate click
// because it needs the start frame to exist first (which this button just created).
//
// While the batch runs, the button polls /api/characters/batch-progress and renders
// real per-slot status chips + a real progress bar (not a time-based estimate).

interface SlotProgress {
  id: string;
  slot: string;
  hasMedia: boolean;
  status: string; // pending | generating | retrying | completed | failed
  error?: string | null;
}

const SLOT_SHORT: Record<string, string> = {
  carousel_1: "C1",
  carousel_2: "C2",
  carousel_3: "C3",
  carousel_4: "C4",
  carousel_5: "C5",
  reel_start_frame: "START",
  reel_video: "VIDEO",
  story_bts: "STORY",
};

function chipClass(s: SlotProgress): string {
  if (s.hasMedia) return "border-teal/40 bg-teal/10 text-teal";
  switch (s.status) {
    case "generating": return "border-amber/50 bg-amber/10 text-amber animate-pulse";
    case "retrying":   return "border-amber/50 bg-amber/15 text-amber animate-pulse";
    case "failed":     return "border-red-500/40 bg-red-500/10 text-red-400";
    default:           return "border-border bg-bg3 text-muted";
  }
}

function chipIcon(s: SlotProgress): string {
  if (s.hasMedia) return "✓";
  switch (s.status) {
    case "generating": return "⋯";
    case "retrying":   return "↻";
    case "failed":     return "✗";
    default:           return "·";
  }
}

export default function GenerateDayButton({ batchId }: { batchId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [slots, setSlots] = useState<SlotProgress[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/characters/batch-progress?batchId=${batchId}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.slots)) setSlots(data.slots);
    } catch {
      // polling is best-effort — the generate request itself reports the final result
    }
  }, [batchId]);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      fetchProgress();
      pollRef.current = setInterval(fetchProgress, 2500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loading, fetchProgress]);

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
      await fetchProgress();
      setResult(`Hotovo: ${ok}/${total} obrázkov`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      await fetchProgress();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Real progress: finished slots / total slots (image slots only get generated here,
  // but showing the video chip as pending is useful context).
  const total = slots.length;
  const done = slots.filter((s) => s.hasMedia).length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const failedSlots = slots.filter((s) => !s.hasMedia && s.status === "failed");

  return (
    <div className="space-y-2">
      <button
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] bg-accent/15 border border-accent/40 text-accent px-4 py-2 rounded hover:bg-accent/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-[15px]">bolt</span>
        {loading
          ? `Generujem… ${total > 0 ? `${done}/${total} · ` : ""}${elapsed}s`
          : "⚡ Vygenerovať celý deň (1 klik)"}
      </button>

      {loading && (
        <>
          {/* Per-slot live status */}
          {slots.length > 0 && (
            <div className="flex gap-1.5 flex-wrap max-w-md">
              {slots.map((s) => (
                <span
                  key={s.id}
                  title={s.error ?? s.status}
                  className={`font-mono text-[8px] tracking-[0.08em] px-1.5 py-0.5 border flex items-center gap-1 ${chipClass(s)}`}
                >
                  <span>{chipIcon(s)}</span>
                  {SLOT_SHORT[s.slot] ?? s.slot?.toUpperCase()}
                </span>
              ))}
            </div>
          )}
          {/* Real progress bar */}
          <div className="h-1 bg-bg3 border border-border rounded-full overflow-hidden max-w-sm">
            <div
              className="h-full bg-accent/60 transition-all duration-700 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}
      {result && <p className="font-mono text-[10px] text-teal">✓ {result}</p>}
      {!loading && failedSlots.length > 0 && (
        <p className="font-mono text-[10px] text-red-400">
          ✗ Zlyhalo: {failedSlots.map((s) => SLOT_SHORT[s.slot] ?? s.slot).join(", ")} — klikni znova pre opakovanie
        </p>
      )}
      {error && <p className="font-mono text-[10px] text-red-400">✗ {error}</p>}
    </div>
  );
}
