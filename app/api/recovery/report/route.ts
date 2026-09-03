import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/apiAuth";
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

  const config = recoveryConfig as unknown as RecoveryConfig;
  const postIds = config.reels.map((r) => r.platform_post_id).filter((id): id is string => !!id);

  const snapshotsByPostId = new Map<string, SnapshotRow[]>();

  if (postIds.length > 0) {
    // recovery.json stores the INSTAGRAM media id (that is what the operator can read off the app
    // after a manual publish); snapshots are keyed by our own chs_posts.id, so resolve across.
    const { data: posts, error: postsErr } = await supabase
      .from("chs_posts")
      .select("id, platform_post_id")
      .in("platform_post_id", postIds);
    if (postsErr) return NextResponse.json({ error: postsErr.message }, { status: 500 });

    const platformIdByPostId = new Map((posts ?? []).map((p) => [p.id as string, p.platform_post_id as string]));

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

  const report = buildRecoveryReport(config, snapshotsByPostId);

  if (url.searchParams.get("format") === "text") {
    return new NextResponse(renderRecoveryReport(report), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    success: true,
    protocol_note:
      "Reels are published manually from mobile with trending audio; platform_post_id must be filled into recovery.json by hand after each publish.",
    report,
  });
}
