"use client";

import { useState, useEffect } from "react";

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
  media_urls?: string[] | null;
  published_at?: string | null;
  publish_error?: string | null;
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
  const [generating, setGenerating] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<{ configured: boolean; ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    fetch("/api/fanvue/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

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

  // Step 1: generate the sellable photo set from fanvue_prompt (Higgsfield Soul)
  async function generateSet(id: string) {
    setGenerating(id);
    try {
      const res = await fetch("/api/fanvue/generate-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockId: id, count: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, media_urls: data.media_urls, publish_error: null } : x)));
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, publish_error: e instanceof Error ? e.message : String(e) } : x)));
    } finally { setGenerating(null); }
  }

  // Step 2: publish to Fanvue — explicit confirm, nothing automatic
  async function publish(id: string, mode: "post" | "mass_message") {
    const item = items.find((x) => x.id === id);
    const priceEur = Number(prices[id] ?? item?.suggested_price ?? 0) || 0;
    const label = mode === "mass_message"
      ? `Poslať PPV správu všetkým subscriberom za ${priceEur > 0 ? `€${priceEur.toFixed(2)}` : "zadarmo"}?`
      : `Publikovať post na Fanvue ${priceEur > 0 ? `s cenou €${priceEur.toFixed(2)}` : "zadarmo (subscribers only)"}?`;
    if (!window.confirm(label)) return;

    setPublishing(id);
    try {
      const res = await fetch("/api/fanvue/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockId: id, mode, priceEur }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: "posted", published_at: new Date().toISOString(), publish_error: null } : x)));
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, publish_error: e instanceof Error ? e.message : String(e) } : x)));
    } finally { setPublishing(null); }
  }

  if (items.length === 0) {
    return <div className="p-8 font-mono text-[11px] text-muted">No Fanvue drafts yet. Turn on the <span className="text-teal">fanvue_drafts</span> flag and run a daily batch — drafts appear here for review (never auto-published).</div>;
  }

  return (
    <div className="p-4 lg:p-8 space-y-4">
      {/* Fanvue API status */}
      {health && (
        <div className={`px-4 py-2.5 border font-mono text-[10px] flex items-center gap-2 ${
          health.ok ? "bg-teal/5 border-teal/20 text-teal" : "bg-amber/5 border-amber/20 text-amber"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${health.ok ? "bg-teal" : "bg-amber"}`} />
          {health.ok
            ? "Fanvue API pripojené — publish je aktívny"
            : !health.configured
              ? "FANVUE_API_KEY chýba vo Vercel env — publish tlačidlá zlyhajú, kým ho nenastavíš (Fanvue → Creator Settings → API keys)"
              : `Fanvue API problém: ${health.detail}`}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
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

            {/* Generated set (step 1) */}
            <div className="border border-border p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">Set · {(d.media_urls ?? []).length} fotiek</span>
                <button
                  onClick={() => generateSet(d.id)}
                  disabled={generating === d.id}
                  className="font-mono text-[9px] uppercase bg-accent/10 border border-accent/30 text-accent px-2.5 py-1 hover:bg-accent/20 transition-colors disabled:opacity-50"
                >
                  {generating === d.id ? "Generujem… (~2 min)" : (d.media_urls?.length ? "↻ Pregenerovať set" : "⚡ Vygeneruj set (3)")}
                </button>
              </div>
              {(d.media_urls ?? []).length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto">
                  {(d.media_urls ?? []).map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={`set ${i + 1}`} className="h-24 w-auto object-cover border border-border" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Publish to Fanvue (step 2 — explicit, confirmed) */}
            {(d.media_urls ?? []).length > 0 && d.status !== "posted" && (
              <div className="border border-teal/20 bg-teal/5 p-2.5 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[8px] text-muted uppercase tracking-[0.1em] flex-shrink-0">Cena €</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={prices[d.id] ?? String(d.suggested_price ?? 0)}
                    onChange={(e) => setPrices((p) => ({ ...p, [d.id]: e.target.value }))}
                    className="w-20 bg-bg border border-border font-mono text-[10px] text-ink px-2 py-1 focus:outline-none focus:border-teal"
                  />
                  <span className="font-mono text-[8px] text-muted">0 = zadarmo · min platené €3</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => publish(d.id, "post")}
                    disabled={publishing === d.id}
                    className="flex-1 font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal py-1.5 hover:bg-teal/20 transition-colors disabled:opacity-50"
                  >
                    {publishing === d.id ? "Publikujem…" : "→ Fanvue post"}
                  </button>
                  <button
                    onClick={() => publish(d.id, "mass_message")}
                    disabled={publishing === d.id}
                    className="flex-1 font-mono text-[9px] uppercase bg-amber/10 border border-amber/30 text-amber py-1.5 hover:bg-amber/20 transition-colors disabled:opacity-50"
                  >
                    {publishing === d.id ? "Posielam…" : "→ PPV správa subs"}
                  </button>
                </div>
              </div>
            )}

            {d.published_at && (
              <div className="font-mono text-[9px] text-accent">
                ✓ Publikované na Fanvue · {new Date(d.published_at).toLocaleString("sk-SK")}
              </div>
            )}
            {d.publish_error && (
              <div className="font-mono text-[9px] text-red-400 leading-relaxed break-words">✗ {d.publish_error}</div>
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
    </div>
  );
}
