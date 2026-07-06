import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateDailyBatch } from "@/lib/dailyBatch";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const fullReset = req.nextUrl.searchParams.get("fullReset") === "true";
    const characterSlug = req.nextUrl.searchParams.get("character");
    // Optional ?date=YYYY-MM-DD targets a specific day (e.g. to rebuild a past
    // day's visual batch under updated framing). Defaults to today.
    const dateParam = req.nextUrl.searchParams.get("date");
    const today = new Date().toISOString().split("T")[0];
    const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

    // Full reset: drop today's story_days + daily_plans, then re-trigger story cron
    if (fullReset) {
      let charFilter = supabase
        .from("chs_characters")
        .select("id, name, slug")
        .eq("is_active", true);
      if (characterSlug) charFilter = charFilter.eq("slug", characterSlug);
      const { data: chars, error: charErr } = await charFilter;
      if (charErr) throw charErr;
      if (!chars || chars.length === 0) {
        return NextResponse.json({ success: false, error: "No matching characters" }, { status: 404 });
      }

      const charIds = chars.map((c) => c.id);

      const { error: planDelErr } = await supabase
        .from("chs_daily_plans")
        .delete()
        .in("character_id", charIds)
        .eq("date", targetDate);
      if (planDelErr) throw planDelErr;

      const { error: storyDelErr } = await supabase
        .from("chs_story_days")
        .delete()
        .in("character_id", charIds)
        .eq("date", targetDate);
      if (storyDelErr) throw storyDelErr;

      const base = new URL(req.url);
      const storyUrl = `${base.protocol}//${base.host}/api/characters/story`;
      const cronRes = await fetch(storyUrl, { method: "GET" });
      const cronJson = await cronRes.json().catch(() => ({}));

      return NextResponse.json({
        success: cronRes.ok,
        mode: "fullReset",
        reset: chars.map((c) => c.name),
        storyCron: cronJson,
      });
    }

    // Default: regenerate only the visual batch (scene brief + 7 slot prompts)
    let storyQ = supabase
      .from("chs_story_days")
      .select("id, character_id, chs_characters(name, slug)")
      .eq("date", targetDate);
    if (characterSlug) {
      const { data: char } = await supabase
        .from("chs_characters")
        .select("id")
        .eq("slug", characterSlug)
        .single();
      if (char) storyQ = storyQ.eq("character_id", char.id);
    }
    const { data: storyDays, error } = await storyQ;

    if (error) throw error;
    if (!storyDays || storyDays.length === 0) {
      return NextResponse.json({ success: false, error: "No stories found for today" }, { status: 404 });
    }

    const results = await Promise.allSettled(
      storyDays.map((day) =>
        generateDailyBatch({
          characterId: day.character_id,
          storyDayId: day.id,
          forceRegenerate: true,
        })
      )
    );

    const summary = results.map((r, i) => {
      const charName = (storyDays[i].chs_characters as unknown as { name?: string })?.name ?? storyDays[i].character_id;
      if (r.status === "rejected") {
        return { character: charName, status: "rejected", error: String(r.reason) };
      }
      return {
        character: charName,
        status: r.value.status,
        slotsGenerated: r.value.generated.filter((g) => g.ok).length,
        slotsFailed: r.value.generated.filter((g) => !g.ok).length,
      };
    });

    const allOk = results.every(
      (r) => r.status === "fulfilled" && r.value.status === "ready"
    );
    return NextResponse.json({ success: allOk, regenerated: summary });
  } catch (err) {
    console.error("[regenerate-prompts]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
