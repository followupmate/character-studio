import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateAndSavePrompts } from "@/lib/generatePrompts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { storyDayId } = await req.json();

    const { data: day, error } = await supabase
      .from("chs_story_days")
      .select("*, chs_characters(*)")
      .eq("id", storyDayId)
      .single();

    if (error || !day) throw error ?? new Error("Story day not found");

    const char = day.chs_characters;

    await generateAndSavePrompts({
      storyDayId,
      characterId: char.id,
      location: day.location,
      mood: day.mood,
      narrative: day.narrative,
      arc_position: day.arc_position,
      visualBrief: char.visual_brief,
      soulId: char.soul_id,
      visualTone: (char as any).visual_tone ?? null,
      stylingNote: (char as any).styling_note ?? null,
      doctrine: (char as any).prompt_doctrine ?? "cinematic",
    });

    return NextResponse.json({ success: true, character: char.name });
  } catch (error) {
    console.error("[prompts]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/characters/prompts?id=xxx        — delete single prompt
// DELETE /api/characters/prompts?clear=story_day&story_day_id=yyy  — clear for story day
// DELETE /api/characters/prompts?clear=all     — clear all prompts
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const clear = req.nextUrl.searchParams.get("clear");
    const storyDayId = req.nextUrl.searchParams.get("story_day_id");

    if (id) {
      const { error } = await supabase.from("chs_media").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (clear === "all") {
      const { error } = await supabase
        .from("chs_media")
        .delete()
        .not("higgsfield_prompt", "eq", "manual_upload");
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (clear === "story_day" && storyDayId) {
      const { error } = await supabase
        .from("chs_media")
        .delete()
        .eq("story_day_id", storyDayId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Missing id or clear param" }, { status: 400 });
  } catch (error) {
    console.error("[prompts DELETE]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
