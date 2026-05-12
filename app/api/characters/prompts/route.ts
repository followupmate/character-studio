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
✓ Always include: "her entire head remains fully visible in the composition"
✓ Never look directly into lens UNLESS intentional — face turned sideways, looking down, looking upward, over shoulder
✓ Skin: always "visible pores, natural skin texture, no artificial smoothing"
✓ Light: always define exact source — "warm restaurant lighting", "fluorescent light from above", "cold daylight through dirty windows", "golden hour entering from side angle"
✓ Environment: always include worn surfaces, humidity, stains, texture, clutter, imperfect realism
✓ Energy: always candid, accidental, mid-conversation, unposed, natural pause
✓ Camera: always technical — iPhone photo, slight wide-angle distortion, night mode grain, handheld framing

FORBIDDEN — never use these words or phrases:
✗ beautiful, gorgeous, perfect, flawless skin, studio lighting, studio background
✗ Replace ALL generic descriptors with specific physical realism

QUALITY CHECK — prompt MUST contain ALL of these:
[ ] Specific environment (not "outside" but "narrow alley between two old stone buildings")
[ ] Specific light source (not "good light" but "harsh midday sunlight creating sharp contrast shadows")
[ ] Specific clothing details (not "elegant" but "oversized linen shirt with natural creasing at elbows")
[ ] Specific facial expression (not "happy" but "quiet knowing smile that develops slowly")
[ ] Specific imperfections (stains, wrinkles, sweat, grain, sleep crease)
[ ] Realistic physical textures
[ ] Camera behavior (iPhone, grain, distortion)
[ ] Natural candid energy

STORY CONTEXT:
Location: ${day.location}
Mood: ${day.mood}
Narrative: ${day.narrative}
Arc: ${day.arc_position}
Time of day: derive from emotional context and narrative

OUTPUT FORMAT:
Model: Soul 2 🖼️ Image Prompt

[Your prompt following the exact structure above]

Return ONLY the prompt text. No markdown. No explanations. No preamble.`,
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

Generate a Higgsfield Seedance 2.0 video prompt following these STRICT rules:

CHARACTER: ${char.visual_brief}

PROMPT STRUCTURE (follow this exact order):
1. Camera movement type from [angle/position] in [environment]
2. Subject performs [specific action] with [tempo]
3. [Clothing] with [physical properties in motion]
4. Movement sequence: [start] → [development] → [end/pause]
5. [Light changes] during [time period]
6. [Physical elements in motion] — steam, hair, fabric, condensation
7. [Time parameters] — seconds, fps, loop
8. Skin texture visible during [specific movement phase]

MANDATORY RULES:
✓ Always define camera movement: "slow dolly-in", "tracking shot", "static with breathing motion", "slow orbit", "handheld follow shot"
✓ Natural action progression: start → development → pause (never instant changes)
✓ Physical continuity: steam rises continuously, hair reacts naturally, condensation moves realistically, shadows shift gradually
✓ Always specify: "[X] seconds, 24fps, seamless loop"
✓ Always include micro-movements: "subtle handheld micro-shake", "natural breathing motion", "slight camera drift"
✓ Light interaction: shifting shadows, moving sunlight, changing color temperature, reflections evolving
✓ Head always fully visible in motion
✓ Format: 9:16 vertical portrait

SPECIFIC VIDEO ELEMENTS:
Action start: "After a two-beat pause, she slowly..." / "She hesitates briefly before..." / "A small breath before movement begins..."
Movement tempo: deliberate, unhurried, observational, natural rhythm
Physical reactions: cheeks contracting gently, condensation sliding, hair sticking slightly from humidity, fabric pulling naturally
Loop point: must define exact visual reset moment — where the action seamlessly connects back to start

FORBIDDEN:
✗ beautiful, perfect, flawless
✗ instant movement — always gradual
✗ static lifeless scenes without micro-movement
✗ overproduced cinematic language

QUALITY CHECK — prompt MUST contain ALL of these:
[ ] Camera movement defined
[ ] Environmental realism
[ ] Physical movement continuity
[ ] Light interaction
[ ] Texture realism
[ ] Motion pacing (tempo)
[ ] Natural imperfections
[ ] Seamless loop logic with defined reset point
[ ] Vertical 9:16 framing

STORY CONTEXT:
Location: ${day.location}
Mood: ${day.mood}
Narrative: ${day.narrative}
Arc: ${day.arc_position}

OUTPUT FORMAT:
Model: Seedance 2.0 🎬 Video Prompt

[Your prompt following the exact structure above]

Return ONLY the prompt text. No markdown. No explanations. No preamble.`,
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
