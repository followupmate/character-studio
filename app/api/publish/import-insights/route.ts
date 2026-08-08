import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { calculateGrowthScore, GrowthMetrics } from "@/lib/growthScore";
import { requireCron } from "@/lib/apiAuth";
import { getIgAccessToken } from "@/lib/igToken";
import { resolveCycleState, buildKeysetFilter, resolveBatchSize, CursorRow } from "@/lib/importInsightsCursor";

export const runtime = "nodejs";
export const maxDuration = 120;

// AUTO GROWTH LOOP — closes the feedback loop the engine was missing.
// Pulls Instagram insights for recently published posts via the SAME Graph API
// token the publish pipeline already uses, merges them into chs_posts.engagement,
// recomputes growth_score + growth_winner (top ~30%). Runs daily from vercel.json
// cron; manual fields imported via /api/characters/import-metrics (fanvue_clicks…)
// are preserved by the merge.
//
// BATCHED, RESUMABLE: the external cron caller (cron-job.org) has a hard 30s timeout, and a
// 90-day window can span far more posts than fit in one sequential IG API pass under that. So
// this route processes one small batch per call (see lib/importInsightsCursor.ts) and persists
// a cursor in chs_import_insights_cursor — the caller keeps hitting the same plain URL, newest
// posts first, and the route resumes on its own until the window is fully covered, then starts
// a fresh cycle from the newest post again.
const CURSOR_ID = "default";

// Metric sets from richest to safest, chosen per post_type since REELS and FEED/CAROUSEL
// media support different metric combinations. Verified against real Meta docs AND, because
// docs and reality disagreed on one field, against direct empirical test calls to our own
// account (see the Creative Intelligence report):
//   - profile_visits/follows: FEED/CAROUSEL only, never returned for REELS
//   - ig_reels_avg_watch_time: REELS only, confirmed working (HTTP 200, real value)
//   - total_interactions: confirmed working on both REELS and CAROUSEL
//   - reposts: documented as supported, but a real test call against both a REELS and a
//     CAROUSEL post returned "Instagram Insights Media API endpoint does not support the
//     metrics: reposts" (HTTP 400) on our account/API version — deliberately NOT requested.
// An unsupported metric fails the WHOLE call, so each list still walks down from richest
// to safest — this is not new behavior, just two separate chains instead of one.
const REEL_METRIC_SETS = [
  "views,reach,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time",
  "views,reach,likes,comments,saved,shares,total_interactions",
  "views,reach,likes,comments,saved,shares",
  "reach,likes,comments,saved,shares",
];
const FEED_METRIC_SETS = [
  "views,reach,likes,comments,saved,shares,profile_visits,follows,total_interactions",
  "views,reach,likes,comments,saved,shares,profile_visits,follows",
  "views,reach,likes,comments,saved,shares",
  "reach,likes,comments,saved,shares",
];

interface IgInsightsResponse {
  data?: Array<{ name: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }>;
  error?: { message?: string };
}

// Superset of GrowthMetrics (which lib/growthScore.ts's calculateGrowthScore() reads from —
// left untouched) plus the newly-fetched fields. A metric IG doesn't return for this specific
// call is simply absent from `raw`, so it stays `undefined` here — never coerced to 0. That
// distinction (0 = confirmed zero, undefined = not fetched) is preserved all the way through
// to the merge below and into Creative Intelligence's scoring.
interface FetchedMetrics extends GrowthMetrics {
  total_interactions?: number;
  avg_watch_time_sec?: number;
}

async function fetchInsights(mediaId: string, token: string, metricSets: string[]): Promise<{ metrics: FetchedMetrics | null; error?: string }> {
  let lastError = "";
  for (const metricSet of metricSets) {
    const res = await fetch(
      `https://graph.instagram.com/v23.0/${mediaId}/insights?metric=${metricSet}&access_token=${token}`
    );
    const data = (await res.json().catch(() => ({}))) as IgInsightsResponse;
    if (res.ok && Array.isArray(data.data)) {
      const raw: Record<string, number> = {};
      for (const m of data.data) {
        raw[m.name] = Number(m.values?.[0]?.value ?? m.total_value?.value ?? 0) || 0;
      }
      return {
        metrics: {
          views: raw.views,
          reach: raw.reach,
          likes: raw.likes,
          comments: raw.comments,
          saves: raw.saved,
          shares: raw.shares,
          profile_visits: raw.profile_visits,
          follows: raw.follows,
          total_interactions: raw.total_interactions,
          // ig_reels_avg_watch_time is returned in milliseconds (confirmed empirically:
          // real value 8452 for an 8-9s reel) — stored in seconds for a human-readable unit
          // consistent with how duration_sec is used elsewhere (e.g. lib/klingProvider.ts).
          avg_watch_time_sec: raw.ig_reels_avg_watch_time !== undefined ? raw.ig_reels_avg_watch_time / 1000 : undefined,
        },
      };
    }
    lastError = data.error?.message ?? `HTTP ${res.status}`;
    // Unsupported-metric error → try the next (smaller) set; other errors too, it's cheap.
  }
  return { metrics: null, error: lastError };
}

export async function GET(req: Request) {
  const deny = requireCron(req);
  if (deny) return deny;

  const token = await getIgAccessToken();
  if (!token) return NextResponse.json({ error: "No IG access token available" }, { status: 500 });

  const url = new URL(req.url);
  // Default (and hard cap) raised from 7 to 90 days: media insights stay queryable for old
  // posts, but the daily cron only re-checked posts <=7 days old — a Reel's IG numbers keep
  // climbing for weeks after posting, so anything older than a week was silently frozen at
  // its day-~7 snapshot instead of tracking real, current performance.
  const days = Math.min(Number(url.searchParams.get("days")) || 90, 90);
  const batchSize = resolveBatchSize(url.searchParams.get("batch"));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const now = new Date();

  const { data: cursorRowRaw } = await supabase
    .from("chs_import_insights_cursor")
    .select("window_days, cursor_posted_at, cursor_post_id, cycle_started_at, cycle_complete")
    .eq("id", CURSOR_ID)
    .maybeSingle();
  const cycle = resolveCycleState(cursorRowRaw as CursorRow | null, days, now);

  // Stories expire after 24h and expose almost no insights — skip them. Newest-first order +
  // keyset cursor: one batch per call, resumable, deterministic even with same-timestamp posts.
  let query = supabase
    .from("chs_posts")
    .select("id, character_id, platform_post_id, post_type, posted_at, engagement")
    .eq("status", "posted")
    .eq("platform", "instagram")
    .neq("post_type", "story")
    .not("platform_post_id", "is", null)
    .gte("posted_at", since)
    .order("posted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(batchSize);
  if (cycle.cursorPostedAt && cycle.cursorPostId) {
    query = query.or(buildKeysetFilter(cycle.cursorPostedAt, cycle.cursorPostId));
  }
  const { data: posts, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ postId: string; ok: boolean; score?: number; error?: string }> = [];
  const affected = new Set<string>();

  for (const post of posts ?? []) {
    const metricSets = post.post_type === "reel" ? REEL_METRIC_SETS : FEED_METRIC_SETS;
    const { metrics, error: fetchErr } = await fetchInsights(post.platform_post_id as string, token, metricSets);
    if (!metrics) {
      results.push({ postId: post.id, ok: false, error: fetchErr });
      continue;
    }
    // Merge over existing engagement so manual fields (fanvue_clicks…) and previously-fetched
    // values survive; drop undefined values so a smaller metric set (or a metric IG simply
    // doesn't return for this media type) never overwrites a real stored value with 0/absence.
    const cleaned = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== undefined));
    const merged = { ...(post.engagement as Record<string, unknown> ?? {}), ...cleaned };
    const score = calculateGrowthScore(merged as GrowthMetrics);
    const { error: upErr } = await supabase
      .from("chs_posts")
      .update({ engagement: merged, growth_score: score })
      .eq("id", post.id);
    if (upErr) {
      results.push({ postId: post.id, ok: false, error: upErr.message });
      continue;
    }
    if (post.character_id) affected.add(post.character_id as string);
    results.push({ postId: post.id, ok: true, score });
  }

  // Recompute winners (top ~30% by score) per affected character — same rule as import-metrics.
  for (const characterId of affected) {
    const { data: scored } = await supabase
      .from("chs_posts")
      .select("id, growth_score")
      .eq("character_id", characterId)
      .gt("growth_score", 0)
      .order("growth_score", { ascending: false });
    if (!scored || scored.length === 0) continue;
    const cutoffIdx = Math.max(0, Math.floor(scored.length * 0.3) - 1);
    const threshold = Number(scored[cutoffIdx].growth_score) || 0;
    const winners = scored.filter((p) => Number(p.growth_score) >= threshold).map((p) => p.id);
    const losers = scored.filter((p) => Number(p.growth_score) < threshold).map((p) => p.id);
    if (winners.length) await supabase.from("chs_posts").update({ growth_winner: true }).in("id", winners);
    if (losers.length) await supabase.from("chs_posts").update({ growth_winner: false }).in("id", losers);
  }

  // Advance the cursor to the last (oldest, since we ordered newest-first) post attempted this
  // batch — attempted, not just successful, so one permanently-failing post (e.g. IG returns an
  // error for every metric set) can't stall the cursor forever; the next full cycle retries it.
  const lastPost = (posts ?? [])[(posts ?? []).length - 1] ?? null;
  let remainingEstimate = 0;
  if (lastPost) {
    const { count } = await supabase
      .from("chs_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .eq("platform", "instagram")
      .neq("post_type", "story")
      .not("platform_post_id", "is", null)
      .gte("posted_at", since)
      .or(buildKeysetFilter(lastPost.posted_at as string, lastPost.id as string));
    remainingEstimate = count ?? 0;
  }
  const cycleComplete = !lastPost || remainingEstimate === 0;

  await supabase.from("chs_import_insights_cursor").upsert({
    id: CURSOR_ID,
    window_days: days,
    cursor_posted_at: lastPost ? (lastPost.posted_at as string) : null,
    cursor_post_id: lastPost ? (lastPost.id as string) : null,
    cycle_started_at: cycle.cycleStartedAt,
    cycle_complete: cycleComplete,
    updated_at: now.toISOString(),
  });

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({
    success: true,
    processed: results.length,
    successful: ok,
    failed: results.length - ok,
    cycle_complete: cycleComplete,
    remaining_estimate: remainingEstimate,
    window_days: days,
    batch_size: batchSize,
    is_new_cycle: cycle.isNewCycle,
    results,
  });
}
