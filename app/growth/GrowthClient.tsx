"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Character = { id: string; name: string; slug: string };
type StoryDay = { id: string; character_id: string; tier: string | null; drift_seeds: Array<{ kind: string; detail?: string }> | null; emotional_beat: string | null; mood: string; location: string; created_at: string };
type DailyPlan = { id: string; character_id: string; batch_status: string | null; scene_brief: Record<string, unknown> | null; created_at: string };
type Media = { id: string; batch_id: string; channel: string | null; slot: string | null; generation_status: string | null };
type WeekPost = { id: string; character_id: string; platform: string; post_type: string | null; scheduled_at: string | null; posted_at: string | null; status: string };
type RecentPost = { id: string; character_id: string; post_type: string | null; posted_at: string | null; platform: string };

function getWeekDays(weekStartStr: string): Date[] {
  const start = new Date(weekStartStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function postsByDay(posts: RecentPost[], days: number): Map<string, number> {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const p of posts) {
    const d = (p.posted_at ?? "").slice(0, 10);
    if (map.has(d)) map.set(d, (map.get(d) ?? 0) + 1);
  }
  return map;
}

function computeStreak(byDay: Map<string, number>): number {
  const now = new Date();
  let streak = 0;
  for (let i = 0; i < 100; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) break;
    if ((byDay.get(key) ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

const BATCH_STATUS_STYLES: Record<string, string> = {
  planned:         "text-muted2 border-border bg-bg3",
  generating:      "text-amber border-amber/30 bg-amber/10 animate-pulse",
  ready:           "text-teal border-teal/30 bg-teal/10",
  partial_failed:  "text-amber border-amber/30 bg-amber/10",
  failed:          "text-red-400 border-red-500/30 bg-red-500/10",
  published:       "text-accent border-accent/30 bg-accent/10",
};

const GEN_STATUS_STYLES: Record<string, string> = {
  pending:    "text-muted2",
  generating: "text-amber animate-pulse",
  completed:  "text-teal",
  failed:     "text-red-400",
  retrying:   "text-amber animate-pulse",
};

export default function GrowthClient({
  characters,
  todayStory,
  todayPlans,
  todayMedia,
  weekPosts,
  recentPosts,
  today,
  weekStartStr,
}: {
  characters: Character[];
  todayStory: StoryDay[];
  todayPlans: DailyPlan[];
  todayMedia: Media[];
  weekPosts: WeekPost[];
  recentPosts: RecentPost[];
  today: string;
  weekStartStr: string;
}) {
  const [charId, setCharId] = useState(characters[0]?.id ?? "");

  useEffect(() => {
    if (!charId && characters[0]) setCharId(characters[0].id);
  }, [charId, characters]);

  const story = todayStory.find((s) => s.character_id === charId) ?? null;
  const plan = todayPlans.find((p) => p.character_id === charId) ?? null;
  const planMedia = todayMedia.filter((m) => m.batch_id === plan?.id);
  const todayPosts = weekPosts.filter((p) => {
    const date = (p.posted_at ?? p.scheduled_at ?? "").slice(0, 10);
    return date === today && p.character_id === charId;
  });

  const charRecentPosts = recentPosts.filter((p) => p.character_id === charId);
  const byDay = postsByDay(charRecentPosts, 14);
  const totalPosted14 = charRecentPosts.length;
  const daysWithContent = Array.from(byDay.values()).filter((n) => n > 0).length;
  const streak = computeStreak(byDay);

  const slotsCompleted = planMedia.filter((m) => m.generation_status === "completed").length;
  const slotsFailed = planMedia.filter((m) => m.generation_status === "failed").length;
  const slotsTotal = planMedia.length;

  const publishedToday = {
    feed: todayPosts.filter((p) => p.post_type === "feed" || p.post_type === "carousel").filter((p) => p.status === "posted").length,
    reel: todayPosts.filter((p) => p.post_type === "reel").filter((p) => p.status === "posted").length,
    story: todayPosts.filter((p) => p.post_type === "story").filter((p) => p.status === "posted").length,
  };

  const weekDays = getWeekDays(weekStartStr);
  const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

  const charName = characters.find((c) => c.id === charId)?.name ?? "—";

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-4xl">

      {/* Character selector */}
      <div>
        <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1.5">Charakter</p>
        <select
          value={charId}
          onChange={(e) => setCharId(e.target.value)}
          className="w-full sm:w-auto bg-surface border border-border text-ink font-mono text-[12px] px-3 py-2.5 focus:outline-none focus:border-accent"
        >
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* DNES */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[16px] text-muted">today</span>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Dnes</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Story status */}
          <div>
            <p className="font-mono text-[8px] tracking-widest text-muted uppercase mb-2">Story chapter</p>
            {story ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-teal">📍 {story.location}</span>
                <span className="text-border2">·</span>
                <span className="font-mono text-[10px] text-muted2 italic">{story.mood}</span>
                {story.emotional_beat && (
                  <span className="font-mono text-[9px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 uppercase tracking-wider">
                    {story.emotional_beat.replace(/_/g, " ")}
                  </span>
                )}
                {story.tier && (
                  <span className="font-mono text-[9px] bg-bg3 border border-border text-muted2 px-2 py-0.5 uppercase tracking-wider">
                    {story.tier.replace(/_/g, " ")}
                  </span>
                )}
                {(story.drift_seeds ?? []).map((s) => (
                  <span key={s.kind} className="font-mono text-[9px] bg-amber/10 border border-amber/20 text-amber px-2 py-0.5 uppercase tracking-wider">
                    ⊘ {s.kind.replace(/_/g, " ")}{s.detail ? ` · ${s.detail}` : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[10px] text-muted italic">— story sa ešte nevygenerovala (cron 06:00 UTC) —</p>
            )}
          </div>

          {/* Batch status */}
          <div>
            <p className="font-mono text-[8px] tracking-widest text-muted uppercase mb-2">Batch</p>
            {plan ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className={`font-mono text-[9px] border px-2 py-0.5 uppercase tracking-wider ${BATCH_STATUS_STYLES[plan.batch_status ?? "planned"] ?? BATCH_STATUS_STYLES.planned}`}>
                  {(plan.batch_status ?? "planned").replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[10px] text-muted2">
                  {slotsCompleted} / {slotsTotal} slotov
                  {slotsFailed > 0 && <span className="text-red-400 ml-1">· {slotsFailed} failed</span>}
                </span>
                {plan.scene_brief && (
                  <span className="font-mono text-[9px] text-muted">scene brief ✓</span>
                )}
                <Link href="/today" className="font-mono text-[9px] text-accent hover:underline flex items-center gap-1">
                  <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                  prejdi na batch
                </Link>
              </div>
            ) : (
              <p className="font-mono text-[10px] text-muted italic">— batch sa nevytvoril —</p>
            )}

            {/* Per-slot breakdown */}
            {plan && planMedia.length > 0 && (
              <div className="mt-3 grid grid-cols-4 sm:grid-cols-8 gap-1">
                {["carousel_1", "carousel_2", "carousel_3", "carousel_4", "carousel_5", "reel_start_frame", "reel_video", "story_bts"].map((slot) => {
                  const m = planMedia.find((mm) => mm.slot === slot);
                  const status = m?.generation_status ?? "missing";
                  const cls = GEN_STATUS_STYLES[status] ?? "text-muted/40";
                  const short = slot === "reel_start_frame" ? "Start" :
                    slot === "reel_video" ? "Reel" :
                    slot === "story_bts" ? "Story" :
                    slot.replace("carousel_", "C");
                  return (
                    <div key={slot} className={`flex flex-col items-center justify-center h-12 border border-border/40 font-mono ${cls}`}>
                      <span className="text-[8px] tracking-wider">{short}</span>
                      <span className="text-[10px]">
                        {status === "completed" ? "✓" : status === "failed" ? "✕" : status === "missing" ? "—" : "○"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Published today */}
          <div>
            <p className="font-mono text-[8px] tracking-widest text-muted uppercase mb-2">Publikované dnes</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Feed", count: publishedToday.feed },
                { label: "Reel", count: publishedToday.reel },
                { label: "Story", count: publishedToday.story },
              ].map(({ label, count }) => (
                <div key={label} className={`border px-3 py-2 ${count > 0 ? "border-teal/30 bg-teal/5" : "border-border bg-bg3"}`}>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-muted mb-0.5">{label}</p>
                  <p className={`font-mono text-[14px] font-medium ${count > 0 ? "text-teal" : "text-muted2"}`}>
                    {count > 0 ? `${count} ✓` : "○"}
                  </p>
                </div>
              ))}
            </div>
            <Link href="/publish" className="inline-flex items-center gap-1 font-mono text-[9px] text-accent hover:underline mt-2">
              <span className="material-symbols-outlined text-[11px]">open_in_new</span>
              Publish Queue
            </Link>
          </div>
        </div>
      </section>

      {/* TENTO TÝŽDEŇ */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[16px] text-muted">calendar_view_week</span>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Tento týždeň</p>
        </div>

        <div className="p-6 overflow-x-auto">
          <div className="min-w-[420px]">
            <div className="grid grid-cols-8 gap-1 mb-2">
              <div className="font-mono text-[9px] uppercase text-muted py-1">&nbsp;</div>
              {DAY_LABELS.map((d, i) => {
                const isToday = weekDays[i]?.toISOString().slice(0, 10) === today;
                return (
                  <div key={d} className={`font-mono text-[9px] uppercase text-center py-1 ${isToday ? "text-accent" : "text-muted"}`}>
                    {d}
                  </div>
                );
              })}
            </div>

            {(["feed", "reel", "story"] as const).map((channel) => (
              <div key={channel} className="grid grid-cols-8 gap-1 mb-1">
                <div className="font-mono text-[9px] uppercase text-muted2 flex items-center">{channel}</div>
                {weekDays.map((day, colIdx) => {
                  const dateStr = day.toISOString().slice(0, 10);
                  const dayPosts = weekPosts.filter(
                    (p) => (p.posted_at ?? p.scheduled_at ?? "").slice(0, 10) === dateStr && p.character_id === charId
                  );
                  const match = dayPosts.filter((p) => {
                    if (channel === "feed") return p.post_type === "feed" || p.post_type === "carousel";
                    if (channel === "reel") return p.post_type === "reel";
                    return p.post_type === "story";
                  });
                  const posted = match.some((p) => p.status === "posted");
                  const scheduled = match.some((p) => p.status === "scheduled");
                  const isToday = dateStr === today;

                  let cls = "border-border/30 text-muted/30";
                  let symbol = "○";
                  if (posted) { cls = "border-teal/40 bg-teal/10 text-teal"; symbol = "✓"; }
                  else if (scheduled) { cls = "border-accent/30 bg-accent/5 text-accent"; symbol = "·"; }
                  else if (isToday) { cls = "border-accent/30 text-muted"; symbol = "○"; }

                  return (
                    <div key={colIdx} className={`flex items-center justify-center h-7 font-mono text-[10px] border transition-colors ${cls}`}>
                      {symbol}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="flex gap-4 mt-3 flex-wrap">
              <span className="flex items-center gap-1.5 font-mono text-[8px] text-muted">
                <span className="w-2 h-2 border border-teal/40 bg-teal/10" />posted
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[8px] text-muted">
                <span className="w-2 h-2 border border-accent/30 bg-accent/5" />scheduled
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[8px] text-muted">
                <span className="w-2 h-2 border border-border/30" />nič
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* POSLEDNÝCH 14 DNÍ */}
      <section className="bg-bg2 border border-border">
        <div className="px-6 py-4 border-b border-border bg-bg3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[16px] text-muted">bar_chart</span>
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Posledných 14 dní · {charName}</p>
        </div>

        <div className="p-6 grid grid-cols-3 gap-3">
          <div className="border border-border bg-bg3 p-4">
            <p className="font-mono text-[9px] text-muted uppercase mb-1">Total posts</p>
            <p className="font-mono text-[22px] font-medium text-ink">{totalPosted14}</p>
            <p className="font-mono text-[9px] text-muted mt-1">posted in last 14 days</p>
          </div>
          <div className={`border p-4 ${daysWithContent >= 10 ? "border-teal/30 bg-teal/5" : "border-border bg-bg3"}`}>
            <p className="font-mono text-[9px] text-muted uppercase mb-1">Days with content</p>
            <p className={`font-mono text-[22px] font-medium ${daysWithContent >= 10 ? "text-teal" : "text-ink"}`}>
              {daysWithContent} / 14
            </p>
            <p className="font-mono text-[9px] text-muted mt-1">target ≥ 10 / 14</p>
          </div>
          <div className={`border p-4 ${streak >= 5 ? "border-teal/30 bg-teal/5" : streak >= 2 ? "border-amber/30 bg-amber/5" : "border-border bg-bg3"}`}>
            <p className="font-mono text-[9px] text-muted uppercase mb-1">Current streak</p>
            <p className={`font-mono text-[22px] font-medium ${streak >= 5 ? "text-teal" : streak >= 2 ? "text-amber" : "text-muted2"}`}>
              {streak} {streak === 1 ? "deň" : streak >= 2 && streak <= 4 ? "dni" : "dní"}
            </p>
            <p className="font-mono text-[9px] text-muted mt-1">consecutive days</p>
          </div>
        </div>
      </section>
    </div>
  );
}
