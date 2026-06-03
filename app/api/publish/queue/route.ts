import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("chs_posts")
      .select(
        `id, platform, status, scheduled_at, posted_at, ig_caption, yt_title, character_id,
         post_type, parent_post_id, last_error,
         chs_characters(name, slug),
         chs_media(type, media_url, chs_daily_plans(chs_characters(name, slug)))`
      )
      .gte("created_at", thirtyDaysAgo)
      .neq("source", "manual")
      .order("scheduled_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ posts: data ?? [] });
  } catch (error) {
    console.error("[queue]", error);
    return NextResponse.json({ posts: [], error: String(error) }, { status: 500 });
  }
}
