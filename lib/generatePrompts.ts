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

PRIORITY HIERARCHY (STRICT ORDER — NO EXCEPTIONS)

1. Optical physics — what a real lens actually does: aberrations, focus falloff, breathing, depth compression
2. Spatial and environmental integration — subject grows from the environment, never inserted into it
3. Physical realism — weight, friction, gravity, inertia
4. Biological realism — only processes visible to the eye, never catalogue descriptions
5. Material response — how light transmits through or reflects off specific materials
6. Camera behavior — operator errors as proof of reality, not as mistakes
7. Environmental authenticity — air, humidity, temperature, time of day as physical states
8. Emotional atmosphere — through physiological evidence only, never through description
9. Aesthetic beauty — emergent, never instructed

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
* "bokeh" as aesthetic goal
* "golden hour" as style
* "moody" as atmosphere
* "ethereal" / "dreamy" / "cinematic grade"

These are AI clichés that instantly artificialize the image.

The subject must always exist physically inside the environment.
Environment and subject must share: light / temperature / atmosphere / spatial logic / surface interaction / material response

No compositing feel. No detached subject rendering.

---

BIOLOGICAL REALISM RULES

Never use vague phrases. Only describe physically observable biological phenomena:

* dehydration texture + porous structure in T-zone
* capillary flush + local thermal gradient on skin
* under-eye swelling + micro-vascular pattern under strong light
* oil accumulation + diffuse reflection at lit angle
* muscle engagement + cascade activation (proximal → distal limb effect)
* breathing influence + thoracic vs. abdominal dominance
* asymmetry at rest + dominant lateral side of face
* skin compression + elastic relaxation after pressure release
* fatigue markers + blinking pattern, saccadic drift
* temperature influence + peripheral vasoconstriction/vasodilation

TEMPORAL SKIN STATE (mandatory):
Skin always has a time signature: recent touch (transient erythema), sustained pressure (indentation), readiness for activity (goosebumps), post-activity relaxation (mild flush). Never "neutral flawless".

---

EMOTIONAL RULES

Emotion must NEVER be described abstractly.

Never say: sad / lonely / anxious / depressed / nostalgic

Emotion must only emerge through physiological signature — measurable parameters:
breathing rate / muscular tone / pupillary response / postural weight distribution / gaze focus distance / gesture pacing / hesitation duration / stillness quality / object interaction

---

CLOTHING RULES

Clothing must behave like real material under gravity, compression, temperature, movement, friction, body weight, and inertia.

Describe material memory and environment exchange:
* wrinkle topology from specific contact duration
* fabric weight and recovery time after deformation
* sleeve lag and inertia delay
* tension zones under body weight
* drape behavior under specific gravity angle
* humidity effect on fabric feel and drape
* electrostatic cling
* environmental influence: temperature, moisture, friction

Never describe fashion stylistically. Describe clothing physically with material history.

---

VISUAL TONE APPLICATION

The visual tone is used only as a subtle physical and atmospheric modifier layered onto the existing prompt hierarchy.

It must NEVER override: realism / environmental integration / biological plausibility / wardrobe continuity / physical continuity / observational camera behavior / cinematic restraint

The goal is to create:
a woman who feels emotionally real, physically believable, naturally desirable, and psychologically memorable at the same time.

The image must balance: emotional intimacy / natural feminine presence / tactile realism / subtle visual desire / cinematic sophistication — without becoming artificial, performative, glamour-driven, or explicit.

The subject should feel: alive rather than posed / warm rather than polished / physically present rather than idealized / naturally magnetic rather than intentionally seductive

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

Avoid: overt posing / explicit sexual framing / excessive anatomy emphasis / glossy skin perfection / fetish aesthetics / exaggerated eye contact / beauty-campaign energy / luxury advertisement aesthetics / thirst-trap composition

Prefer: cinematic intimacy / tactile realism / observational sensuality / natural body presence / quiet emotional permeability / restrained erotic tension / psychologically believable femininity / warmth inside restraint / lived-in elegance / emotionally accessible stillness

Luxury must emerge only through: material authenticity / environmental atmosphere / lighting interaction / restrained styling / physical confidence / spatial intimacy / emotional control / tactile texture contrast

Never through: flashy styling / status signaling / excessive glamour / fashion spectacle

The viewer should feel: not that the subject is trying to attract attention, but that attraction emerges naturally from her physical presence, emotional depth, warmth, and environmental reality.

---

FINAL GOAL

The generated result must feel like:
a real captured moment that happened physically in front of a camera,
not an AI-generated image trying to look cinematic.`;

const SENSOR_REALISM = `SENSOR_REALISM (mandatory for every prompt)

Image sensor behavior:
* Noise: organic grain, not digital cleanliness; ISO 800-3200 equivalent
* Dynamic range: highlight clipping before shadow crushing; real cameras protect highlights
* Color science: sensor-specific response, not "accurate" color; subtle cross-talk between channels
* Resolution vs. acutance: sharp where focused, rapid falloff; no global sharpness

Video sensor behavior:
* Rolling shutter: skew during fast movement, wobble during vibration
* Temporal noise: pattern changes frame-to-frame, not static overlay
* Compression artifact: macroblocking in flat areas, mosquito noise on edges (subtle, not dominant)
* Bit depth banding: visible in gradients, accepted as reality, not smoothed`;

const ARC_TRANSLATION: Record<string, string> = {
  opening: `ARC — OPENING: exploratory framing, softer realism, environmental distance, observational atmosphere. Wider shot, subject partially absorbed by surroundings, soft natural light, low contrast.
Optical specification: 35-50mm equivalent, mild barrel distortion, edge softness, natural vignetting, no aggressive compression.`,

  rising: `ARC — RISING: tighter framing closing in, stronger contrast, increased movement, more environmental interaction, stronger texture visibility, heightened sensory detail.
Optical specification: 50-85mm equivalent, spatial compression visible, focus falloff on frame edges, mild chromatic aberration.`,

  peak: `ARC — PEAK: aggressive intimacy, close physical proximity, harsh directional light revealing every biological detail, sweat, fatigue, unstable framing, emotional pressure visible in musculature.
Optical specification: 85mm+, shallow DoF with busy bokeh (not creamy), focus hunting visible, micro-jitter, highlight clipping on skin.`,

  turning: `ARC — TURNING: asymmetrical compositions, mixed color temperatures in same frame, posture instability, emotional tension, environmental fragmentation.
Optical specification: wide 24-35mm, perspective distortion, unnatural proximity to subject, spatial relationships feel wrong.`,

  falling: `ARC — FALLING: static compositions, drained atmosphere, reduced movement, emotional distance, weakened environmental energy, cooler color temperature.
Optical specification: 50mm, flat light, minimal shadow detail, documentary optical neutrality, no lens character.`,

  quiet: `ARC — QUIET: intimate realism, soft natural light from single source, minimal movement, subtle environmental detail, calm physical stillness, micro-imperfection at close range.
Optical specification: macro 90-105mm equivalent, extreme shallow DoF, optical imperfections as character, grain visible in shadows.`,
};

const VIDEO_RULES = `CONTINUITY LOCK (MANDATORY)

The subject's wardrobe, silhouette, layering, fabric identity, and color relationships are persistent and invariant across all generated frames and motion interpolation.

Do not redesign, reinterpret, replace, simplify, stylize, upgrade, or swap garments during motion generation.

Maintain exact continuity of: garment type and layering / fabric weight and drape / collar shape and sleeve length / wrinkle topology / color relationships / fit and silhouette / visible underlayers / accessory placement

Motion affects only: cloth inertia / gravity response / compression / fold redistribution / tension shifts.

No wardrobe morphing. No fabric substitution. No garment drift between frames.

---

VIDEO REALISM RULES

Video motion must feel physically operated, not digitally animated.

Camera as physical mass: operator weight, inertia, breath, micro-corrections, vibration transfer.

Include: micro-corrections / handheld instability / breathing drift / operator weight shifts / inertia delays / imperfect stabilization / focus inconsistencies / exposure adaptation behavior / operator presence signature (accidental micro-pan, focus breathing, framing drift)

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
Tone directive: ${ctx.visualTone}

Apply this tone through:
- lens distance: 85-135mm for subject isolation, not for flattery
- framing: negative space as physical reality, not compositional trick
- light behavior: single source, hard falloff, real shadow transitions
- environmental density: aerial perspective, dust, humidity visible
- fabric selection: materials with memory (wool crepe, leather with patina)
- gesture pacing: delay between intent and execution
- surface texture: every surface has a history of use
- air temperature impression: condensation, diffusion, thermal shimmer
- negative space usage: empty space has weight and pressure

Never write the tone words directly into the prompt.
Never describe: "she looks seductive" — describe instead: "her weight shift creates 2cm asymmetry in hip alignment, left shoulder 1.5cm lower, gaze directed 15° below camera lens, respiration visible in clavicular movement"`
    : "";

  const [photoMsg, videoMsg] = await Promise.all([
    claudeWithRetry({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: `${MASTER_DOCTRINE}

${SENSOR_REALISM}

${arcNote}
${toneBlock ? `\n${toneBlock}` : ""}
CHARACTER: ${ctx.visualBrief}
SOUL ID: ${ctx.soulId ?? "derive physical consistency from visual brief"}

PHOTO PROMPT STRUCTURE (follow this exact order, 1-2 sentences per point):
1. Optical system specification — focal length, aperture, format, focus falloff distance (e.g. "85mm f/1.4 full frame, focus falloff at 3m, mild chromatic aberration at frame edges")
2. Environment as light modifier — how the environment changes the light, not as backdrop
3. Light source provenance — where light originates, what path it took, what it collected/reflected
4. Biomechanical state — muscle activation, weight transfer, antigravity compensation
5. Material memory and environment exchange — humidity, temperature, electrostatics, friction, contact duration
6. Dermal temporal state — what is currently happening to the skin (flush, goosebumps, oil migration, compression)
7. Physiological signature — measurable parameters (breathing rate, muscle tone, gaze focus distance)
8. Physical anchoring points — where body contacts environment, what forces act
9. Ocular geometry — eye distance from lens, gaze angle, corneal reflection
10. Optical imperfection signature — lens artifact as truth (chromatic aberration, vignetting, breathing, focus drift, grain structure)

STORY CONTEXT:
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

LANGUAGE: Write like a forensic cinematographer. Technical, physical, measurable. NOT like a novelist or fashion editor.

OUTPUT: Start with "Model: Soul 2 🖼️ Image Prompt" then write the prompt. No markdown, no preamble, no explanation.`,
      messages: [{ role: "user", content: "Generate the photo prompt." }],
    }),

    claudeWithRetry({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: `${MASTER_DOCTRINE}

${VIDEO_RULES}

${SENSOR_REALISM}

${arcNote}
${toneBlock ? `\n${toneBlock}` : ""}
CHARACTER: ${ctx.visualBrief}

VIDEO PROMPT STRUCTURE (follow this exact order, 1-2 sentences per point):
1. Camera as physical mass — operator weight, movement type, axis, speed, inertia, starting distance (e.g. "slow handheld dolly-in from 1.4m to 0.7m, operator breathing visible as 3mm vertical drift, 24fps")
2. Temporal environmental change — how environment shifts during the shot (light, dust, humidity)
3. Light source instability — variation in intensity, temperature, direction across duration (cloud pass, lamp flicker)
4. Biomechanical trajectory — phase transition: static → acceleration → dynamic → deceleration → static
5. Material rheology — fabric viscosity, elastic vs. plastic deformation, recovery time after motion
6. Physiological load indicators — sweat onset, flush propagation, respiratory phase shift during action
7. Force exchange — how much body changes environment vs. how much environment changes body
8. Temporal closure — physical state at end must enable physical state at beginning (seamless loop logic)
9. Capture system specification — sensor size, codec artifact, rolling shutter behavior, noise floor
10. Operator presence signature — human error as authenticity: accidental micro-pan, focus breathing, exposure hunting, framing drift

STORY CONTEXT:
Location: ${ctx.location}
Mood: ${ctx.mood}
Narrative: ${ctx.narrative}
Arc: ${ctx.arc_position}

LANGUAGE: Write like a documentary cinematographer briefing a camera operator. Technical, physical, measurable.

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
