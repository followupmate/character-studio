import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — open

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  // Query param fallback for external schedulers (cron-job.org etc.)
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data: duePosts, error } = await supabase
      .from("chs_posts")
      .select("id, platform, post_type, media_ids, character_id, ig_caption, hashtags")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (error) throw error;
    if (!duePosts || duePosts.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    const origin = req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : process.env.APP_URL ?? "http://localhost:3000";

    type DuePost = {
      id: string;
      platform: string;
      post_type: string | null;
      media_ids: string[] | null;
      character_id: string | null;
      ig_caption: string | null;
      hashtags: string[] | null;
    };

    const results = await Promise.allSettled(
      (duePosts as DuePost[]).map(async (post) => {
        if (post.post_type === "carousel" && post.media_ids && post.media_ids.length >= 2) {
          const res = await fetch(`${origin}/api/publish/post-instagram-carousel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              media_ids: post.media_ids,
              caption: post.ig_caption ?? "",
              hashtags: post.hashtags ?? [],
              character_id: post.character_id,
              post_id: post.id,
            }),
          });
          const data = await res.json();
          return { post_id: post.id, post_type: post.post_type, ...data };
        }

        const isStory = post.post_type === "story";
        const endpoint = isStory
          ? `${origin}/api/publish/post-instagram-story`
          : `${origin}/api/publish/post-now`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post_id: post.id }),
        });
        const data = await res.json();
        return { post_id: post.id, post_type: post.post_type, ...data };
      })
    );

    const summary = results.map((r) =>
      r.status === "fulfilled" ? r.value : { error: String(r.reason) }
    );

    return NextResponse.json({ success: true, processed: duePosts.length, results: summary });
  } catch (error) {
    console.error("[publish-cron]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// Vercel Cron calls via GET
export async function GET(req: Request) {
  return POST(req);
}
