import { NextResponse } from "next/server";
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
    });

    return NextResponse.json({ success: true, character: char.name });
  } catch (error) {
    console.error("[prompts]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
