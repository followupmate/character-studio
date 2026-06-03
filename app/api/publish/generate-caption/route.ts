import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import { Character, StoryDay } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { character_id, platforms, content_type, story_day_id } = await req.json();

    let character: Character;
    let storyDay: (StoryDay & { chs_characters: Character }) | null = null;

    if (story_day_id) {
      const { data: sd, error: sdError } = await supabase
        .from("chs_story_days")
        .select("*, chs_characters(*)")
        .eq("id", story_day_id)
        .single();
      if (sdError || !sd) {
        return NextResponse.json({ error: "Story day not found" }, { status: 404 });
      }
      storyDay = sd as StoryDay & { chs_characters: Character };
      character = sd.chs_characters as Character;
    } else {
      const { data: char, error } = await supabase
        .from("chs_characters")
        .select("*")
        .eq("id", character_id)
        .single();
      if (error || !char) {
        return NextResponse.json({ error: "Character not found" }, { status: 404 });
      }
      character = char as Character;
    }

    // If story day already has a caption, return it directly
    if (storyDay?.ig_caption) {
      return NextResponse.json({
        ig_caption: storyDay.ig_caption,
        hashtags: storyDay.hashtags ?? [],
        yt_title: "",
        yt_description: "",
        source: "story_day",
      });
    }

    const platformList = (platforms as string[]).join(" and ");
    const contentKind = content_type === "video" ? "a video reel" : "a photo post";

    const personalityText = Object.entries(character.personality)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const systemPrompt = `You are a social media content strategist for an AI character named ${character.name}.

Character profile:
Visual: ${character.visual_brief}
Backstory: ${character.backstory}
Personality traits:
${personalityText}

Generate authentic social media content in the character's voice. Return ONLY valid JSON, no markdown.`;

    const storyContext = storyDay
      ? `Today's story context:
- Location: ${storyDay.location}
- Mood: ${storyDay.mood}
- Arc position: ${storyDay.arc_position}
- Narrative: ${storyDay.narrative}
${storyDay.next_hint ? `- Next hint: ${storyDay.next_hint}` : ""}

Write the Instagram caption and hashtags BASED ON this story context.
The caption must reflect the location, mood and narrative above.
Do NOT invent a new story — stay true to today's narrative.

`
      : "";

    const userPrompt = `Generate social media content for ${contentKind} posted on ${platformList}.

${storyContext}Return JSON with exactly these fields:
{
  "ig_caption": "150-220 character caption in English, with 1-3 emojis, ending with a CTA",
  "hashtags": ["array", "of", "20-25", "hashtags", "without", "hash", "symbol"],
  "yt_title": "Max 70 char SEO-optimized YouTube title",
  "yt_description": "300-400 char YouTube description, most important info in first 2 lines"
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      ig_caption: parsed.ig_caption ?? "",
      hashtags: parsed.hashtags ?? [],
      yt_title: parsed.yt_title ?? "",
      yt_description: parsed.yt_description ?? "",
      source: "generated",
    });
  } catch (error) {
    console.error("[generate-caption]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
