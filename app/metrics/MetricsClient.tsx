"use client";

import { useState } from "react";

type Engagement = Record<string, number>;
interface Post {
  id: string;
  character_id: string;
  post_type: string | null;
  status: string | null;
  growth_score: number | null;
  growth_winner: boolean | null;
  engagement: Engagement | null;
  ig_caption: string | null;
  posted_at: string | null;
  scheduled_at: string | null;
}
interface CharState { growthOn: boolean; scoredReels: number; bias: { modifier: Record<string, number>; winning_themes: string[]; weak_themes: string[] } | null }

const FIELDS = ["views", "reach", "saves", "comments", "shares", "profile_visits", "follows", "fanvue_clicks"] as const;

export default function MetricsClient({
  characters, posts, charState, threshold,
}: {
  characters: { id: string; name: string }[];
  posts: Post[];
  charState: Record<string, CharState>;
  threshold: number;
}) {
  const [draft, setDraft] = useState<Record<string, Engagement>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  function setVal(postId: string, field: string, value: string) {
    setDraft((d) => ({ ...d, [postId]: { ...(d[postId] ?? {}), [field]: Number(value) || 0 } }));
  }

  async function save(postId: string) {
    setSaving(postId);
    try {
      const res = await fetch("/api/characters/import-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, metrics: draft[postId] ?? {} }),
      });
      if (res.ok) { setSaved((s) => ({ ...s, [postId]: true })); setTimeout(() => window.location.reload(), 700); }
    } finally { setSaving(null); }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Bias readout per character */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((c) => {
          const st = charState[c.id];
          const ready = st && st.scoredReels >= threshold;
          return (
            <div key={c.id} className="bg-[#050709] border border-border p-4">
              <div className="font-mono text-[11px] text-ink uppercase tracking-[0.05em]">{c.name}</div>
              <div className="font-mono text-[9px] text-muted mt-1">
                growth_layer: {st?.growthOn ? <span className="text-teal">ON</span> : <span className="text-muted2">OFF</span>}
              </div>
              <div className="font-mono text-[9px] mt-2">
                {ready ? (
                  <span className="text-teal">bias active</span>
                ) : (
                  <span className="text-amber">bias inactive — {st?.scoredReels ?? 0}/{threshold} scored reels</span>
                )}
              </div>
              {ready && st?.bias && (
                <div className="font-mono text-[9px] text-muted2 mt-2 leading-relaxed">
                  {st.bias.winning_themes.length > 0 && <div>↑ {st.bias.winning_themes.join(", ")}</div>}
                  {st.bias.weak_themes.length > 0 && <div>↓ {st.bias.weak_themes.join(", ")}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Manual import table */}
      <div className="bg-[#050709] border border-border">
        <div className="px-4 py-3 border-b border-border font-mono text-[10px] uppercase tracking-[0.1em] text-muted2">
          Manual metric import · last 21 days ({posts.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[10px]">
            <thead>
              <tr className="text-muted/60 border-b border-border">
                <th className="text-left px-3 py-2 font-normal">post</th>
                {FIELDS.map((f) => <th key={f} className="px-2 py-2 font-normal">{f.replace("_", " ")}</th>)}
                <th className="px-2 py-2 font-normal">score</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const eng = p.engagement ?? {};
                return (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="px-3 py-2 max-w-[200px]">
                      <span className={`inline-block px-1.5 mr-1.5 ${p.growth_winner ? "text-teal" : "text-muted"}`}>
                        {p.post_type ?? "?"}{p.growth_winner ? " ★" : ""}
                      </span>
                      <span className="text-muted2 truncate">{(p.ig_caption ?? "").slice(0, 40)}</span>
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f} className="px-1 py-1">
                        <input
                          type="number"
                          defaultValue={eng[f] ?? ""}
                          onChange={(e) => setVal(p.id, f, e.target.value)}
                          className="w-16 bg-bg border border-border text-teal px-1 py-0.5 text-[10px] focus:outline-none focus:border-border2"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-center text-ink">{Math.round(Number(p.growth_score) || 0)}</td>
                    <td className="px-2 py-1">
                      <button
                        onClick={() => save(p.id)}
                        disabled={saving === p.id}
                        className="font-mono text-[9px] uppercase bg-teal/10 border border-teal/30 text-teal px-2 py-0.5 disabled:opacity-50"
                      >
                        {saved[p.id] ? "✓" : saving === p.id ? "…" : "save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
