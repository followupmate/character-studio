import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateAndSavePrompts } from "@/lib/generatePrompts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Load today's story days with character info
    const { data: storyDays, error } = await supabase
      .from("chs_story_days")
      .select("*, chs_characters(*)")
      .eq("date", today);

    if (error) throw error;
    if (!storyDays || storyDays.length === 0) {
      return NextResponse.json({ success: false, error: "No stories found for today" }, { status: 404 });
    }

    // Delete existing media for today's story days
    const storyDayIds = storyDays.map((s) => s.id);
    const { error: deleteError } = await supabase
      .from("chs_media")
      .delete()
      .in("story_day_id", storyDayIds);

    if (deleteError) throw deleteError;

    // Regenerate all prompts in parallel
    const results = await Promise.allSettled(
      storyDays.map((day) =>
        generateAndSavePrompts({
          storyDayId: day.id,
          characterId: day.character_id,
          location: day.location,
          mood: day.mood,
          narrative: day.narrative,
          arc_position: day.arc_position,
          visualBrief: day.chs_characters?.visual_brief ?? "",
          soulId: day.chs_characters?.soul_id ?? null,
          visualTone: (day.chs_characters as any)?.visual_tone ?? null,
          stylingNote: (day.chs_characters as any)?.styling_note ?? null,
          doctrine: (day.chs_characters as any)?.prompt_doctrine ?? "cinematic",
        })
      )
    );

    const summary = results.map((r, i) => ({
      character: storyDays[i].chs_characters?.name ?? storyDays[i].character_id,
      status: r.status,
      error: r.status === "rejected" ? String((r as PromiseRejectedResult).reason) : null,
    }));

    const allOk = results.every((r) => r.status === "fulfilled");
    return NextResponse.json({ success: allOk, regenerated: summary });
  } catch (err) {
    console.error("[regenerate-prompts]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
