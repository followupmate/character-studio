import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { data: duePosts, error } = await supabase
      .from("chs_posts")
      .select("id, platform, post_type")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (error) throw error;
    if (!duePosts || duePosts.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    const origin = req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : process.env.APP_URL ?? "http://localhost:3000";

    const results = await Promise.allSettled(
      duePosts.map(async (post: { id: string; platform: string; post_type: string | null }) => {
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
