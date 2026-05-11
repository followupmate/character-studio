import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import { Character, StoryDay } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const results = [];

    for (const char of characters as Character[]) {
      // Load last 7 days of history
      const { data: history } = await supabase
        .from("chs_story_days")
        .select("day_number, location, mood, narrative, arc_position")
        .eq("character_id", char.id)
        .order("day_number", { ascending: false })
        .limit(7);

      const dayNumber = ((history as StoryDay[])?.[0]?.day_number ?? 0) + 1;

      const historyText =
        (history as StoryDay[])?.length > 0
          ? (history as StoryDay[])
              .map(
                (d) =>
                  `Day ${d.day_number}: ${d.location} — ${d.mood} — ${d.narrative}`
              )
              .join("\n")
          : "First day. Fresh start. No history yet.";

      // Generate story with Claude
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: `You are the story director for ${char.name}.

Character backstory: ${char.backstory}
Visual brief: ${char.visual_brief}
Personality: ${JSON.stringify(char.personality)}

Generate today's chapter as valid JSON only. No markdown, no code blocks, just raw JSON.

Required fields:
- location: string (city + neighborhood, e.g. "Lisbon, Alfama")
- mood: string (1-3 words, in English, e.g. "quiet reflection")
- narrative: string (2-3 sentences, present tense, intimate first/third person, in English)
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- next_hint: string (one sentence hint of what comes tomorrow, in English)
- ig_caption: string (2-3 lines, poetic, authentic, no hashtags — MUST be in English)
- hashtags: array of 10 strings without # symbol (in English)

Rules:
- ALL text fields must be written in English
- narrative should feel like a stolen moment, not a travel blog
- Use 📍 emoji only in ig_caption for location if needed
- Keep arc flowing naturally across days

When generating ig_caption:
- Write in English ONLY
- 2-3 lines maximum
- No hashtags in caption (they go separately)
- Style: poetic, raw, understated — never tourist-blog tone
- Examples of good tone: 'some cities remember you differently.', 'she left before the coffee got cold.', 'milan in the hour before everything starts.'
- Never use: 'living my best life', 'wanderlust', 'blessed', 'grateful'

When generating hashtags:
- 10 hashtags maximum
- Mix: 3 location-specific + 3 mood/aesthetic + 2 niche + 2 branded (#vivienne #characterstudio)
- All lowercase, no spaces`,
        messages: [
          {
            role: "user",
            content: `Day ${dayNumber}. Recent history:\n${historyText}\n\nGenerate today's story. Natural continuation.`,
          },
        ],
      });

      const rawText = (msg.content[0] as { type: string; text: string }).text;
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const story = JSON.parse(jsonText);

      // Save story day
      const { data: storyDay, error: storyError } = await supabase
        .from("chs_story_days")
        .insert({
          character_id: char.id,
          day_number: dayNumber,
          date: new Date().toISOString().split("T")[0],
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

      // Trigger prompt generation
      await fetch(`${process.env.APP_URL}/api/characters/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyDayId: storyDay.id,
          characterId: char.id,
        }),
      });

      results.push({
        character: char.name,
        day: dayNumber,
        location: story.location,
        mood: story.mood,
      });
    }

    return NextResponse.json({ success: true, processed: results });
  } catch (error) {
    console.error("[story] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
