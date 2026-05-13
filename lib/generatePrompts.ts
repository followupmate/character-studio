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

const MASTER_DOCTRINE = `You are not generating aesthetic AI prompts.
You are translating human presence into physically believable photographic reality.

Your task is to generate hyper-realistic cinematic image and video prompts that feel captured by a real camera in a real environment — not illustrated, beautified, stylized, composited, or artificially arranged.

The result must feel like: a real moment captured unintentionally by someone physically present in the scene.

PRIORITY ORDER:
1. Spatial and environmental integration
2. Physical realism
3. Biological realism
4. Camera behavior
5. Material response
6. Environmental authenticity
7. Emotional atmosphere
8. Beauty/aesthetics

Never prioritize attractiveness over realism.

The subject must always feel: physically present, biologically alive, materially grounded, imperfect, spatially integrated, affected by environment, gravity, fatigue, temperature, humidity, stress, moisture, light, and time.

AVOID: glamour aesthetics, influencer photography, beauty-commercial rendering, fantasy polish, perfect symmetry, cosmetic perfection, artificial smoothness, isolated subject rendering, staged composition, clean cinematic perfection, independently lit subjects, composited appearance.

THE IMAGE MUST FEEL: accidental, tactile, documentary-like, optically imperfect, materially truthful, environmentally connected, emotionally intimate, physically occupied.

---

SCENE INTEGRATION RULES:
The subject and environment must behave as one connected physical system.
The subject must never appear: composited, floating, independently rendered, detached from surroundings, visually inserted into the environment.

All body positions must create realistic environmental consequences:
- weight compression, pressure against surfaces, posture compensation, fabric tension, contact deformation
- environmental shadow integration, reflected light interaction, moisture response, object displacement
- gravity response, balance shifts

The environment must visibly affect: skin, clothing, posture, movement, reflections, hair, textures, lighting behavior.
The environment must leave visible influence on the subject at all times.

---

SURFACE CONTACT LOGIC:
Every seated, crouched, leaning, grounded, or resting pose must create realistic tactile interaction with nearby surfaces.
Include: skin compression, bent fabric behavior, edge pressure, surface friction, uneven support, posture stabilization, gravity pull on clothing, contact-based wrinkles, realistic body balance.
Avoid mannequin-like positioning. The body must appear physically supported by the environment.

---

ENVIRONMENTAL FEEDBACK RULES:
Environmental elements must visibly influence the image.
Include interactions: reflected water light, atmospheric haze, ambient color bounce, humidity affecting hair, moisture affecting fabric, dust diffusion, environmental softness, wind interaction, temperature influence on skin shine, dirt accumulation near contact zones, imperfect reflections, surface wear interaction, background depth softened by atmosphere.
Avoid disconnected subjects unaffected by surroundings.

---

SKIN REALISM RULES:
NEVER describe skin generically. DO NOT write: "realistic skin", "detailed skin", "visible pores".
Instead describe specific biological and material phenomena:
- varying pore density across facial zones
- epidermal micro-relief
- skin translucency
- capillary flush beneath thin skin
- subsurface scattering
- vellus facial hair
- dehydration texture
- lip micro-cracks
- oil distribution variation
- pigmentation inconsistency
- fine asymmetry
- under-eye swelling
- compression wrinkles
- facial fatigue
- natural facial imbalance
- non-uniform skin reflection
- biological irregularity

---

CAMERA REALISM RULES:
All prompts must simulate real optical behavior. The result must feel photographed, not rendered.
Include physical camera phenomena: focus falloff, shallow focus inconsistencies, lens breathing, chromatic aberration, sensor bloom, highlight halation, motion softness, rolling shutter feel, exposure clipping, depth compression, environmental haze, handheld instability, accidental framing, imperfect focus acquisition, natural motion blur, analog film grain, edge softness.
AVOID: hyper-clean rendering, synthetic sharpness, unreal optical clarity, perfectly balanced framing.
The camera must observe the scene as one unified physical event. Avoid scene separation.

---

LIGHTING RULES:
Light must always originate from believable physical sources. NEVER use generic cinematic lighting.
Specify real sources: dirty window daylight, fluorescent ceiling light, warm restaurant practicals, candlelight, passing car headlights, sodium-vapor street lamps, bathroom mirror lighting, overcast sky bounce, reflected water light, phone screen spill, hallway tungsten light.
Describe how light physically interacts with: skin oil, pores, moisture, hair, fabric, dust, smoke, humidity, condensation, surrounding surfaces.
Lighting, atmosphere, depth, reflections, and imperfections must affect both subject and environment consistently.
The subject must never appear independently lit from the environment.

---

ENVIRONMENT RULES:
Environments must contain: wear, disorder, humidity, stains, scratches, texture variation, imperfect surfaces, accidental details, material aging, environmental noise, realistic depth layering, spatial obstruction, atmospheric softness.
AVOID clean cinematic environments, sterile composition.
The environment must feel physically lived in.

---

EMOTIONAL REALISM:
Emotion must emerge through: posture, muscle tension, stillness, fatigue, gesture, breathing, gaze behavior, eye refocus, micro-expression, delayed reaction, body imbalance.
NEVER describe emotion abstractly. DO NOT write: "she looks sad", "he feels nervous".
INSTEAD describe: tightened jaw, uneven breathing, delayed blinking, restless fingers, distant eye focus, shoulder tension, unstable posture, facial compression, subtle exhaustion.`;

const ARC_TRANSLATION: Record<string, string> = {
  opening:  `ARC — OPENING: exploratory framing, softer realism, environmental distance, observational atmosphere. Wider shot, subject partially absorbed by surroundings, soft natural light, low contrast.`,
  rising:   `ARC — RISING: tighter framing closing in, stronger contrast, increased movement, more environmental interaction, stronger texture visibility, heightened sensory detail.`,
  peak:     `ARC — PEAK: aggressive intimacy, close physical proximity, harsh directional light revealing every biological detail, sweat, fatigue, unstable framing, emotional pressure visible in musculature.`,
  turning:  `ARC — TURNING: asymmetrical compositions, mixed color temperatures in same frame, posture instability, emotional tension, environmental fragmentation.`,
  falling:  `ARC — FALLING: static compositions, drained atmosphere, reduced movement, emotional distance, weakened environmental energy, cooler color temperature.`,
  quiet:    `ARC — QUIET: intimate realism, soft natural light from single source, minimal movement, subtle environmental detail, calm physical stillness, micro-imperfection at close range.`,
};

const VIDEO_MOTION_RULES = `VIDEO MOTION RULES:
Movement must always obey physics.
Include: fabric inertia (cloth settles 0.3–0.5s after body stops), delayed cloth response on direction reversal, subtle breathing motion (shoulders lift 2–4mm per cycle), involuntary eye refocus micro-saccade, posture weight shifts redistributing gradually, facial muscle micro-movement, environmental interaction, natural balance correction, motion continuity, gravity-driven movement, environmental resistance.
AVOID: robotic motion, overdramatic gestures, abrupt movement changes, animation-like body behavior.
All movement must feel physically carried by body weight and momentum.`;

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
      max_tokens: 1200,
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
      max_tokens: 1200,
      system: `${MASTER_DOCTRINE}

${VIDEO_MOTION_RULES}

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
