"use client";

import { useState } from "react";

interface Draft {
  id: string;
  series_name: string;
  title: string;
  teaser_text: string | null;
  sales_copy: string | null;
  suggested_price: number | null;
  intensity: string | null;
  ig_cta: string | null;
  fanvue_prompt: string | null;
  unlock_type: string | null;
  status: string | null;
  story_day_id: string | null;
  created_at: string;
}
interface Day { id: string; date: string; tier: string | null; location: string | null }

const STATUS_STYLES: Record<string, string> = {
  draft: "text-amber border-amber/30 bg-amber/10",
  ready: "text-teal border-teal/30 bg-teal/10",
  posted: "text-accent border-accent/30 bg-accent/10",
  archived: "text-muted border-border bg-surface-high",
};
const INTENSITY_STYLES: Record<string, string> = {
  soft: "text-teal", medium: "text-amber", strong: "text-red-400",
};

export default function FanvueClient({ drafts, dayById }: { drafts: Draft[]; dayById: Record<string, Day> }) {
  const [items, setItems] = useState(drafts);
  const [busy, setBusy] = useState<string | null>(null);

  async function update(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch("/api/characters/fanvue-unlocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (res.ok) setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    } finally { setBusy(null); }
  }

  if (items.length === 0) {
    return <div className="p-8 font-mono text-[11px] text-muted">No Fanvue drafts yet. Turn on the <span className="text-teal">fanvue_drafts</span> flag and run a daily batch — drafts appear here for review (never auto-published).</div>;
  }

  return (
    <div className="p-4 lg:p-8 grid gap-4 lg:grid-cols-2">
      {items.map((d) => {
        const day = d.story_day_id ? dayById[d.story_day_id] : undefined;
        return (
          <div key={d.id} className="bg-[#050709] border border-border p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-[11px] text-ink uppercase tracking-[0.05em]">{d.series_name}</div>
                <div className="font-mono text-[10px] text-muted2 mt-0.5">{d.title}</div>
              </div>
              <span className={`font-mono text-[8px] uppercase tracking-[0.1em] px-2 py-0.5 border ${STATUS_STYLES[d.status ?? "draft"]}`}>{d.status}</span>
            </div>

            <div className="flex flex-wrap gap-2 font-mono text-[9px] text-muted">
              <span className="border border-border px-1.5 py-0.5">{d.unlock_type}</span>
              <span className="border border-border px-1.5 py-0.5">${Number(d.suggested_price ?? 0).toFixed(2)}</span>
              <span className={`border border-border px-1.5 py-0.5 ${INTENSITY_STYLES[d.intensity ?? "medium"]}`}>intensity: {d.intensity}</span>
              {day && <span className="border border-border px-1.5 py-0.5">{day.tier} · {day.date}</span>}
            </div>

            {d.teaser_text && <div className="font-mono text-[10px] text-teal">“{d.teaser_text}”</div>}
            {d.sales_copy && <div className="font-mono text-[10px] text-muted2 leading-relaxed">{d.sales_copy}</div>}
            <div className="font-mono text-[9px] text-muted">
              IG CTA: {d.ig_cta ? <span className="text-amber">“{d.ig_cta}”</span> : <span className="text-muted/50">none (kept lifestyle)</span>}
            </div>
            {d.fanvue_prompt && (
              <details className="font-mono text-[9px] text-muted2">
                <summary className="cursor-pointer text-muted">fanvue prompt</summary>
                <p className="mt-1 leading-relaxed">{d.fanvue_prompt}</p>
              </details>
            )}

            {/* Intensity approval (engine proposes, you approve) */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[8px] text-muted uppercase">set intensity:</span>
              {(["soft", "medium", "strong"] as const).map((lvl) => (
                <button key={lvl} onClick={() => update(d.id, { intensity: lvl })} disabled={busy === d.id}
                  className={`font-mono text-[8px] uppercase px-1.5 py-0.5 border ${d.intensity === lvl ? INTENSITY_STYLES[lvl] + " border-current" : "text-muted border-border"}`}>
                  {lvl}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mt-1">
              {d.status !== "ready" && (
                <button onClick={() => update(d.id, { status: "ready" })} disabled={busy === d.id}
                  className="flex-1 font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal py-1.5 disabled:opacity-50">Mark ready</button>
              )}
              {d.status !== "archived" && (
                <button onClick={() => update(d.id, { status: "archived" })} disabled={busy === d.id}
                  className="font-mono text-[9px] uppercase border border-border text-muted px-3 py-1.5 disabled:opacity-50">Archive</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
