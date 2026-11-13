import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireCron } from "@/lib/apiAuth";
import { getYouTubeAccessToken, fetchYouTubeStats } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily read-back of YouTube Shorts statistics into chs_posts.engagement (yt_* keys).
//
// Deliberately isolated from the IG pipeline: it does NOT touch growth_score, growth_winner
// or chs_post_performance_snapshots — those are calibrated on IG insights and feed the
// creative-intelligence loop. YouTube numbers live next to them under their own keys.
//
// ?days=N limits to posts published in the last N days (default 60, max 400).

async function handle(req: Request): Promise<NextResponse> {
  const deny = requireCron(req);
  if (deny) return deny;

  try {
    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 60) || 60, 1), 400);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: posts, error } = await supabase
      .from("chs_posts")
      .select("id, platform_post_id, engagement")
      .eq("platform", "youtube")
      .eq("status", "posted")
      .not("platform_post_id", "is", null)
      .gte("posted_at", since);
    if (error) throw error;
    if (!posts?.length) return NextResponse.json({ success: true, updated: 0 });

    const token = await getYouTubeAccessToken();
    const stats = await fetchYouTubeStats(posts.map((p) => p.platform_post_id as string), token);
    const byId = new Map(stats.map((s) => [s.id, s]));
    const fetchedAt = new Date().toISOString();

    let updated = 0;
    const missing: string[] = [];
    for (const p of posts) {
      const s = byId.get(p.platform_post_id as string);
      if (!s) { missing.push(p.platform_post_id as string); continue; } // deleted / not visible
      const engagement = {
        ...((p.engagement as Record<string, unknown> | null) ?? {}),
        yt_views: s.views,
        yt_likes: s.likes,
        yt_comments: s.comments,
        yt_privacy: s.privacyStatus,
        yt_fetched_at: fetchedAt,
      };
      const { error: upErr } = await supabase.from("chs_posts").update({ engagement }).eq("id", p.id);
      if (!upErr) updated++;
    }

    const totalViews = stats.reduce((a, s) => a + s.views, 0);
    return NextResponse.json({ success: true, days, posts: posts.length, updated, missing, totalViews });
  } catch (error) {
    console.error("[import-youtube-stats]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
