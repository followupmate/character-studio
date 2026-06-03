import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const characterId = url.searchParams.get("character_id");
    const date = url.searchParams.get("date") ?? new Date().toISOString().split("T")[0];

    if (!characterId) {
      return NextResponse.json({ error: "character_id required" }, { status: 400 });
    }

    const { data: storyDay } = await supabase
      .from("chs_story_days")
      .select("id, ig_caption, hashtags")
      .eq("character_id", characterId)
      .eq("date", date)
      .maybeSingle();

    const { data: plan } = await supabase
      .from("chs_daily_plans")
      .select("id, batch_status")
      .eq("character_id", characterId)
      .eq("date", date)
      .maybeSingle();

    if (!plan) {
      return NextResponse.json({ storyDay, plan: null, media: [], queued: [] });
    }

    const { data: media } = await supabase
      .from("chs_media")
      .select("id, slot, sequence_index, type, channel, media_url, generation_status")
      .eq("batch_id", plan.id);

    const { data: queued } = storyDay
      ? await supabase
          .from("chs_posts")
          .select("id, post_type, status, scheduled_at")
          .eq("story_day_id", storyDay.id)
      : { data: [] };

    return NextResponse.json({
      storyDay,
      plan,
      media: media ?? [],
      queued: queued ?? [],
    });
  } catch (error) {
    console.error("[batch-status]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
