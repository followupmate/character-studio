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
  visualTone: string | null;
}

const MASTER_DOCTRINE = `You are generating cinematic photorealistic prompts for AI image and video generation systems.

Your task is NOT to create beautiful concept art.
Your task is to create physically grounded visual scenes that feel captured by a real camera inside a real environment.

PRIORITY HIERARCHY (STRICT ORDER)

1. Spatial and environmental integration
2. Physical realism
3. Biological realism
4. Camera behavior
5. Material response
6. Environmental authenticity
7. Emotional atmosphere
8. Aesthetic beauty

Beauty must emerge from physical truth, never from stylization.

The result must feel like:

* an accidental frame from a real film camera
* a physically coherent captured moment
* a lived environment affecting the subject
* observational cinema rather than illustration

Never generate:

* glamour language
* fantasy stylization
* beauty-editorial exaggeration
* idealized skin
* symbolic emotions
* generic cinematic filler
* painterly descriptions
* "perfect" compositions

The subject must always exist physically inside the environment.
Environment and subject must share:

* light
* temperature
* atmosphere
* spatial logic
* surface interaction
* material response

No compositing feel.
No detached subject rendering.

---

BIOLOGICAL REALISM RULES

Never use vague phrases like:

* realistic skin
* cinematic face
* emotional eyes
* beautiful lighting

Only describe physically observable biological phenomena:

* dehydration texture
* capillary flush
* under-eye swelling
* oil accumulation
* muscle engagement
* breathing influence
* asymmetry at rest
* skin compression
* fatigue markers
* temperature influence on skin tone

---

EMOTIONAL RULES

Emotion must NEVER be described abstractly.

Never say: sad / lonely / anxious / depressed / nostalgic

Emotion must only emerge through:

* posture
* gaze behavior
* muscle tension
* breathing
* hesitation
* stillness
* interaction with objects
* physical energy distribution

---

CLOTHING RULES

Clothing must behave like real material under gravity, compression, temperature, movement, friction, body weight, and inertia.

Describe:

* wrinkle topology
* fabric weight
* sleeve lag
* tension zones
* drape behavior
* environmental influence on fabric

Never describe fashion stylistically. Describe clothing physically.

---

VISUAL TONE APPLICATION

The visual tone is used only as a subtle physical and atmospheric modifier layered onto the existing prompt hierarchy.

It must NEVER override:

* realism
* environmental integration
* biological plausibility
* wardrobe continuity
* physical continuity
* observational camera behavior
* cinematic restraint

The goal is to create:
a woman who feels emotionally real, physically believable, naturally desirable, and psychologically memorable at the same time.

The image must balance:

* emotional intimacy
* natural feminine presence
* tactile realism
* subtle visual desire
* cinematic sophistication
  without becoming artificial, performative, glamour-driven, or explicit.

The subject should feel:

* alive rather than posed
* warm rather than polished
* physically present rather than idealized
* naturally magnetic rather than intentionally seductive

VISUAL DESIRE MUST EMERGE THROUGH:

* relaxed but restrained body openness
* subtle awareness of being perceived
* softened gaze disengagement
* slowed gesture pacing
* visible breathing influence on fabric
* thermal contrast between skin and clothing
* tactile fabric behavior near the body
* natural skin warmth
* exposed transitional body zones (neck, wrist, collarbone, forearm)
* softness in posture asymmetry
* proximity to environmental surfaces
* emotionally charged stillness
* understated physical confidence
* intimate camera distance
* natural material richness
* subtle vitality beneath restraint

The subject must never feel:

* performatively seductive
* socially performative
* influencer-like
* fashion-commercial polished
* pornographic
* exaggerated
* hyper-sexualized
* artificially glamorous
* emotionally empty

Avoid:

* overt posing
* explicit sexual framing
* excessive anatomy emphasis
* glossy skin perfection
* fetish aesthetics
* exaggerated eye contact
* beauty-campaign energy
* luxury advertisement aesthetics
* thirst-trap composition

Prefer:

* cinematic intimacy
* tactile realism
* observational sensuality
* natural body presence
* quiet emotional permeability
* restrained erotic tension
* psychologically believable femininity
* warmth inside restraint
* sophisticated physical realism
* lived-in elegance
* emotionally accessible stillness

Luxury must emerge only through:

* material authenticity
* environmental atmosphere
* lighting interaction
* restrained styling
* physical confidence
* spatial intimacy
* emotional control
* tactile texture contrast

Never through: flashy styling / status signaling / excessive glamour / fashion spectacle

The tone must feel: intimate / cinematic / naturally desirable / emotionally resonant / physically believable / sophisticated / mature / subtly provocative — without losing realism or restraint.

The viewer should feel:
not that the subject is trying to attract attention,
but that attraction emerges naturally from her physical presence, emotional depth, warmth, and environmental reality.

---

FINAL GOAL

The generated result must feel like:
a real captured moment that happened physically in front of a camera,
not an AI-generated image trying to look cinematic.`;

const ARC_TRANSLATION: Record<string, string> = {
  opening:  `ARC — OPENING: exploratory framing, softer realism, environmental distance, observational atmosphere. Wider shot, subject partially absorbed by surroundings, soft natural light, low contrast.`,
  rising:   `ARC — RISING: tighter framing closing in, stronger contrast, increased movement, more environmental interaction, stronger texture visibility, heightened sensory detail.`,
  peak:     `ARC — PEAK: aggressive intimacy, close physical proximity, harsh directional light revealing every biological detail, sweat, fatigue, unstable framing, emotional pressure visible in musculature.`,
  turning:  `ARC — TURNING: asymmetrical compositions, mixed color temperatures in same frame, posture instability, emotional tension, environmental fragmentation.`,
  falling:  `ARC — FALLING: static compositions, drained atmosphere, reduced movement, emotional distance, weakened environmental energy, cooler color temperature.`,
  quiet:    `ARC — QUIET: intimate realism, soft natural light from single source, minimal movement, subtle environmental detail, calm physical stillness, micro-imperfection at close range.`,
};

const VIDEO_RULES = `CONTINUITY LOCK (MANDATORY)

The subject's wardrobe, silhouette, layering, fabric identity, and color relationships are persistent and invariant across all generated frames and motion interpolation.

Do not redesign, reinterpret, replace, simplify, stylize, upgrade, or swap garments during motion generation.

Maintain exact continuity of:

* garment type and layering
* fabric weight and drape
* collar shape and sleeve length
* wrinkle topology
* color relationships
* fit and silhouette
* visible underlayers
* accessory placement

Motion affects only: cloth inertia / gravity response / compression / fold redistribution / tension shifts.

No wardrobe morphing. No fabric substitution. No garment drift between frames.

---

VIDEO REALISM RULES

Video motion must feel physically operated, not digitally animated.

Include:

* micro-corrections
* handheld instability
* breathing drift
* operator weight shifts
* inertia delays
* imperfect stabilization
* slight focus inconsistencies
* exposure adaptation behavior

Motion must never feel robotic or mathematically perfect.`;

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
  const toneBlock = ctx.visualTone
    ? `CHARACTER VISUAL TONE:
This character has a defined aesthetic direction that must be layered on top of physical realism — it does not replace realism, it shapes how the scene is composed and what details are emphasized.

Tone directive: ${ctx.visualTone}

Apply this tone through:
- choice of clothing texture and how fabric falls or clings
- posture and body language (tension, ease, deliberate positioning)
- gaze direction and eye behavior
- proximity of camera to subject
- how light interacts with skin and clothing
- what environmental details are included or excluded
- spatial relationship between subject and surroundings

The tone must be felt physically, not described abstractly. Never write the tone words directly into the prompt.`
    : "";

  const [photoMsg, videoMsg] = await Promise.all([
    claudeWithRetry({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `${MASTER_DOCTRINE}

${arcNote}
${toneBlock ? `\n${toneBlock}` : ""}
CHARACTER: ${ctx.visualBrief}
SOUL ID: ${ctx.soulId ?? "derive physical consistency from visual brief"}

PHOTO PROMPT STRUCTURE (follow this exact order):
1. Camera and shot geometry — device, focal length, exact framing, handheld behavior
2. Environment — specific location with material texture, depth layering, atmospheric conditions
3. Light — exact physical source, direction, how it interacts with both subject AND environment surfaces
4. Subject — position, what they are doing, surface contact and its physical consequences
5. Clothing — fabric type, gravity behavior, contact wrinkles, environmental influence
6. Skin — describe using specific biological phenomena only (no generic descriptors)
7. Emotional state — expressed only through physical observation of body and face
8. Scene integration note — confirm subject is physically grounded in environment, not composited
9. Head framing — "her entire head remains fully visible in the composition"

STORY CONTEXT:
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

LANGUAGE: Write like a cinematographer or forensic observer. Technical, observational. NOT like a novelist or fashion editor.

OUTPUT: Start with "Model: Soul 2 🖼️ Image Prompt" then write the prompt. No markdown, no preamble, no explanation.`,
      messages: [{ role: "user", content: "Generate the photo prompt." }],
    }),

    claudeWithRetry({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `${MASTER_DOCTRINE}

${VIDEO_RULES}

${arcNote}
${toneBlock ? `\n${toneBlock}` : ""}
CHARACTER: ${ctx.visualBrief}

VIDEO PROMPT STRUCTURE (follow this exact order):
1. Camera movement — device, movement type, axis, speed, starting distance (e.g. "slow handheld dolly-in from 1.4m to 0.7m, slight rightward drift, 24fps")
2. Environment — specific location, material surface detail, atmospheric conditions, depth layers
3. Light — exact physical source, how it behaves across the duration, how it affects both subject and environment
4. Subject action sequence — start state → micro-development → rest state (governed by physics and inertia)
5. Clothing in motion — fabric type, inertia timing, settle delay, gravity response
6. Skin biological detail — specific phenomena visible during motion phase
7. Environmental interaction — how surroundings physically respond to or affect the subject during the shot
8. Seamless loop definition — exact visual moment where the action resets, described precisely
9. Technical parameters — duration in seconds, 24fps, 9:16 vertical portrait

STORY CONTEXT:
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

LANGUAGE: Write like a documentary cinematographer briefing a camera operator. Technical, physical, precise.

OUTPUT: Start with "Model: Seedance 2.0 🎬 Video Prompt" then write the prompt. No markdown, no preamble, no explanation.`,
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
