import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/apiAuth";
import { isCiScoringFrozen } from "@/lib/ciScoringFrozen";
import recoveryConfig from "@/recovery.json";
import {
  buildRecoveryReport,
  renderRecoveryReport,
  type RecoveryConfig,
  type SnapshotRow,
} from "@/lib/recovery/report";

export const runtime = "nodejs";
export const maxDuration = 60;

// RECOVERY phase 6 — /api/recovery/report
//
// Reads the recovery post IDs out of recovery.json (the operator fills them in after each manual
// publish), pulls their 24h/72h/7d performance snapshots, compares them to the 20.8.–1.9. baseline
// and evaluates the decision rule that was committed BEFORE the sprint started.
//
// `?format=text` returns the plain-text standup rendering; the default is JSON.
//
// Read-only. This route never writes, and it never decides anything the rule in recovery.json does
// not already say.

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Same posture as the other operator-facing routes: browser requests from the app are allowed,
  // server-to-server needs the cron secret.
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawConfig = recoveryConfig as unknown as RecoveryConfig;

  // RESOLVE THE POSTS FROM THE DATABASE, not from a hand-maintained list.
  //
  // recovery.json's platform_post_id field was written for the original protocol, where reels were
  // published manually from mobile with trending audio and the operator typed the id back in.
  // Publishing is automated now, so those ids appear in chs_posts and never in the file — and a
  // report keyed on the file would sit empty forever while the data it needs is right there.
  // Which would be the worst possible failure: a measurement sprint that silently measures nothing.
  //
  // So the reels are resolved through the recovery marker that integration already writes:
  //   chs_daily_plans.content_mix.recovery.recovery_index -> story_day_id -> chs_posts (reel/IG)
  // A hand-entered platform_post_id in recovery.json still wins when present, so a manually
  // published reel is not broken by this.
  const { data: recoveryPlans } = await supabase
    .from("chs_daily_plans")
    .select("date, story_day_id, content_mix")
    .not("story_day_id", "is", null)
    .order("date", { ascending: true });

  const storyDayByIndex = new Map<number, string>();
  for (const plan of recoveryPlans ?? []) {
    const idx = (plan.content_mix as { recovery?: { recovery_index?: number } } | null)?.recovery?.recovery_index;
    if (idx && plan.story_day_id && !storyDayByIndex.has(idx)) {
      storyDayByIndex.set(idx, plan.story_day_id as string);
    }
  }

  const resolvedPostByIndex = new Map<number, { platform_post_id: string | null; posted_at: string | null }>();
  if (storyDayByIndex.size > 0) {
    const { data: reelPosts } = await supabase
      .from("chs_posts")
      .select("story_day_id, platform_post_id, posted_at, status, platform, post_type")
      .in("story_day_id", Array.from(storyDayByIndex.values()))
      .eq("post_type", "reel")
      .eq("platform", "instagram");
    for (const [idx, sdId] of storyDayByIndex) {
      const post = (reelPosts ?? []).find((x) => x.story_day_id === sdId);
      if (post) {
        resolvedPostByIndex.set(idx, {
          platform_post_id: (post.platform_post_id as string | null) ?? null,
          posted_at: (post.posted_at as string | null) ?? null,
        });
      }
    }
  }

  const config: RecoveryConfig = {
    ...rawConfig,
    reels: rawConfig.reels.map((r) => {
      const resolved = resolvedPostByIndex.get(r.slot);
      return {
        ...r,
        // The file still wins if someone filled it in by hand.
        platform_post_id: r.platform_post_id ?? resolved?.platform_post_id ?? null,
        posted_at: r.posted_at ?? resolved?.posted_at ?? null,
      };
    }),
  };

  const postIds = config.reels.map((r) => r.platform_post_id).filter((id): id is string => !!id);

  const snapshotsByPostId = new Map<string, SnapshotRow[]>();
  const engagementByPostId = new Map<string, Record<string, unknown>>();

  if (postIds.length > 0) {
    // Snapshots are keyed by our own chs_posts.id, so resolve across from the platform id.
    const { data: posts, error: postsErr } = await supabase
      .from("chs_posts")
      .select("id, platform_post_id, engagement")
      .in("platform_post_id", postIds);
    if (postsErr) return NextResponse.json({ error: postsErr.message }, { status: 500 });

    const platformIdByPostId = new Map((posts ?? []).map((p) => [p.id as string, p.platform_post_id as string]));
    // Watch-retention lives in chs_posts.engagement (jsonb) — the snapshot table has no columns
    // for it and adding them is DDL, which this sprint does not do.
    for (const p of posts ?? []) {
      engagementByPostId.set(p.platform_post_id as string, (p.engagement as Record<string, unknown>) ?? {});
    }

    if (platformIdByPostId.size > 0) {
      const { data: snaps, error: snapErr } = await supabase
        .from("chs_post_performance_snapshots")
        .select(
          "post_id, horizon, views, reach, likes, comments, saves, shares, total_interactions, avg_watch_time_sec, follows, profile_visits"
        )
        .in("post_id", Array.from(platformIdByPostId.keys()))
        .in("horizon", ["24h", "72h", "7d"]);
      if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });

      for (const row of snaps ?? []) {
        const platformId = platformIdByPostId.get(row.post_id as string);
        if (!platformId) continue;
        const list = snapshotsByPostId.get(platformId) ?? [];
        list.push(row as unknown as SnapshotRow);
        snapshotsByPostId.set(platformId, list);
      }
    }
  }

  const report = buildRecoveryReport(config, snapshotsByPostId, engagementByPostId);

  if (url.searchParams.get("format") === "text") {
    return new NextResponse(renderRecoveryReport(report), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    success: true,
    // Makes the freeze OBSERVABLE in production instead of assumed. The flag is an env var on
    // Vercel, so without this there is no way to confirm from outside whether scoring is actually
    // frozen — and "we set it" is not verification.
    ci: {
      scoring_frozen: isCiScoringFrozen(),
      analytics_ingest: "unaffected — /api/publish/import-insights keeps running on its cron; the freeze stops growth_score STEERING selection, not the metrics arriving",
    },
    resolution: {
      by: "recovery marker (chs_daily_plans.content_mix.recovery.recovery_index) — no manual id entry needed",
      reels: rawConfig.reels.map((r) => {
        const resolved = resolvedPostByIndex.get(r.slot);
        return {
          slot: r.slot,
          calendar_date: (r as unknown as { calendar_date?: string }).calendar_date ?? null,
          post_found: !!resolved,
          platform_post_id: r.platform_post_id ?? resolved?.platform_post_id ?? null,
          // A scheduled-but-unpublished reel has a post row and no platform id yet. That is the
          // normal state between approval and the publish cron, not a fault.
          state: !resolved
            ? "no post yet — approve the day"
            : resolved.platform_post_id
              ? "published"
              : "scheduled, awaiting the publish cron",
        };
      }),
    },
    protocol_note:
      "Reels are published manually from mobile with trending audio; platform_post_id must be filled into recovery.json by hand after each publish.",
    report,
  });
}
