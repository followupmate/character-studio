import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireCron } from "@/lib/apiAuth";
import { captureMaturedSnapshots, captureCurrentObservation, computeAgeHours, SnapshotMetricsInput } from "@/lib/creativeIntelligence/performanceSnapshots";

export const runtime = "nodejs";
export const maxDuration = 120;

// ONE-TIME, manually-triggered backfill for CI-guided posts that were posted before the
// performance-snapshot system existed. Never invented/backdated data:
//
//   - For each real horizon (24h/72h/7d) still within its honest capture window (see
//     performanceSnapshots.ts's SNAPSHOT_GRACE_HOURS), this reuses the EXACT SAME
//     captureMaturedSnapshots() the live import-insights hook uses — so an old post whose 24h
//     mark hasn't gone stale yet still gets a real, trustworthy 24h snapshot.
//   - Horizons already past their grace window are simply never fabricated retroactively.
//   - Every post additionally gets one 'current_observation' row: today's cumulative
//     engagement, explicitly NOT a real horizon checkpoint — diagnostic-only, and safe to
//     re-run (it's the one horizon value that isn't immutable).
//
// Not on any cron. Trigger manually: GET with a valid cron secret.
export async function GET(req: Request) {
  const deny = requireCron(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const characterId = url.searchParams.get("characterId");

  let storyDayQuery = supabase
    .from("chs_story_days")
    .select("id, character_id, strategy_snapshot_id")
    .not("strategy_snapshot_id", "is", null);
  if (characterId) storyDayQuery = storyDayQuery.eq("character_id", characterId);
  const { data: storyDays, error: sdErr } = await storyDayQuery;
  if (sdErr) return NextResponse.json({ error: sdErr.message }, { status: 500 });
  if (!storyDays || storyDays.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: "No CI-guided story days found" });
  }

  const { data: posts, error: postsErr } = await supabase
    .from("chs_posts")
    .select("id, character_id, post_type, posted_at, engagement, growth_score, story_day_id")
    .eq("status", "posted")
    .neq("post_type", "story") // stories expire in 24h and are never engagement-tracked at all
    .not("posted_at", "is", null)
    .in("story_day_id", storyDays.map((sd) => sd.id));
  if (postsErr) return NextResponse.json({ error: postsErr.message }, { status: 500 });
  if (!posts || posts.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: "No posted content yet for any CI-guided story day" });
  }

  const now = new Date();
  const results: Array<{ postId: string; matured: string[]; currentObservation: boolean; error?: string }> = [];

  for (const post of posts) {
    try {
      const metrics = (post.engagement ?? {}) as SnapshotMetricsInput;
      const captured = await captureMaturedSnapshots({
        postId: post.id,
        characterId: post.character_id as string,
        postedAt: post.posted_at as string,
        postType: post.post_type as string,
        metrics,
        growthScore: post.growth_score !== null ? Number(post.growth_score) : null,
        now,
      });

      await captureCurrentObservation({
        postId: post.id,
        characterId: post.character_id as string,
        postType: post.post_type as string,
        metrics,
        growthScore: post.growth_score !== null ? Number(post.growth_score) : null,
        ageHours: computeAgeHours(post.posted_at as string, now),
      });

      results.push({ postId: post.id, matured: captured.map((c) => c.horizon), currentObservation: true });
    } catch (err) {
      results.push({ postId: post.id, matured: [], currentObservation: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    matured_snapshots: results.reduce((s, r) => s + r.matured.length, 0),
    results,
  });
}
