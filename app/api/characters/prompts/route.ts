import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { storyDayId } = await req.json();

    // Load story day + character
    const { data: day, error } = await supabase
      .from("chs_story_days")
      .select("*, chs_characters(*)")
      .eq("id", storyDayId)
      .single();

    if (error || !day) throw error ?? new Error("Story day not found");

    const char = day.chs_characters;

    // Generate PHOTO prompt (Soul 2)
    const photoMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: `You are a cinematic prompt engineer for AI image generation.
Generate a Higgsfield Soul 2 photo prompt following these STRICT rules:

CHARACTER: ${char.visual_brief}
SOUL ID: ${char.soul_id ?? "use visual brief for consistency"}

PROMPT STRUCTURE (follow this exact order):
1. Shot type captures [subject] in [position/action]
2. [Clothing] with [texture/cut details]
3. [Face/expression description] – [gaze direction]
4. [Environment] with [specific physical elements]
5. [Light source] creates [specific effects]
6. [Skin texture] – visible details
7. [Composition] is [how captured]
8. [Head/body framing] – [shot energy]

MANDATORY RULES:
✓ Always include "her entire head remains fully visible in the composition"
✓ Never look directly into lens UNLESS intentional — face turned sideways, down, up, over shoulder
✓ Skin: always "visible pores, natural skin texture, no artificial smoothing"
✓ Light: always specific source — "warm restaurant lighting", "golden hour through window", "cool fluorescent from above"
✓ Environment: always specific physical details — worn surfaces, humidity, stains, messiness
✓ Energy: always "candid", "unposed", "mid-conversation", "accidental"
✓ Camera: always technical — "iPhone photo", "night mode grain", "slight wide-angle distortion"

FORBIDDEN:
✗ "beautiful", "gorgeous", "perfect" — replace with specific physical details
✗ "flawless skin" — always use "natural skin texture with visible pores"
✗ "professional lighting" — always specify source
✗ "studio background" — always specific environment

QUALITY CHECK — prompt MUST contain:
[ ] Specific environment (not "outside" but "narrow alley between two old stone buildings")
[ ] Specific light (not "good light" but "harsh midday sunlight creating sharp contrast shadows")
[ ] Specific clothing (not "elegant" but "oversized linen shirt with natural creasing at elbows")
[ ] Specific expression (not "happy" but "quiet knowing smile that develops slowly")
[ ] Specific imperfections (stains, wrinkles, sweat, grain)

STORY CONTEXT:
Location: ${day.location}
Mood: ${day.mood}
Narrative: ${day.narrative}
Arc: ${day.arc_position}
Time of day: derive from mood and narrative

OUTPUT FORMAT:
Model: Soul 2 🖼️ Image Prompt
[Your prompt following the structure above]

Return ONLY the prompt text. No explanation, no markdown, no preamble.`,
      messages: [
        {
          role: "user",
          content: "Generate the photo prompt.",
        },
      ],
    });

    // Generate VIDEO prompt (Seedance 2.0 / Soul 2)
    const videoMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: `You are a cinematic prompt engineer for AI video generation.
Generate a Higgsfield Seedance 2.0 / Soul 2 video prompt following these STRICT rules:

CHARACTER: ${char.visual_brief}

PROMPT STRUCTURE (follow this exact order):
1. Camera movement type from [angle/position] in [environment]
2. Subject performs [specific action] with [tempo]
3. [Clothing] with [physical properties in motion]
4. Movement sequence: [start] → [development] → [end/pause]
5. [Light changes] during [time period]
6. [Physical elements in motion] — water, hair, clothing, steam
7. [Time parameters] — fps, duration, loop
8. Skin texture visible during [specific movement phase]

MANDATORY RULES:
✓ Always define camera movement: "slow dolly-in", "tracking shot", "static with breathing motion", "slow orbit"
✓ Natural action sequence: start → development → small ending (no instant changes)
✓ Physical continuity: water must flow, hair must move, steam must rise consistently
✓ Always specify: "X seconds, 24fps, seamless loop"
✓ Micro-movements: "subtle handheld micro-shake", "natural breathing motion", "slight camera drift"
✓ Light interaction: sun moves, shadows shift, color temperature changes
✓ Head always fully visible even in motion
✓ Format: 9:16 portrait, vertical

SPECIFIC VIDEO ELEMENTS:
- Action start: "After a two-beat pause, she slowly..."
- Movement tempo: "unhurried", "deliberate", "natural rhythm"
- Physical reactions: "cheeks contracting gently", "condensation beading and sliding"
- Loop point: specify where action connects

FORBIDDEN:
✗ "beautiful", "gorgeous", "perfect" — replace with specific physical details
✗ "flawless skin" — always use "natural skin texture with visible pores"
✗ "professional lighting" — always specify source
✗ "studio background" — always specific environment
✗ No instant movements — always gradual
✗ No static scenes without micro-movement

STORY CONTEXT:
Location: ${day.location}
Mood: ${day.mood}
Narrative: ${day.narrative}
Arc: ${day.arc_position}

OUTPUT FORMAT:
Model: Soul 2 🎬 Video Prompt
[Your prompt following the structure above]

Return ONLY the prompt text. No explanation, no markdown, no preamble.`,
      messages: [
        {
          role: "user",
          content: "Generate the video prompt.",
        },
      ],
    });

    const photoPrompt = (photoMsg.content[0] as { type: string; text: string }).text;
    const videoPrompt = (videoMsg.content[0] as { type: string; text: string }).text;

    // Save both prompts to DB
    for (const item of [
      { type: "photo", prompt: photoPrompt },
      { type: "video", prompt: videoPrompt },
    ]) {
      await supabase.from("chs_media").insert({
        story_day_id: storyDayId,
        type: item.type,
        higgsfield_prompt: item.prompt,
        status: "pending",
      });
    }

    return NextResponse.json({
      success: true,
      character: char.name,
      prompts: { photo: photoPrompt, video: videoPrompt },
    });
  } catch (error) {
    console.error("[prompts] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
