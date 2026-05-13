import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import { generateAndSavePrompts } from "@/lib/generatePrompts";
import { Character, StoryDay } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    // Load all active characters
    const { data: characters, error: charError } = await supabase
      .from("chs_characters")
      .select("*")
      .eq("is_active", true);

    if (charError) throw charError;
    if (!characters || characters.length === 0) {
      return NextResponse.json({ success: true, message: "No active characters" });
    }

    // Phase 1: generate + save all stories sequentially (skip if already exists today)
    const storyResults: Array<{
      char: Character;
      storyDay: { id: string };
      story: { location: string; mood: string; narrative: string; arc_position: string };
      dayNumber: number;
      skipped: boolean;
    }> = [];

    const today = new Date().toISOString().split("T")[0];

    for (const char of characters as Character[]) {
      // Check if story already exists for today
      const { data: existing } = await supabase
        .from("chs_story_days")
        .select("id, location, mood, narrative, arc_position, day_number")
        .eq("character_id", char.id)
        .eq("date", today)
        .maybeSingle();

      if (existing) {
        // Story exists — check if prompts are missing and regenerate if needed
        const { data: existingMedia } = await supabase
          .from("chs_media")
          .select("id, type")
          .eq("story_day_id", existing.id);

        const hasPhoto = existingMedia?.some((m) => m.type === "photo");
        const hasVideo = existingMedia?.some((m) => m.type === "video");

        storyResults.push({
          char,
          storyDay: { id: existing.id },
          story: {
            location: existing.location,
            mood: existing.mood,
            narrative: existing.narrative,
            arc_position: existing.arc_position,
          },
          dayNumber: existing.day_number,
          skipped: !!(hasPhoto && hasVideo), // only skip prompt gen if both exist
        });
        continue;
      }

      const { data: history } = await supabase
        .from("chs_story_days")
        .select("day_number, location, mood, narrative, arc_position")
        .eq("character_id", char.id)
        .order("day_number", { ascending: false })
        .limit(7);

      const dayNumber = ((history as StoryDay[])?.[0]?.day_number ?? 0) + 1;
      const historyText =
        (history as StoryDay[])?.length > 0
          ? (history as StoryDay[]).map((d) => `Day ${d.day_number}: ${d.location} — ${d.mood} — ${d.narrative}`).join("\n")
          : "First day. Fresh start. No history yet.";

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: `You are the story director for ${char.name}.

Character backstory: ${char.backstory}
Visual brief: ${char.visual_brief}
Personality: ${JSON.stringify(char.personality)}

Generate today's chapter as valid JSON only. No markdown, no code blocks, just raw JSON.

Required fields:
- location: string (city + neighborhood, e.g. "Lisbon, Alfama")
- mood: string (1-3 words, in English)
- narrative: string (2-3 sentences, present tense, intimate first/third person, in English)
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- next_hint: string (one sentence hint of what comes tomorrow, in English)
- ig_caption: string (2-3 lines, poetic, authentic, no hashtags, in English)
- hashtags: array of 10 strings without # symbol (3 location + 3 mood/aesthetic + 2 niche + 2 branded for this character)

Caption tone — GOOD: "some cities remember you differently." / "the light changed before she did."
Caption tone — FORBIDDEN: living my best life, wanderlust, blessed, grateful, motivational, tourist-blog.
ALL text fields must be in English.`,
        messages: [
          { role: "user", content: `Day ${dayNumber}. Recent history:\n${historyText}\n\nGenerate today's story. Natural continuation.` },
        ],
      });

      const rawText = (msg.content[0] as { type: string; text: string }).text;
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const story = JSON.parse(jsonText);

      const { data: storyDay, error: storyError } = await supabase
        .from("chs_story_days")
        .insert({
          character_id: char.id,
          day_number: dayNumber,
          date: today,
          location: story.location,
          mood: story.mood,
          narrative: story.narrative,
          arc_position: story.arc_position,
          next_hint: story.next_hint,
          ig_caption: story.ig_caption,
          hashtags: story.hashtags,
        })
        .select()
        .single();

      if (storyError) throw storyError;
      storyResults.push({ char, storyDay, story, dayNumber, skipped: false });
    }

    // Phase 2: generate missing prompts in parallel
    const toPrompt = storyResults.filter((r) => !r.skipped);
    const promptResults = await Promise.allSettled(
      toPrompt.map(({ char, storyDay, story }) =>
        generateAndSavePrompts({
          storyDayId: storyDay.id,
          characterId: char.id,
          location: story.location,
          mood: story.mood,
          narrative: story.narrative,
          arc_position: story.arc_position,
          visualBrief: char.visual_brief,
          soulId: char.soul_id,
          visualTone: (char as any).visual_tone ?? null,
        })
      )
    );

    promptResults.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[story] prompt gen failed for ${toPrompt[i].char.name}:`, r.reason);
      }
    });

    const results = storyResults.map(({ char, story, dayNumber, skipped }, i) => {
      const promptIdx = toPrompt.findIndex((r) => r.char.id === char.id);
      return {
        character: char.name,
        day: dayNumber,
        location: story.location,
        storySkipped: skipped,
        promptsGenerated: skipped
          ? "existing"
          : promptIdx >= 0 && promptResults[promptIdx]?.status === "fulfilled"
          ? true
          : false,
      };
    });

    return NextResponse.json({ success: true, processed: results });
  } catch (error) {
    console.error("[story] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
