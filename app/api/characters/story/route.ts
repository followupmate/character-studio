import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import { generateDailyBatch } from "@/lib/dailyBatch";
import { Character, StoryDay } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    const { data: characters, error: charError } = await supabase
      .from("chs_characters")
      .select("*")
      .eq("is_active", true);

    if (charError) throw charError;
    if (!characters || characters.length === 0) {
      return NextResponse.json({ success: true, message: "No active characters" });
    }

    const today = new Date().toISOString().split("T")[0];

    const storyResults: Array<{
      char: Character;
      storyDayId: string;
      dayNumber: number;
      created: boolean;
    }> = [];

    for (const char of characters as Character[]) {
      const { data: existing } = await supabase
        .from("chs_story_days")
        .select("id, day_number")
        .eq("character_id", char.id)
        .eq("date", today)
        .maybeSingle();

      if (existing) {
        storyResults.push({ char, storyDayId: existing.id, dayNumber: existing.day_number, created: false });
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
        max_tokens: 1600,
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
- emotional_beat: one of: lonely | inspired | anxious | confident | nostalgic | restless | tender | productive | melancholic | quietly_alive
- scene: structured object with these keys:
    {
      "time_of_day": "dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp",
      "weather": "short description of atmospheric state",
      "wardrobe": "exact garments she is wearing today (not fashion language — physical description)",
      "props": ["3 to 5 objects present in the scene"],
      "motifs": ["2 to 4 recurring visual motifs for this scene"],
      "energy": "one phrase — what the scene feels like to inhabit"
    }
- next_hint: string (one sentence hint of what comes tomorrow, in English)
- ig_caption: string (2-3 lines, poetic, authentic, no hashtags, in English)
- hashtags: array of 10 strings without # symbol (3 location + 3 mood/aesthetic + 2 niche + 2 branded for this character)

Caption tone — GOOD: "some cities remember you differently." / "the light changed before she did."
Caption tone — FORBIDDEN: living my best life, wanderlust, blessed, grateful, motivational, tourist-blog.
ALL text fields must be in English.`,
        messages: [
          { role: "user", content: `Day ${dayNumber}. Recent history:\n${historyText}\n\nGenerate today's chapter. Natural continuation. Pick a single emotional beat — do not blend.` },
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
          emotional_beat: story.emotional_beat,
          scene: story.scene,
          next_hint: story.next_hint,
          ig_caption: story.ig_caption,
          hashtags: story.hashtags,
        })
        .select("id, day_number")
        .single();

      if (storyError) throw storyError;
      storyResults.push({ char, storyDayId: storyDay.id, dayNumber: storyDay.day_number, created: true });
    }

    const batchResults = await Promise.allSettled(
      storyResults.map(({ char, storyDayId }) =>
        generateDailyBatch({ characterId: char.id, storyDayId })
      )
    );

    const results = storyResults.map(({ char, dayNumber, created }, i) => {
      const r = batchResults[i];
      if (r.status === "rejected") {
        console.error(`[story] batch failed for ${char.name}:`, r.reason);
        return {
          character: char.name,
          day: dayNumber,
          storyCreated: created,
          batchStatus: "failed",
          error: String(r.reason).slice(0, 500),
        };
      }
      return {
        character: char.name,
        day: dayNumber,
        storyCreated: created,
        batchStatus: r.value.status,
        slotsGenerated: r.value.generated.filter((g) => g.ok).length,
        slotsFailed: r.value.generated.filter((g) => !g.ok).length,
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
