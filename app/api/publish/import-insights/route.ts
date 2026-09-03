import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { calculateGrowthScore, GrowthMetrics } from "@/lib/growthScore";
import { requireCron } from "@/lib/apiAuth";
import { getIgAccessToken } from "@/lib/igToken";
import { resolveCycleState, buildKeysetFilter, resolveBatchSize, CursorRow } from "@/lib/importInsightsCursor";
import { captureMaturedSnapshots } from "@/lib/creativeIntelligence/performanceSnapshots";
import { deriveWatchMetrics, msToSec, WATCH_METRIC_KEYS as WATCH_KEYS } from "@/lib/creativeIntelligence/watchMetrics";
import { probeVideoDuration } from "@/lib/recovery/videoDuration";

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
//
// RECOVERY phase 1B, re-verified empirically 2026-09-03 against media 17985454868871710 (a REEL,
// via the ?debug_raw=1 probe below), because chs_post_performance_snapshots.follows /
// .profile_visits are NULL in all 61 rows and the question was whether the ingest was simply
// failing to map them. It is not. Meta answers, verbatim:
//   profile_visits -> "The Media Insights API does not support the profile_visits metric for this
//                      media product type."
//   follows        -> "The Media Insights API does not support the follows metric for this media
//                      product type."
// They are FEED/CAROUSEL-only and already mapped for those types below. This account has published
// reels only since 10.7., which is the whole reason both columns are NULL — not a mapping gap.
// They are therefore deliberately left unmapped for reels rather than filled with a heuristic or
// an account-level number that cannot be attributed to a single post.
//
// ig_reels_video_view_total_time — total watch time in ms (real value 130595 for a 59-view reel).
// APPROVED 2026-09-03 and now requested in the richest set above. Collected and displayed only:
// it does not feed calculateGrowthScore or any selection path.
const REEL_METRIC_SETS = [
  "views,reach,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time",
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
  // Approved 2026-09-03. Raw retention metric, reels only. Collected and displayed; deliberately
  // NOT consumed by calculateGrowthScore or any selection path — see
  // lib/creativeIntelligence/watchMetrics.test.ts, which asserts the score is unchanged when the
  // key is present.
  video_view_total_time_sec?: number;
}

// RECOVERY phase 1B — repeatable metric discovery. Meta renames and re-scopes media metrics
// without notice, and an unsupported name fails the WHOLE multi-metric call, so the only honest
// way to know what this account can actually read today is to ask for each candidate ALONE and
// record which ones answer. Runs only on ?debug_raw=1 (never in the normal cron path) and never
// writes anything — it exists so "what does the payload actually contain" is a command, not a
// one-off script someone has to rewrite next time.
const METRIC_PROBE_CANDIDATES = [
  "views", "reach", "likes", "comments", "saved", "shares", "total_interactions",
  "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "clips_replays_count",
  "ig_reels_aggregated_all_plays_count", "plays", "video_views", "impressions",
  "profile_visits", "profile_activity", "follows", "navigation", "replies", "reposts",
  "peak_concurrent_viewers", "threads_views", "follows_and_profile_visits",
];

export interface MetricProbeResult {
  mediaId: string;
  postType: string;
  supported: Array<{ metric: string; title?: string; period?: string; value?: number }>;
  unsupported: Array<{ metric: string; error: string }>;
}

async function probeAvailableMetrics(mediaId: string, postType: string, token: string): Promise<MetricProbeResult> {
  const supported: MetricProbeResult["supported"] = [];
  const unsupported: MetricProbeResult["unsupported"] = [];
  for (const metric of METRIC_PROBE_CANDIDATES) {
    const res = await fetch(
      `https://graph.instagram.com/v23.0/${mediaId}/insights?metric=${metric}&access_token=${token}`
    );
    const data = (await res.json().catch(() => ({}))) as IgInsightsResponse & {
      data?: Array<{ name: string; title?: string; period?: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }>;
    };
    if (res.ok && Array.isArray(data.data) && data.data.length > 0) {
      for (const d of data.data) {
        supported.push({ metric: d.name, title: d.title, period: d.period, value: d.values?.[0]?.value ?? d.total_value?.value });
      }
    } else {
      unsupported.push({ metric, error: (data.error?.message ?? `HTTP ${res.status}`).slice(0, 160) });
    }
  }
  // Full raw payload for the richest supported set, logged verbatim — this is the "log the whole
  // raw insights payload for one reel" deliverable, reproducible on demand.
  if (supported.length > 0) {
    const all = supported.map((s) => s.metric).join(",");
    const res = await fetch(`https://graph.instagram.com/v23.0/${mediaId}/insights?metric=${all}&access_token=${token}`);
    const raw = await res.json().catch(() => ({}));
    console.log(`[import-insights][debug_raw] ${postType} ${mediaId} full payload:`, JSON.stringify(raw));
  }
  return { mediaId, postType, supported, unsupported };
}

async function fetchInsights(mediaId: string, token: string, metricSets: string[], debugRaw = false): Promise<{ metrics: FetchedMetrics | null; error?: string }> {
  let lastError = "";
  for (const metricSet of metricSets) {
    const res = await fetch(
      `https://graph.instagram.com/v23.0/${mediaId}/insights?metric=${metricSet}&access_token=${token}`
    );
    const data = (await res.json().catch(() => ({}))) as IgInsightsResponse;
    if (debugRaw) {
      console.log(`[import-insights][debug_raw] ${mediaId} metric=${metricSet} status=${res.status} payload=${JSON.stringify(data)}`);
    }
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
          avg_watch_time_sec: msToSec(raw.ig_reels_avg_watch_time),
          // Also milliseconds (verified empirically: 130595 for a 59-view reel).
          video_view_total_time_sec: msToSec(raw.ig_reels_video_view_total_time),
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

  // RECOVERY phase 1B — ?debug_raw=1 dumps the full raw payload for every post in this batch and
  // runs the one-metric-at-a-time probe on the FIRST one, so the available metric surface is
  // reported rather than assumed. Read-only diagnostics; the normal merge/score path is untouched.
  const debugRaw = url.searchParams.get("debug_raw") === "1";
  let metricProbe: MetricProbeResult | null = null;

  for (const post of posts ?? []) {
    const metricSets = post.post_type === "reel" ? REEL_METRIC_SETS : FEED_METRIC_SETS;
    if (debugRaw && !metricProbe) {
      metricProbe = await probeAvailableMetrics(post.platform_post_id as string, post.post_type as string, token);
    }
    const { metrics, error: fetchErr } = await fetchInsights(post.platform_post_id as string, token, metricSets, debugRaw);
    if (!metrics) {
      results.push({ postId: post.id, ok: false, error: fetchErr });
      continue;
    }
    // Merge over existing engagement so manual fields (fanvue_clicks…) and previously-fetched
    // values survive; drop undefined values so a smaller metric set (or a metric IG simply
    // doesn't return for this media type) never overwrites a real stored value with 0/absence.
    const cleaned = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== undefined));
    const merged = { ...(post.engagement as Record<string, unknown> ?? {}), ...cleaned };

    // DERIVED RETENTION (approved 2026-09-03) — actual_video_duration_sec + avg_watch_ratio.
    //
    // Meta exposes no duration field on the media object (probed: `duration` and `video_duration`
    // both return "Tried accessing nonexisting field"), so the duration is measured from the
    // PUBLISHED reel file itself via the media_url CDN link — which is the right source anyway:
    // reels are published manually from mobile with trending audio, so what viewers actually
    // watched is the published file, not what we handed the provider.
    //
    // Measured once per post and cached in engagement: probing is a ranged fetch per post, and the
    // published file's length does not change. An existing value short-circuits the probe.
    const existingDuration = (post.engagement as Record<string, unknown> | null)?.[WATCH_KEYS.actualDuration];
    let actualDurationSec: number | null =
      typeof existingDuration === "number" && existingDuration > 0 ? existingDuration : null;
    if (actualDurationSec === null && post.post_type === "reel") {
      const mediaRes = await fetch(
        `https://graph.instagram.com/v23.0/${post.platform_post_id}?fields=media_url&access_token=${token}`
      );
      const mediaJson = (await mediaRes.json().catch(() => ({}))) as { media_url?: string };
      if (mediaJson.media_url) {
        const probe = await probeVideoDuration(mediaJson.media_url);
        actualDurationSec = probe.durationSec;
        if (debugRaw) {
          console.log(
            `[import-insights][debug_raw] ${post.platform_post_id} published duration probe: ` +
              `${probe.durationSec ?? "unreadable"}${probe.error ? ` (${probe.error})` : ""}`
          );
        }
      }
    }

    // Absent stays absent: deriveWatchMetrics returns {} rather than zeros when it has nothing.
    Object.assign(
      merged,
      deriveWatchMetrics({
        avgWatchTimeSec: merged.avg_watch_time_sec as number | undefined,
        totalWatchTimeSec: merged.video_view_total_time_sec as number | undefined,
        actualDurationSec,
      })
    );
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

    // Closed-loop CI evaluation, phase 1: freeze this post's just-merged cumulative engagement
    // into an immutable checkpoint the moment it first crosses each maturity horizon. Cheap (0-3
    // small upserts, most calls 0-1 in steady state) and never blocks the import loop — a
    // snapshot failure here must never fail the metrics import itself.
    if (post.character_id && post.posted_at) {
      try {
        await captureMaturedSnapshots({
          postId: post.id,
          characterId: post.character_id as string,
          postedAt: post.posted_at as string,
          postType: post.post_type as string,
          metrics: merged as Record<string, number | undefined>,
          growthScore: score,
        });
      } catch (snapErr) {
        console.error("[import-insights] snapshot capture failed:", snapErr);
      }
    }
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
    ...(metricProbe ? { metric_probe: metricProbe } : {}),
  });
}
