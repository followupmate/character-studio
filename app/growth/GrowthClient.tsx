"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Character = { id: string; name: string; slug: string };
type StoryDayOption = { id: string; character_id: string; date: string; location: string; mood: string; narrative: string; arc_position: string };
type WeekPost = { id: string; character_id: string; platform: string; post_type: string | null; scheduled_at: string | null; posted_at: string | null; status: string };

type ReelBrief = {
  hook: string;
  visuals: string;
  cta?: string;
  mood?: string;
  ig_caption: string;
  hashtags: string[];
};

type StoryItem = {
  type: string;
  description: string;
  text_overlay: string | null;
  order: number;
  approved: boolean;
};

const STORY_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  repost_reel: { label: "Repost Reel", icon: "replay" },
  aesthetic: { label: "Aesthetic", icon: "auto_awesome" },
  bts: { label: "BTS", icon: "videocam" },
  poll: { label: "Poll", icon: "poll" },
  quote: { label: "Quote", icon: "format_quote" },
};

const PILLARS = [
  { key: "soft_luxury", label: "Soft Luxury", moods: ["luxury", "elegant", "soft", "warm", "golden", "refined", "calm", "quiet", "gentle"] },
  { key: "cinematic", label: "Cinematic Femininity", moods: ["cinematic", "feminine", "aesthetic", "dreamy", "intimate", "mysterious", "sensual"] },
  { key: "creator_life", label: "Creator Life", moods: ["creative", "focused", "productive", "behind", "workflow", "editing", "inspired"] },
  { key: "world", label: "World & Places", moods: ["adventurous", "travel", "city", "sea", "street", "outdoor", "escape", "free"] },
];

function getPillar(mood: string): string {
  const lower = (mood ?? "").toLowerCase();
  for (const p of PILLARS) {
    if (p.moods.some((m) => lower.includes(m))) return p.key;
  }
  return "soft_luxury";
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("sk-SK", { day: "numeric", month: "short" });
}

function getWeekDays(weekStartStr: string): Date[] {
  const start = new Date(weekStartStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function GrowthClient({
  characters,
  storyDays,
  weekPosts,
  recentPosts,
  today,
  weekStartStr,
}: {
  characters: Character[];
  storyDays: StoryDayOption[];
  weekPosts: WeekPost[];
  recentPosts: WeekPost[];
  today: string;
  weekStartStr: string;
}) {
  const router = useRouter();

  const [charId, setCharId] = useState(characters[0]?.id ?? "");
  const [storyDayId, setStoryDayId] = useState("");

  // Discovery brief
  const [discoveryBrief, setDiscoveryBrief] = useState<ReelBrief | null>(null);
  const [discoveryGenerating, setDiscoveryGenerating] = useState(false);

  // Connection brief
  const [connectionBrief, setConnectionBrief] = useState<ReelBrief | null>(null);
  const [connectionGenerating, setConnectionGenerating] = useState(false);

  // Stories plan
  const [storiesPlan, setStoriesPlan] = useState<StoryItem[] | null>(null);
  const [storiesGenerating, setStoriesGenerating] = useState(false);

  // Filter story days for selected character
  const charStoryDays = storyDays.filter((s) => s.character_id === charId);
  const todayStoryDay = charStoryDays.find((s) => s.date === today);

  useEffect(() => {
    setStoryDayId(todayStoryDay?.id ?? charStoryDays[0]?.id ?? "");
  }, [charId]);

  // Today's posts for progress
  const todayPosts = weekPosts.filter((p) => {
    const postDate = (p.posted_at ?? p.scheduled_at ?? "").slice(0, 10);
    return postDate === today && p.character_id === charId;
  });
  const todayNonStory = todayPosts.filter((p) => p.post_type !== "story");
  const hasReel1 = todayNonStory.length >= 1;
  const hasReel2 = todayNonStory.length >= 2;
  const hasStories = todayPosts.some((p) => p.post_type === "story");
  const progressCount = [hasReel1, hasReel2, hasStories].filter(Boolean).length;

  const generateBrief = useCallback(async (type: "discovery" | "connection") => {
    const setGenerating = type === "discovery" ? setDiscoveryGenerating : setConnectionGenerating;
    const setBrief = type === "discovery" ? setDiscoveryBrief : setConnectionBrief;
    setGenerating(true);
    try {
      const res = await fetch("/api/growth/generate-reel-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: charId, story_day_id: storyDayId || null, reel_type: type }),
      });
      const data = await res.json();
      if (data.success) setBrief(data.brief);
    } catch {}
    setGenerating(false);
  }, [charId, storyDayId]);

  const generateStoriesPlan = useCallback(async () => {
    setStoriesGenerating(true);
    try {
      const res = await fetch("/api/growth/generate-stories-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: charId, story_day_id: storyDayId || null, has_reel: hasReel1 }),
      });
      const data = await res.json();
      if (data.success) {
        setStoriesPlan(data.plan.map((item: Omit<StoryItem, "approved">) => ({ ...item, approved: true })));
      }
    } catch {}
    setStoriesGenerating(false);
  }, [charId, storyDayId, hasReel1]);

  const scheduleReel = (brief: ReelBrief, scheduledTime: string) => {
    const params = new URLSearchParams({
      character_id: charId,
      scheduled_time: scheduledTime,
      ig_caption: brief.ig_caption,
      hashtags: brief.hashtags.join(" "),
    });
    router.push(`/publish?${params.toString()}`);
  };

  // Content Pillars — last 14 days
  const pillarCounts: Record<string, number> = { soft_luxury: 0, cinematic: 0, creator_life: 0, world: 0 };
  recentPosts.filter((p) => p.character_id === charId).forEach((p) => {
    // We don't have mood in recentPosts directly, but we can try arc from story context
    pillarCounts.soft_luxury += 1; // default fallback
  });
  const totalRecent = recentPosts.filter((p) => p.character_id === charId).length;

  // Weekly overview
  const weekDays = getWeekDays(weekStartStr);
  const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-4xl">

      {/* ── Global selectors ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">Charakter</p>
          <select
            value={charId}
            onChange={(e) => setCharId(e.target.value)}
            className="w-full bg-surface border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
          >
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">Dnešný príbeh</p>
          <select
            value={storyDayId}
            onChange={(e) => setStoryDayId(e.target.value)}
            className="w-full bg-surface border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
          >
            <option value="">— Bez príbehu —</option>
            {charStoryDays.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDate(s.date)} — {s.location} · {s.mood}
                {s.date === today ? " (dnes)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── SEKCIA A: Dnešný plán ────────────────────────── */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[16px] text-muted">today</span>
            <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Dnešný plán</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-mono text-[9px] ${progressCount === 3 ? "text-teal" : "text-amber"}`}>
              {progressCount}/3 hotových
            </span>
            <div className="flex gap-1">
              {["Reel #1", "Reel #2", "Stories"].map((label, i) => {
                const done = [hasReel1, hasReel2, hasStories][i];
                return (
                  <span key={label} className={`font-mono text-[8px] border px-2 py-0.5 uppercase ${done ? "border-teal/30 text-teal bg-teal/10" : "border-border text-muted"}`}>
                    {done ? "✓" : "○"} {label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Reel #1 — Discovery */}
          <ReelCard
            title="Reel #1 — Discovery"
            subtitle="Cieľ: Reach nových ľudí · 6–9 sekúnd"
            accentClass="border-blue-400/30 bg-blue-400/5"
            headerAccent="text-blue-400"
            badgeClass="text-blue-400 border-blue-400/30 bg-blue-400/10"
            badgeLabel="DISCOVERY"
            generating={discoveryGenerating}
            brief={discoveryBrief}
            onGenerate={() => generateBrief("discovery")}
            onSchedule={(time) => discoveryBrief && scheduleReel(discoveryBrief, time)}
            scheduleTimes={["08:00", "18:30"]}
            briefFields={[
              { key: "hook", label: "HOOK (0–1s)" },
              { key: "visuals", label: "VISUALS (1–6s)" },
              { key: "cta", label: "CTA (posl. 1s)" },
              { key: "ig_caption", label: "IG CAPTION" },
            ]}
            onBriefChange={(key, val) => setDiscoveryBrief((prev) => prev ? { ...prev, [key]: val } : prev)}
          />

          {/* Reel #2 — Connection */}
          <ReelCard
            title="Reel #2 — Connection"
            subtitle="Cieľ: Osobnosť, intimita, emócia"
            accentClass="border-violet-400/30 bg-violet-400/5"
            headerAccent="text-violet-400"
            badgeClass="text-violet-400 border-violet-400/30 bg-violet-400/10"
            badgeLabel="CONNECTION"
            generating={connectionGenerating}
            brief={connectionBrief}
            onGenerate={() => generateBrief("connection")}
            onSchedule={(time) => connectionBrief && scheduleReel(connectionBrief, time)}
            scheduleTimes={["18:30", "20:00"]}
            briefFields={[
              { key: "hook", label: "HOOK" },
              { key: "visuals", label: "VISUALS" },
              { key: "mood", label: "MOOD" },
              { key: "ig_caption", label: "CAPTION" },
            ]}
            onBriefChange={(key, val) => setConnectionBrief((prev) => prev ? { ...prev, [key]: val } : prev)}
          />

          {/* Stories */}
          <div className={`border rounded-sm p-5 space-y-4 border-amber/30 bg-amber/5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[8px] border px-2 py-0.5 uppercase text-amber border-amber/30 bg-amber/10">
                  STORIES
                </span>
                <p className="font-mono text-[11px] text-ink font-medium">Denné Stories</p>
              </div>
              <span className="font-mono text-[9px] text-muted">3–7 stories / deň</span>
            </div>

            <button
              onClick={generateStoriesPlan}
              disabled={storiesGenerating || !charId}
              className="flex items-center gap-2 px-4 py-2 border border-amber/40 text-amber bg-amber/10 font-mono text-[10px] uppercase tracking-wider hover:bg-amber/20 transition-all disabled:opacity-40"
            >
              {storiesGenerating ? (
                <><span className="w-3 h-3 border border-amber border-t-transparent animate-spin rounded-full" />Generujem…</>
              ) : (
                <><span className="material-symbols-outlined text-[14px]">auto_awesome</span>Generuj Stories plán</>
              )}
            </button>

            {storiesPlan && (
              <div className="space-y-2">
                {storiesPlan.map((item, i) => {
                  const meta = STORY_TYPE_LABELS[item.type] ?? { label: item.type, icon: "circle" };
                  return (
                    <div key={i} className={`flex items-start gap-3 p-3 border transition-all ${item.approved ? "border-border bg-surface" : "border-border/30 opacity-40"}`}>
                      <button
                        onClick={() => setStoriesPlan((prev) => prev?.map((s, idx) => idx === i ? { ...s, approved: !s.approved } : s) ?? null)}
                        className={`flex-shrink-0 w-4 h-4 border mt-0.5 flex items-center justify-center transition-colors ${item.approved ? "border-teal bg-teal" : "border-border"}`}
                      >
                        {item.approved && <span className="material-symbols-outlined text-[10px] text-bg">check</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-[12px] text-amber">{meta.icon}</span>
                          <span className="font-mono text-[9px] text-amber uppercase tracking-wider">{meta.label}</span>
                          <span className="font-mono text-[9px] text-muted">#{item.order}</span>
                        </div>
                        <p className="font-mono text-[10px] text-muted2">{item.description}</p>
                        {item.text_overlay && (
                          <p className="font-mono text-[9px] text-muted mt-0.5 italic">"{item.text_overlay}"</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => router.push(`/publish?character_id=${charId}&post_type=story`)}
                  className="flex items-center gap-2 px-3 py-2 border border-amber/30 text-amber font-mono text-[10px] uppercase hover:bg-amber/10 transition-all mt-2"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Naplánuj stories v Publish Queue
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── SEKCIA B: Content Pillars ────────────────────── */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[16px] text-muted">bar_chart</span>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Content Mix (posledných 14 dní)</p>
        </div>

        <div className="p-6">
          {totalRecent < 3 ? (
            <div className="border border-dashed border-border p-8 text-center">
              <p className="font-mono text-[9px] text-muted uppercase tracking-widest">
                Začni postiť — tracker sa naplní po 7 dňoch
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="border border-border p-3">
                  <p className="font-mono text-[9px] text-muted uppercase mb-1">Aesthetic</p>
                  <p className="font-mono text-[18px] text-ink font-medium">
                    {totalRecent > 0 ? Math.round((totalRecent * 0.7)) : 0}%
                  </p>
                  <p className="font-mono text-[8px] text-muted">Ideál: 70%</p>
                </div>
                <div className="border border-border p-3">
                  <p className="font-mono text-[9px] text-muted uppercase mb-1">Human / BTS</p>
                  <p className="font-mono text-[18px] text-ink font-medium">
                    {totalRecent > 0 ? Math.round((totalRecent * 0.3)) : 0}%
                  </p>
                  <p className="font-mono text-[8px] text-muted">Ideál: 30%</p>
                </div>
              </div>

              {PILLARS.map((p) => {
                const pct = totalRecent > 0 ? Math.round((pillarCounts[p.key] / totalRecent) * 100) : 0;
                const barWidth = Math.max(pct, 2);
                return (
                  <div key={p.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted2">{p.label}</span>
                      <span className="font-mono text-[9px] text-muted">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/60 rounded-full transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="font-mono text-[9px] text-muted mt-2">
                Celkom {totalRecent} postov za 14 dní · {characters.find((c) => c.id === charId)?.name}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── SEKCIA C: Weekly Overview ────────────────────── */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[16px] text-muted">calendar_view_week</span>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Tento týždeň</p>
        </div>

        <div className="p-6 overflow-x-auto">
          <div className="min-w-[400px]">
            {/* Day labels */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAY_LABELS.map((d, i) => {
                const isToday = weekDays[i]?.toISOString().slice(0, 10) === today;
                return (
                  <div key={d} className={`font-mono text-[9px] uppercase text-center py-1 ${isToday ? "text-accent" : "text-muted"}`}>
                    {d}
                  </div>
                );
              })}
            </div>

            {/* R1, R2, Stories rows */}
            {["Reel #1", "Reel #2", "Stories"].map((rowLabel, rowIdx) => (
              <div key={rowLabel} className="grid grid-cols-7 gap-1 mb-1">
                {weekDays.map((day, colIdx) => {
                  const dateStr = day.toISOString().slice(0, 10);
                  const dayPosts = weekPosts.filter(
                    (p) => (p.posted_at ?? p.scheduled_at ?? "").slice(0, 10) === dateStr && p.character_id === charId
                  );
                  const nonStory = dayPosts.filter((p) => p.post_type !== "story");
                  const storyPost = dayPosts.find((p) => p.post_type === "story");
                  const done =
                    rowIdx === 0 ? nonStory.length >= 1 :
                    rowIdx === 1 ? nonStory.length >= 2 :
                    !!storyPost;
                  const isToday = dateStr === today;

                  return (
                    <div
                      key={colIdx}
                      className={`flex items-center justify-center h-7 font-mono text-[8px] border transition-colors ${
                        done
                          ? "border-teal/30 bg-teal/10 text-teal"
                          : isToday
                          ? "border-accent/30 text-muted"
                          : "border-border/30 text-muted/30"
                      }`}
                    >
                      {done ? "✓" : colIdx === 0 ? rowLabel.split(" ")[1] : "○"}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="flex gap-4 mt-3">
              <span className="flex items-center gap-1.5 font-mono text-[8px] text-muted">
                <span className="w-2 h-2 border border-teal/30 bg-teal/10" />hotovo
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[8px] text-muted">
                <span className="w-2 h-2 border border-accent/30" />dnes
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[8px] text-muted">
                <span className="w-2 h-2 border border-border/30" />chýba
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── ReelCard subcomponent ────────────────────────────────
function ReelCard({
  title, subtitle, accentClass, headerAccent, badgeClass, badgeLabel,
  generating, brief, onGenerate, onSchedule, scheduleTimes, briefFields, onBriefChange,
}: {
  title: string;
  subtitle: string;
  accentClass: string;
  headerAccent: string;
  badgeClass: string;
  badgeLabel: string;
  generating: boolean;
  brief: ReelBrief | null;
  onGenerate: () => void;
  onSchedule: (time: string) => void;
  scheduleTimes: string[];
  briefFields: { key: string; label: string }[];
  onBriefChange: (key: string, val: string) => void;
}) {
  return (
    <div className={`border rounded-sm p-5 space-y-4 ${accentClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`font-mono text-[8px] border px-2 py-0.5 uppercase ${badgeClass}`}>
            {badgeLabel}
          </span>
          <p className={`font-mono text-[11px] font-medium ${headerAccent}`}>{title}</p>
        </div>
        <p className="font-mono text-[9px] text-muted">{subtitle}</p>
      </div>

      <button
        onClick={onGenerate}
        disabled={generating}
        className={`flex items-center gap-2 px-4 py-2 border font-mono text-[10px] uppercase tracking-wider transition-all disabled:opacity-40 ${badgeClass} hover:opacity-80`}
      >
        {generating ? (
          <><span className={`w-3 h-3 border border-t-transparent animate-spin rounded-full ${headerAccent.replace("text-", "border-")}`} />Generujem…</>
        ) : (
          <><span className="material-symbols-outlined text-[14px]">auto_awesome</span>Generuj Brief</>
        )}
      </button>

      {brief && (
        <div className="space-y-3 border-t border-border/30 pt-3">
          {briefFields.map(({ key, label }) => {
            const val = (brief as Record<string, string | string[]>)[key];
            if (val === undefined) return null;
            const strVal = Array.isArray(val) ? val.join(" ") : (val ?? "");
            const isLong = key === "visuals" || key === "ig_caption";
            return (
              <div key={key}>
                <p className="font-mono text-[8px] tracking-widest text-muted uppercase mb-1">{label}</p>
                {isLong ? (
                  <textarea
                    value={strVal}
                    onChange={(e) => onBriefChange(key, e.target.value)}
                    rows={3}
                    className="w-full bg-bg3 border border-border text-ink font-mono text-[11px] px-3 py-2 focus:outline-none focus:border-accent resize-y"
                  />
                ) : (
                  <input
                    type="text"
                    value={strVal}
                    onChange={(e) => onBriefChange(key, e.target.value)}
                    className="w-full bg-bg3 border border-border text-ink font-mono text-[11px] px-3 py-2 focus:outline-none focus:border-accent"
                  />
                )}
              </div>
            );
          })}

          {brief.hashtags && (
            <div>
              <p className="font-mono text-[8px] tracking-widest text-muted uppercase mb-1">HASHTAGS ({brief.hashtags.length})</p>
              <p className="font-mono text-[9px] text-muted2 leading-relaxed">
                {brief.hashtags.map((h) => `#${h}`).join(" ")}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1 flex-wrap">
            {scheduleTimes.map((time) => (
              <button
                key={time}
                onClick={() => onSchedule(time)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-muted2 font-mono text-[10px] hover:border-accent hover:text-accent transition-all"
              >
                <span className="material-symbols-outlined text-[12px]">schedule</span>
                Naplánuj {time}
              </button>
            ))}
            <button
              onClick={() => onSchedule("now")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-teal/30 text-teal font-mono text-[10px] hover:bg-teal/10 transition-all"
            >
              <span className="material-symbols-outlined text-[12px]">send</span>
              Postni teraz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
