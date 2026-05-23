import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { character_id, story_day_id, reel_type } = await req.json();

    if (!character_id || !reel_type) {
      return NextResponse.json({ error: "character_id and reel_type required" }, { status: 400 });
    }

    const { data: char } = await supabase
      .from("chs_characters")
      .select("name, visual_brief, personality, backstory")
      .eq("id", character_id)
      .single();

    if (!char) return NextResponse.json({ error: "Character not found" }, { status: 404 });

    let storyContext = "";
    if (story_day_id) {
      const { data: day } = await supabase
        .from("chs_story_days")
        .select("narrative, location, mood, arc_position")
        .eq("id", story_day_id)
        .single();
      if (day) {
        storyContext = `Today's story: ${day.narrative}\nLocation: ${day.location}\nMood: ${day.mood}\nArc: ${day.arc_position}`;
      }
    }

    const personality = typeof char.personality === "object"
      ? Object.values(char.personality).join(", ")
      : String(char.personality ?? "");

    let systemPrompt: string;
    let isDiscovery = reel_type === "discovery";

    if (isDiscovery) {
      systemPrompt = `You are a cinematic content strategist for a faceless AI creator account.

Character: ${char.name}
Visual brief: ${char.visual_brief}
Personality: ${personality}
${storyContext}

Create a Discovery Reel brief (6-9 seconds, reach-focused):

HOOK (0-1s): A POV or emotional statement that stops scrolling.
Pattern: "POV: [relatable moment]" or "[emotional truth]"
Must feel: cinematic, feminine, soft luxury

VISUALS (1-6s): Describe 3-4 specific shots.
Style: slow movement, golden hour, textures, mirror shots
Locations from today's story context.

CTA (last 1s): Soft, non-pushy.
Pattern: "follow for [identity]" or just aesthetic text overlay

IG CAPTION: 150-200 chars. Poetic, minimal. No emoji overload.
HASHTAGS: 20 hashtags. Mix: niche small (under 500k), medium (500k-2M), aesthetic.

Respond in English (for international reach).
Keep the vibe: soft luxury · cinematic femininity · quiet confidence.

Return ONLY a JSON object with these keys:
{
  "hook": "...",
  "visuals": "...",
  "cta": "...",
  "ig_caption": "...",
  "hashtags": ["tag1", "tag2", ...]
}`;
    } else {
      systemPrompt = `You are a cinematic content strategist for a faceless AI creator account.

Character: ${char.name}
Visual brief: ${char.visual_brief}
Personality: ${personality}
${storyContext}

Create a Connection Reel brief (softer, intimate, emotional):

HOOK: A poetic statement about her inner world or romanticized life.
Pattern: "she [romanticized action]" or "[quiet emotional truth]"

VISUALS: 3-4 intimate shots.
Style: smiling candid, BTS editing moment, sunset portrait, slow life
More personal than Discovery reel. Shows personality.

MOOD: One word that captures the feeling.

IG CAPTION: Intimate, personal. Like a diary entry. 100-150 chars.
HASHTAGS: 15 hashtags. More personal/lifestyle focused.

Respond in English.

Return ONLY a JSON object with these keys:
{
  "hook": "...",
  "visuals": "...",
  "mood": "...",
  "ig_caption": "...",
  "hashtags": ["tag1", "tag2", ...]
}`;
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: "Generate the reel brief." }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const brief = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ success: true, brief });
  } catch (error) {
    console.error("[generate-reel-brief]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
