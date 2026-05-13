import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";

interface StoryContext {
  storyDayId: string;
  characterId: string;
  location: string;
  mood: string;
  narrative: string;
  arc_position: string;
  visualBrief: string;
  soulId: string | null;
}

export async function generateAndSavePrompts(ctx: StoryContext): Promise<void> {
  const [photoMsg, videoMsg] = await Promise.all([
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: `You are a cinematic prompt engineer for AI image generation.

Generate a Higgsfield Soul 2 photo prompt following these STRICT rules:

CHARACTER: ${ctx.visualBrief}
SOUL ID: ${ctx.soulId ?? "use visual brief for consistency"}

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

QUALITY CHECK — prompt MUST contain ALL of these:
[ ] Specific environment
[ ] Specific light source
[ ] Specific clothing details
[ ] Specific facial expression
[ ] Specific imperfections
[ ] Realistic physical textures
[ ] Camera behavior (iPhone, grain, distortion)
[ ] Natural candid energy

STORY CONTEXT:
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

OUTPUT FORMAT:
Model: Soul 2 🖼️ Image Prompt

[Your prompt following the exact structure above]

Return ONLY the prompt text. No markdown. No explanations. No preamble.`,
      messages: [{ role: "user", content: "Generate the photo prompt." }],
    }),

    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: `You are a cinematic prompt engineer for AI video generation.

Generate a Higgsfield Seedance 2.0 video prompt following these STRICT rules:

CHARACTER: ${ctx.visualBrief}

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
✓ Always specify: "[X] seconds, 24fps, seamless loop"
✓ Always include micro-movements: "subtle handheld micro-shake", "natural breathing motion", "slight camera drift"
✓ Light interaction: shifting shadows, moving sunlight, changing color temperature, reflections evolving
✓ Head always fully visible in motion
✓ Format: 9:16 vertical portrait

FORBIDDEN:
✗ beautiful, perfect, flawless
✗ instant movement — always gradual

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
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

OUTPUT FORMAT:
Model: Seedance 2.0 🎬 Video Prompt

[Your prompt following the exact structure above]

Return ONLY the prompt text. No markdown. No explanations. No preamble.`,
      messages: [{ role: "user", content: "Generate the video prompt." }],
    }),
  ]);

  const photoPrompt = (photoMsg.content[0] as { type: string; text: string }).text;
  const videoPrompt = (videoMsg.content[0] as { type: string; text: string }).text;

  await Promise.all([
    supabase.from("chs_media").insert({
      story_day_id: ctx.storyDayId,
      type: "photo",
      higgsfield_prompt: photoPrompt,
      status: "pending",
    }),
    supabase.from("chs_media").insert({
      story_day_id: ctx.storyDayId,
      type: "video",
      higgsfield_prompt: videoPrompt,
      status: "pending",
    }),
  ]);
}
