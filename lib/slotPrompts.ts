import {
  MASTER_DOCTRINE,
  SENSOR_REALISM,
  ARC_TRANSLATION,
  VIDEO_RULES,
  claudeWithRetry,
} from "@/lib/generatePrompts";
import { SlotSpec } from "@/lib/archetypeDeck";
import { SceneBriefJson } from "@/lib/sceneBrief";

export type DoctrineKey = "cinematic" | "instagram" | "editorial" | "deepseek";

interface BuildArgs {
  doctrine: DoctrineKey;
  slot: SlotSpec;
  archetypeId: string;
  archetypeGuidance: string;
  sceneBriefJson: SceneBriefJson;
  sceneBriefDoctrine: string;
  character: {
    visual_brief: string;
    sacred_details: Record<string, unknown> | null;
    soul_id: string | null;
  };
  arcPosition: string;
}

interface DoctrineSpec {
  photoStyleHeader: string;
  photoOutputRules: string;
  videoStyleHeader: string;
  videoOutputRules: string;
  photoMaxTokens: number;
  videoMaxTokens: number;
}

const CINEMATIC_PHOTO_OUTPUT = `OUTPUT RULES:
Translate the scene continuity lock + slot framing + archetype into a single image prompt. The viewer must feel this image was captured in the same minute as the other 4 carousel frames — same light, same wardrobe, same location, different angle and proximity.

Write a SINGLE PARAGRAPH of 120–180 words. No numbered lists. No abstract measurements. No forbidden/negative instructions in the output.

The paragraph must contain — in natural flowing prose:
- Shot type and camera lens consistent with the archetype
- Where the subject is in the locked location and what surrounds her physically
- The locked wardrobe — how the fabric sits in this specific framing
- Her exact physical state for this archetype: posture, gesture caught mid-motion, gaze direction
- The locked light: where it hits, what it reveals in this composition
- One physical imperfection visible at this proximity
- One subtle lens artifact (soft edge falloff, slight vignette, or focus breathing — pick one)

End with: "Signature: [palette] / [lens character] / [movement]."

Write what a camera sees. Not what a poet feels.

OUTPUT: Start with "Model: Soul 2 🖼️ Image Prompt" then the paragraph including the signature tag. Nothing else.`;

const CINEMATIC_VIDEO_OUTPUT = `OUTPUT RULES:
Translate the scene continuity lock + slot framing + archetype into a single video prompt.

Write a SINGLE PARAGRAPH of 130–200 words. No numbered lists. No abstract measurements. No forbidden/negative instructions in the output.

The paragraph must contain — in natural flowing prose, in shot order:
- The hook (first 0–3s): the strongest visual moment, what stops the scroll
- Camera movement type and starting distance
- The locked location and what the environment looks like in motion
- The locked wardrobe — how the fabric moves under the camera's motion
- Her primary action: always mid-motion (mid-turn, mid-exhale, hand mid-raise — never start or end of gesture)
- The locked light: how it shifts during the shot, if at all
- One physical element in motion: hair, fabric, steam, shadow edge
- Loop logic: what brings the motion back to start naturally
- Duration, frame rate, aspect ratio (e.g. "7 seconds, 24fps, 9:16")

End with: "Signature: [palette] / [lens character] / [movement]."

Write what a camera operator executes. Not what a director imagines.

OUTPUT: Start with "Model: Seedance 2.0 🎬 Video Prompt" then the paragraph including the signature tag. Nothing else.`;

const INSTAGRAM_PHOTO_HEADER = `You are generating a photorealistic image prompt in the style of authentic social media photography.

PHOTO STYLE: authentic selfie / candid / lifestyle photography
LIGHTING: natural or phone flash — describe briefly
LANGUAGE: Mood and expression words are allowed (suggestive, cheeky, confident, playful). Direct eye contact is allowed. The image should feel like it was captured spontaneously in real life.

This doctrine OVERRIDES the cinematic anti-glamour filter. Glamour, posing, intentional sexiness, and beauty-campaign energy ARE acceptable here.

AVOID: cinematic doctrine language, technical optical specifications, long flowing paragraphs.`;

const INSTAGRAM_PHOTO_OUTPUT = `OUTPUT RULES:
Generate a SHORT, TAG-BASED image prompt (60–120 words max) in this exact structure:

- Start with quality/device tags: "Ultra realistic, [device — iPhone 15 Pro / Fujifilm X100V / etc], [shot type]"
- List subject attributes directly: physical features, hair, expression, pose — comma-separated tags
- List clothing as direct tags: specific garments, fit, coverage, fabric
- Setting as atmosphere tag: location, lighting mood
- End with quality reinforcement tags: "natural skin texture, real photo, 4K, social media aesthetic"
- End with: "Signature: [palette] / [lens character] / [movement]."

Slot framing still applies — carousel_1 stays a wide establishing shot, carousel_5 stays an emotional close — but execute it in the IG-native tag-based grammar, not as cinematic prose.

OUTPUT: Start with "Model: Soul 2 🖼️ Image Prompt" then the tag-based prompt including the signature tag. Nothing else.`;

const INSTAGRAM_VIDEO_HEADER = `You are generating a short-form video prompt in the style of authentic social media content.

STYLE: authentic, candid, social media lifestyle. Selfie-camera or held-by-friend energy. Direct address allowed.
MOVEMENT: subtle, natural — breathing, micro-adjustment, soft gesture, slow turn-to-camera.

This doctrine OVERRIDES the cinematic anti-glamour filter. Eye contact with camera and playful expression are encouraged.

AVOID: cinematic doctrine language, technical camera specs, complex action sequences.`;

const INSTAGRAM_VIDEO_OUTPUT = `OUTPUT RULES:
Generate a SHORT, DIRECT video prompt (60–120 words max) in this structure:

- Shot type + device: "handheld iPhone, [shot description], 9:16"
- Hook (first 0–3s): what stops the scroll — strongest motion or direct look
- Subject action: simple, natural micro-movement (hair, breath, slight turn, half-smile)
- Setting + lighting: 1–2 words
- Loop logic: describe the simple reset moment
- Duration: 5–9 seconds, 9:16
- End with: "Signature: [palette] / [lens character] / [movement]."

OUTPUT: Start with "Model: Seedance 2.0 🎬 Video Prompt" then the prompt including the signature tag. Nothing else.`;

const EDITORIAL_PHOTO_HEADER = `You are an elite luxury fashion art director generating an ultra-photorealistic editorial beauty image prompt.

CORE DOCTRINE: The subject must always feel like a top international fashion model photographed for a luxury editorial campaign — never like a random realistic person from a film scene.

PRIORITY ORDER:
1. Facial beauty and bone structure — sculpted cheekbones, refined jawline, symmetrical facial harmony, expressive eyes, natural full lips, striking beauty, effortless elegance
2. Skin realism — pores, micro skin texture, subsurface scattering, natural facial asymmetry, ultra-detailed skin rendering
3. Cinematic luxury lighting — golden hour / soft Mediterranean overcast / cinematic window light / diffused luxury lighting / soft shadows
4. Fashion/editorial atmosphere — couture-inspired styling, luxury fabrics, silk, tailored silhouettes, refined accessories, minimalist luxury jewelry
5. Elegant composition + premium styling + cinematic realism

HAIR: soft, realistic, detailed strand-by-strand, naturally volumized, cinematic in movement and light
ENVIRONMENT: Monaco terraces, Mediterranean architecture, Paris balconies, luxury rooftops, elegant hotels, cinematic European streets, warm textured stone, refined interiors
AVOID: dirty realism, damaged environments, gritty urban decay, excessive storytelling props

CAMERA: Sony A7R IV, 85mm f/1.4, shallow depth of field, cinematic framing, soft bokeh, realistic lens rendering, cinematic film grain
COLOR SCIENCE: Vogue Italia color grading, muted cinematic tones, luxury neutral palette, soft highlight rolloff

SAFE FASHION RULES: Maintain high-fashion elegance. Avoid explicit sexual wording, fetish language, explicit nudity. Sensuality must remain subtle, cinematic, and editorial.

This doctrine OVERRIDES the cinematic anti-glamour filter. Editorial beauty IS the goal.`;

const EDITORIAL_PHOTO_OUTPUT = `OUTPUT RULES:
Slot framing still applies — execute the carousel/reel/story slot in editorial fashion grammar.

Write a SINGLE polished editorial PARAGRAPH (110–150 words), optimized for premium AI image generation.

End with: "Signature: [palette] / [lens character] / [movement]."

OUTPUT: Start with "Model: Soul 2 🖼️ Image Prompt" then the paragraph including the signature tag. Nothing else.`;

const EDITORIAL_VIDEO_HEADER = `You are an elite luxury fashion art director generating an ultra-photorealistic editorial beauty video prompt.

CORE DOCTRINE: The subject must always feel like a top international fashion model in a luxury editorial — never a film character or street photography subject.

PRIORITY ORDER:
1. Facial beauty and bone structure
2. Skin realism in motion — subsurface scattering, micro skin texture
3. Cinematic luxury lighting — golden hour / Mediterranean overcast / soft window light
4. Editorial fashion atmosphere — couture styling, silk movement, refined accessories
5. Elegant camera movement
6. Premium visual atmosphere

VIDEO REQUIREMENTS:
- Camera: Sony A7R IV, 85mm f/1.4, shallow DOF, soft bokeh
- Movement: slow cinematic dolly or elegant tracking shot — never handheld shake
- Subject motion: one subtle elegant action — slow turn, hair catching light, lifting gaze, adjusting silk
- One physics element: silk flowing, hair lifting in breeze, golden light shift across skin, reflection shimmering
- Story arc: poised stillness → one graceful movement → refined resolve

COLOR SCIENCE: Vogue Italia color grading, muted cinematic tones, luxury neutral palette, soft highlight rolloff
DO NOT generate: documentary feel, indie film realism, gritty atmosphere, emotionally heavy scenes

SAFE FASHION RULES: High-fashion elegance only. Sensuality through composition and light — never explicit action.

This doctrine OVERRIDES the cinematic anti-glamour filter.`;

const EDITORIAL_VIDEO_OUTPUT = `OUTPUT RULES:
Slot framing still applies. Write a SINGLE polished editorial PARAGRAPH (110–140 words), 24fps, 9:16 vertical, 4–6 seconds.

End with: "Signature: [palette] / [lens character] / [movement]."

OUTPUT: Start with "Model: Seedance 2.0 🎬 Video Prompt" then the paragraph including the signature tag. Nothing else.`;

const DEEPSEEK_PHOTO_HEADER = `You are generating a photorealistic image prompt using the Deepseek doctrine — a structured, physics-first approach focused on capturing a single mid-action moment.

PHYSICS-FIRST ORDER (mandatory):
1. SHOT TYPE + FRAMING — static / medium / close-up / wide — what is visible
2. LOCATION + TIME — specific place, time of day, weather, light state
3. SUBJECT + ACTION — who, wearing what, doing what — always mid-action (mid-yawn, mid-turn, mid-drink, mid-laugh, mid-exhale)
4. PHYSICS DETAIL — one visible physical element: steam, hair movement, wet fabric, dust, shadow, condensation, breath vapor
5. LIGHT STATE — exact light quality
6. EMOTIONAL SIGNATURE — one-word mood + physical evidence (tired: slow blink, heavy lid / curious: slight head tilt, forward lean)

FORBIDDEN: beautiful / perfect / dreamy / ethereal / smooth skin / posed / studio lighting / generic beauty
REQUIRED: skin texture, physical imperfection, mid-action not start or end, real light source`;

const DEEPSEEK_PHOTO_OUTPUT = `OUTPUT RULES:
Slot framing still applies — but resolve it as a single mid-action moment in flowing prose.

Write 60–100 words. No lists, no numbering. Flowing prose. Cover the 6 physics elements in natural narrative order.

End with: "Signature: [palette] / [lens character] / [movement]."

OUTPUT: Start with "Model: Soul 2 🖼️ Image Prompt" then the prose including the signature tag. Nothing else.`;

const DEEPSEEK_VIDEO_HEADER = `You are generating a video prompt using the Deepseek doctrine — 7 mandatory elements, story arc, physics-first.

7 MANDATORY ELEMENTS (must all be present, woven as prose):
1. SHOT TYPE — slow dolly-in / tracking / static / orbit / zoom-out / push-in / following shot
2. CAMERA MOVEMENT — handheld micro-shake / breathing motion / smooth follow / side-to-side sway
3. SUBJECT MOVEMENT — natural mid-action only: mid-yawn / mid-drink / turns head / laughs / exhales / writes / pauses mid-step
4. PHYSICS ELEMENT — one: steam rising / hair in breeze / wet fabric / dust particles / shadow movement / breath vapor / rain on glass
5. LIGHTING — state + optional change
6. STORY ARC — start → development → micro-resolution
7. TECHNICAL — duration 4–6 seconds, 24fps, 9:16 vertical, seamless loop yes/no

FORBIDDEN: kitsch / perfect skin / studio lighting / generic beauty / dreamy / ethereal / beautiful
REQUIRED: texture (pores, frizz, creases, sweat) / mid-action not posed / specific real light / physical imperfection`;

const DEEPSEEK_VIDEO_OUTPUT = `OUTPUT RULES:
Slot framing still applies — but the output must cover all 7 elements in natural narrative prose order (no lists, no numbering).

Write 80–120 words.

End with: "Signature: [palette] / [lens character] / [movement]."

OUTPUT: Start with "Model: Seedance 2.0 🎬 Video Prompt" then the prose including the signature tag. Nothing else.`;

const DOCTRINES: Record<DoctrineKey, DoctrineSpec> = {
  cinematic: {
    photoStyleHeader: `${MASTER_DOCTRINE}\n\n${SENSOR_REALISM}`,
    photoOutputRules: CINEMATIC_PHOTO_OUTPUT,
    videoStyleHeader: `${MASTER_DOCTRINE}\n\n${VIDEO_RULES}\n\n${SENSOR_REALISM}`,
    videoOutputRules: CINEMATIC_VIDEO_OUTPUT,
    photoMaxTokens: 800,
    videoMaxTokens: 900,
  },
  instagram: {
    photoStyleHeader: INSTAGRAM_PHOTO_HEADER,
    photoOutputRules: INSTAGRAM_PHOTO_OUTPUT,
    videoStyleHeader: INSTAGRAM_VIDEO_HEADER,
    videoOutputRules: INSTAGRAM_VIDEO_OUTPUT,
    photoMaxTokens: 500,
    videoMaxTokens: 500,
  },
  editorial: {
    photoStyleHeader: EDITORIAL_PHOTO_HEADER,
    photoOutputRules: EDITORIAL_PHOTO_OUTPUT,
    videoStyleHeader: EDITORIAL_VIDEO_HEADER,
    videoOutputRules: EDITORIAL_VIDEO_OUTPUT,
    photoMaxTokens: 700,
    videoMaxTokens: 700,
  },
  deepseek: {
    photoStyleHeader: DEEPSEEK_PHOTO_HEADER,
    photoOutputRules: DEEPSEEK_PHOTO_OUTPUT,
    videoStyleHeader: DEEPSEEK_VIDEO_HEADER,
    videoOutputRules: DEEPSEEK_VIDEO_OUTPUT,
    photoMaxTokens: 600,
    videoMaxTokens: 700,
  },
};

function sacredBlock(sacred: Record<string, unknown> | null): string {
  if (!sacred || Object.keys(sacred).length === 0) return "";
  return `\nSACRED DETAILS (MANDATORY — present in every frame, never altered):
${JSON.stringify(sacred, null, 2)}\n`;
}

function commonBody(args: BuildArgs): string {
  const arcNote = ARC_TRANSLATION[args.arcPosition] ?? ARC_TRANSLATION.quiet;
  const visualRules = args.sceneBriefJson.visual_rules.map((r) => `- ${r}`).join("\n");
  const constraints = args.sceneBriefJson.location_constraints.map((c) => `- ${c}`).join("\n");

  return `${arcNote}

SCENE CONTINUITY LOCK (inherited from today's scene brief — every other asset in this batch obeys the same lock):
${args.sceneBriefDoctrine}

STRUCTURED LOCK PARAMETERS:
- Camera language: ${args.sceneBriefJson.camera_language}
- Lighting state: ${args.sceneBriefJson.lighting_state}
- Time of day: ${args.sceneBriefJson.time_of_day}
- Weather implied: ${args.sceneBriefJson.weather_implied}
- Wardrobe lock: ${args.sceneBriefJson.wardrobe_lock}
- Color palette: ${args.sceneBriefJson.color_palette.join(", ")}

VISUAL RULES (mandatory):
${visualRules}

LOCATION CONSTRAINTS:
${constraints}

CHARACTER VISUAL BRIEF: ${args.character.visual_brief}
SOUL ID: ${args.character.soul_id ?? "derive physical consistency from visual brief"}
${sacredBlock(args.character.sacred_details)}

SLOT: ${args.slot.slot}${args.slot.sequence_index ? ` (carousel position ${args.slot.sequence_index} of 5)` : ""}
SLOT FRAMING: ${args.slot.framing}

ARCHETYPE: ${args.archetypeId}
ARCHETYPE GUIDANCE: ${args.archetypeGuidance}`;
}

function buildPhotoSystem(args: BuildArgs): string {
  const spec = DOCTRINES[args.doctrine];
  return `${spec.photoStyleHeader}

${commonBody(args)}

${spec.photoOutputRules}`;
}

function buildVideoSystem(args: BuildArgs): string {
  const spec = DOCTRINES[args.doctrine];
  const hookNote = `HOOK REQUIREMENT (critical for short-form):
The first 0–3 seconds must be a scroll-stopper. Front-load the strongest motion, contrast, or composition. The viewer decides to keep watching or scroll within 1 second.`;
  return `${spec.videoStyleHeader}

${commonBody(args)}

${hookNote}

${spec.videoOutputRules}`;
}

export interface SlotPromptResult {
  prompt: string;
  visualSignature: { palette: string; lens: string; movement: string } | null;
}

function extractSignature(text: string): SlotPromptResult["visualSignature"] {
  const match = text.match(/Signature:\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*([^.\n]+)/i);
  if (!match) return null;
  return {
    palette: match[1].trim(),
    lens: match[2].trim(),
    movement: match[3].trim(),
  };
}

export async function generateSlotPrompt(args: BuildArgs): Promise<SlotPromptResult> {
  const spec = DOCTRINES[args.doctrine];
  const systemPrompt = args.slot.type === "video" ? buildVideoSystem(args) : buildPhotoSystem(args);
  const maxTokens = args.slot.type === "video" ? spec.videoMaxTokens : spec.photoMaxTokens;

  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: `Generate the ${args.slot.slot} prompt now.` }],
  });

  const text = (msg.content[0] as { type: string; text: string }).text;
  return { prompt: text, visualSignature: extractSignature(text) };
}
