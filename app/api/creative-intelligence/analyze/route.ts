import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchRecentPostPerformance } from "@/lib/creativeIntelligence/igAnalyticsAdapter";
import { analyzePerformance } from "@/lib/creativeIntelligence/contentIntelligence";
import { resolveWindowDays } from "@/lib/creativeIntelligence/window";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/creative-intelligence/analyze?characterId=&window=7|30|90|all (or ?days=N)
// Performance Intelligence (B): what has actually worked on Instagram, from real chs_posts
// engagement data. Read-only — no generation, no writes.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = resolveWindowDays(url);
  let characterId = url.searchParams.get("characterId");

  if (!characterId) {
    const { data } = await supabase.from("chs_characters").select("id").eq("is_active", true).limit(1).maybeSingle();
    characterId = data?.id ?? null;
  }
  if (!characterId) return NextResponse.json({ error: "No active character found" }, { status: 404 });

  try {
    const posts = await fetchRecentPostPerformance(characterId, days);
    const intelligence = analyzePerformance(characterId, days, posts);
    return NextResponse.json({ success: true, intelligence });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
