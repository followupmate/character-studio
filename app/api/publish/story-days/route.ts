import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const character_id = req.nextUrl.searchParams.get("character_id");
  if (!character_id) {
    return NextResponse.json({ error: "character_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("chs_story_days")
    .select("id, date, location, mood, narrative, ig_caption, hashtags, arc_position")
    .eq("character_id", character_id)
    .order("date", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
