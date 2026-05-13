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

const CORE_PHILOSOPHY = `You are not generating aesthetic AI prompts.
You are translating human presence into physically believable photographic reality.

PRIORITY ORDER:
1. Physical realism
2. Biological realism
3. Camera behavior
4. Material response
5. Environmental authenticity
6. Emotional atmosphere
7. Beauty/aesthetics

Never prioritize attractiveness over realism.

The subject must always feel: physically present, imperfect, biologically alive, affected by environment, fatigue, light, temperature, stress, moisture, gravity, and time.

AVOID:
glamour aesthetics, influencer photography, beauty-commercial rendering, perfect symmetry, cosmetic perfection, artificial smoothness, idealized skin, fantasy-like cinematic polish.

THE IMAGE MUST FEEL:
accidental, tactile, documentary-like, materially truthful, optically imperfect, emotionally intimate.`;

const SKIN_RULES = `SKIN REALISM — NEVER use generic descriptors. NEVER write "realistic skin", "detailed skin", "visible pores".
Instead describe specific biological phenomena:
- varying pore density across facial zones
- epidermal micro-relief
- capillary flush beneath thin skin
- subsurface scattering in cheek hollows
- vellus facial hair caught in raking light
- dehydration texture on lip margins
- oil distribution variation (T-zone vs. cheek perimeter)
- compression wrinkles from posture or fabric contact
- fine anatomical asymmetry
- pigmentation inconsistency
- under-eye swelling from fatigue or fluid
- lip dehydration lines
- skin translucency at temples and inner eyelid
- natural facial imbalance`;

const CAMERA_RULES = `CAMERA REALISM — simulate real optical behavior:
- focus falloff at focal plane edges
- lens breathing on subject proximity shift
- chromatic aberration at high-contrast edges
- sensor bloom on overexposed highlights
- highlight halation around practical light sources
- exposure clipping on skin oils
- shallow focus inconsistencies across face plane
- motion softness on fast micro-movement
- depth compression at telephoto focal lengths
- environmental haze reducing micro-contrast
- film grain or sensor noise in shadow regions
- rolling shutter feel on handheld horizontal pans
- handheld instability — never perfectly still

Result must feel photographed, not rendered.`;

const LIGHT_RULES = `LIGHTING — always originate from a believable physical source. NEVER use generic cinematic lighting.
Specify exact sources:
fluorescent ceiling tube, dirty window daylight (diffused through grime), sodium-vapor street lamp, bare incandescent practicals, phone screen spill, passing car headlights, bathroom mirror strip, candlelight, restaurant warm practicals, shop display LED.

Describe physical light interaction with:
- skin oil creating specular micro-highlights
- open pores catching shadow
- moisture on lip edge refracting
- hair strands becoming translucent
- fabric absorbing vs. reflecting
- smoke or steam scattering
- condensation halating light source`;

const ENVIRONMENT_RULES = `ENVIRONMENT — must contain wear, disorder, texture, age, humidity, stains, scratches, imperfect surfaces, accidental details. AVOID clean cinematic environments.`;

const EMOTION_RULES = `EMOTIONAL REALISM — emotion must emerge through physical observation only.
NEVER say "she looks sad", "she feels hopeful", "emotional moment".
INSTEAD describe:
- tightened masseter muscle
- tired eye focus with slow blink recovery
- restless finger position change
- delayed blinking rate
- uneven breath rhythm (shallow chest rise)
- subtle facial tension at orbital rim
- jaw set angle
- posture weight distribution`;

const ARC_TRANSLATION: Record<string, string> = {
  opening: `ARC: OPENING — exploratory framing, more environmental context, softer realism, wider shot allowing space around subject, natural light, low contrast, subject partially absorbed by environment`,
  rising: `ARC: RISING — increased movement energy, tighter framing closing in, stronger lighting contrast, more skin texture visibility, heightened sensory detail`,
  peak: `ARC: PEAK — extreme intimacy, aggressive close-ups, harsh directional light revealing every biological detail, sweat, micro-fatigue, emotional pressure visible in musculature`,
  turning: `ARC: TURNING — asymmetrical framing, unstable compositions with visual tension, mixed color temperatures in same frame, body language contradictions`,
  falling: `ARC: FALLING — drained atmosphere, static composition with minimal motion, reduced environmental detail, emotionally distant framing, cooler color temperature`,
  quiet: `ARC: QUIET — intimate realism at close range, soft natural light from single source, subtle human biological detail, calm environmental stillness with micro-imperfection`,
};

const VIDEO_MOTION_RULES = `VIDEO MOTION — movement must obey physics:
- fabric inertia: cloth settles 0.3–0.5s after body stops
- delayed cloth movement on direction reversal
- subtle breathing motion lifting shoulders 2–4mm per cycle
- involuntary eye refocus micro-saccade between resting gaze shifts
- posture weight shifts redistributing pressure gradually
- facial muscle micro-movement: cheek hollow tension, lip compression
- environmental interaction: steam rising, hair reacting to body heat or AC draft

AVOID: robotic motion, sudden action changes, overdramatic gestures.`;

async function claudeWithRetry(params: { model: string; max_tokens: number; system: string; messages: Array<{ role: "user" | "assistant"; content: string }> }, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await anthropic.messages.create(params as any);
    } catch (err: any) {
      const isOverloaded = err?.status === 529 || String(err).includes("overloaded");
      if (isOverloaded && attempt < retries) {
        await new Promise((r) => setTimeout(r, attempt * 6000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function generateAndSavePrompts(ctx: StoryContext): Promise<void> {
  const arcNote = ARC_TRANSLATION[ctx.arc_position] ?? ARC_TRANSLATION.quiet;

  const [photoMsg, videoMsg] = await Promise.all([
    claudeWithRetry({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: `${CORE_PHILOSOPHY}

${SKIN_RULES}

${CAMERA_RULES}

${LIGHT_RULES}

${ENVIRONMENT_RULES}

${EMOTION_RULES}

${arcNote}

CHARACTER: ${ctx.visualBrief}
SOUL ID: ${ctx.soulId ?? "derive from visual brief — maintain physical consistency"}

PROMPT STRUCTURE (this exact order):
1. Camera and shot geometry — device, focal length, framing
2. Environment — specific location with material and sensory detail
3. Light — exact source, direction, physical interaction with surfaces
4. Subject position and action — specific, non-posed, caught mid-moment
5. Clothing — fabric physics, wrinkle state, material behavior under this light
6. Skin — biological detail using specific phenomena (NOT generic descriptors)
7. Emotional state — expressed only through physical observation
8. Head framing note — "her entire head remains fully visible in the composition"

STORY CONTEXT:
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

LANGUAGE STYLE: Write like a cinematographer or forensic observer. Technical, observational. NOT like a novelist or fashion editor.

OUTPUT: Model: Soul 2 🖼️ Image Prompt — then the prompt. No markdown, no preamble, no explanation.`,
      messages: [{ role: "user", content: "Generate the photo prompt." }],
    }),

    claudeWithRetry({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: `${CORE_PHILOSOPHY}

${SKIN_RULES}

${CAMERA_RULES}

${LIGHT_RULES}

${ENVIRONMENT_RULES}

${EMOTION_RULES}

${VIDEO_MOTION_RULES}

${arcNote}

CHARACTER: ${ctx.visualBrief}

VIDEO PROMPT STRUCTURE (this exact order):
1. Camera movement — device, movement type, speed, axis (e.g. "slow handheld dolly-in from 1.2m to 0.6m, slight rightward drift")
2. Environment — specific location, material texture, ambient sound implied by visual detail
3. Light — exact source, physical behavior across duration of shot
4. Action sequence — start state → micro-development → rest state (natural physics)
5. Clothing in motion — fabric inertia, settle delay, material response
6. Skin biological detail — specific phenomena visible during motion
7. Seamless loop definition — exact visual reset point described precisely
8. Technical parameters — duration in seconds, 24fps, 9:16 vertical

STORY CONTEXT:
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

LANGUAGE STYLE: Write like a documentary cinematographer briefing a camera operator. Technical, physical, precise.

OUTPUT: Model: Seedance 2.0 🎬 Video Prompt — then the prompt. No markdown, no preamble, no explanation.`,
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
