import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { compileVisualHookDays } from "@/lib/experiments/visualHookDays";
import { VHD_VERSION } from "@/lib/experiments/visualHookPlan";
import {
  buildVhdReelReport,
  buildVhdReport,
  renderVhdReport,
  type VhdSnapshot,
} from "@/lib/experiments/visualHookEval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// VHD v1 — the evaluation panel, served.
//
// Posts are resolved FROM THE DATABASE, never from a hand-maintained list. The recovery report
// originally keyed off ids typed into a config file, which was correct while reels were published
// manually and became a report that would sit permanently empty the moment publishing was
// automated — the worst kind of failure for a measurement sprint, since the data was there the
// whole time. The chain here is:
//
//   chs_daily_plans.content_mix.visual_hook_experiment.index
//     -> story_day_id -> chs_posts (post_type reel, platform instagram)
//     -> chs_post_performance_snapshots (per horizon)
//
// Retention comes from each horizon's own snapshot; only actual_video_duration_sec is read from
// chs_posts.engagement, because it is a property of the file rather than of a moment.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asText = url.searchParams.get("format") === "text";

  const days = compileVisualHookDays();

  const { data: plans, error: planErr } = await supabase
    .from("chs_daily_plans")
    .select("date, story_day_id, content_mix")
    .not("story_day_id", "is", null)
    .order("date", { ascending: true });
  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });

  const byIndex = new Map<number, { date: string; storyDayId: string }>();
  for (const plan of plans ?? []) {
    const mix = plan.content_mix as { visual_hook_experiment?: { index?: number; version?: string } } | null;
    const marker = mix?.visual_hook_experiment;
    if (!marker?.index || !plan.story_day_id) continue;
    if (marker.version && marker.version !== VHD_VERSION) continue;
    if (!byIndex.has(marker.index)) {
      byIndex.set(marker.index, { date: plan.date as string, storyDayId: plan.story_day_id as string });
    }
  }

  const storyDayIds = Array.from(byIndex.values()).map((v) => v.storyDayId);
  const { data: posts } = storyDayIds.length
    ? await supabase
        .from("chs_posts")
        .select("id, story_day_id, platform_post_id, posted_at, engagement")
        .in("story_day_id", storyDayIds)
        .eq("post_type", "reel")
        .eq("platform", "instagram")
    : { data: [] as Array<Record<string, unknown>> };

  const postByStoryDay = new Map((posts ?? []).map((p) => [p.story_day_id as string, p]));

  const postIds = (posts ?? []).map((p) => p.id as string);
  const { data: snapshots } = postIds.length
    ? await supabase
        .from("chs_post_performance_snapshots")
        .select("post_id, horizon, views, reach, saves, shares, total_interactions, avg_watch_time_sec")
        .in("post_id", postIds)
    : { data: [] as Array<Record<string, unknown>> };

  const snapshotsByPost = new Map<string, VhdSnapshot[]>();
  for (const s of snapshots ?? []) {
    const list = snapshotsByPost.get(s.post_id as string) ?? [];
    list.push(s as unknown as VhdSnapshot);
    snapshotsByPost.set(s.post_id as string, list);
  }

  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const reels = days.map((day) => {
    const located = byIndex.get(day.plan.experimentIndex) ?? null;
    const post = located ? (postByStoryDay.get(located.storyDayId) ?? null) : null;
    const engagement = (post?.engagement as Record<string, unknown> | null) ?? null;
    return buildVhdReelReport({
      index: day.plan.experimentIndex,
      direction: day.direction,
      motifFamily: day.plan.motifFamily,
      hookType: day.plan.hookType,
      experimentRole: day.plan.experimentRole,
      calendarDate: located?.date ?? null,
      platformPostId: (post?.platform_post_id as string | null) ?? null,
      postedAt: (post?.posted_at as string | null) ?? null,
      snapshots: post ? (snapshotsByPost.get(post.id as string) ?? []) : [],
      actualDurationSec: num(engagement?.actual_video_duration_sec),
    });
  });

  const report = buildVhdReport(reels, VHD_VERSION);

  if (asText) {
    return new NextResponse(renderVhdReport(report), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    ...report,
    resolution: {
      by: "chs_daily_plans.content_mix.visual_hook_experiment.index -> story_day_id -> chs_posts — no manual id entry",
      reels: days.map((d) => {
        const located = byIndex.get(d.plan.experimentIndex) ?? null;
        const post = located ? (postByStoryDay.get(located.storyDayId) ?? null) : null;
        return {
          index: d.plan.experimentIndex,
          calendar_date: located?.date ?? null,
          plan_found: !!located,
          post_found: !!post,
          state: !located
            ? "not provisioned"
            : !post
              ? "no post yet — approve the day"
              : post.platform_post_id
                ? "published"
                : "scheduled, awaiting the publish cron",
        };
      }),
    },
    ci_scoring: {
      frozen: process.env.CI_SCORING_FROZEN === "true",
      note: "these thresholds are experiment evaluation only and are not an input to CI scoring",
    },
  });
}
