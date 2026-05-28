import { claudeWithRetry } from "@/lib/generatePrompts";
import { SlotSpec } from "@/lib/archetypeDeck";
import { SceneBriefJson } from "@/lib/sceneBrief";
import { CarouselSlide } from "@/lib/carouselScript";

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
  carouselSlide?: CarouselSlide; // pre-planned arc role from carousel script
}

interface DoctrineSpec {
  photoStyleHeader: string;
  photoOutputRules: string;
  videoStyleHeader: string;
  videoOutputRules: string;
  photoMaxTokens: number;
  videoMaxTokens: number;
}

const CINEMATIC_PHOTO_HEADER = `You are writing a photo prompt for an AI image generator. Image generators are trained on real photo captions — plain visual language, NOT optical physics jargon or biological terminology.

WRITE LIKE: a photographer captioning their own photograph in 1–2 sentences.

DEFAULT IS NO CARRIED PROP (CRITICAL):
The DEFAULT state is empty hands, empty pockets visible, nothing carried, nothing held.
A prop appears in the frame ONLY when the slot's archetype explicitly demands it:
- archetype family 'detail' with archetype id 'hands_object' → one prop in hands
- archetype family 'subject' with archetype id 'interaction_object' → one prop being engaged with
- archetype family 'bts' with archetype id 'creator_process' or 'setup_shot' → relevant work prop
For ALL OTHER archetypes (wide_street, wide_interior, wide_nature, walking_solitude, sitting_window, over_shoulder, fabric_texture, emotional_close, walking_motion, gesture_motion, light_motion): NO PROP. Hands empty or in pockets.

ANATOMY ANCHOR (CRITICAL for close-up / face-cropped shots):
When the slot's archetype crops out the subject's face — hands_object, fabric_texture, certain emotional_close framings, any "from behind" shots — image generators lose gender context and default to generic or male-coded anatomy (hairy hands, thick male wrists, Adam's apple, beard shadow on jawline).

If the CHARACTER VISUAL BRIEF describes the subject as a woman, EVERY close-up or partial-body frame MUST explicitly include feminine anatomy markers from this list:
- HANDS visible (hands_object, any holding/touching): "feminine hands, slim fingers, smooth skin, no body hair, short neutral unpolished nails, no rings beyond what's in wardrobe"
- WRISTS / FOREARMS visible (sleeves rolled, reaching): "slim feminine wrist, smooth skin, no body hair"
- NECK / COLLARBONE visible (fabric_texture at collar, over_shoulder): "smooth feminine neck, no Adam's apple"
- JAWLINE close (emotional_close, profile): "soft feminine jawline, no facial hair, no beard shadow"
- SHOULDERS visible: "narrow feminine shoulders, soft musculature"

Skipping these markers in a face-cropped shot causes the image gen to invent generic/male anatomy. Mandatory for all woman-subject characters.

FOREGROUND PRIORITY (CRITICAL for shots with high-frequency textured environments):
The subject is ALWAYS the primary visual element — sharp, opaque, fully rendered, in the foreground.

When the environment includes repeating high-frequency textures (escalator treads, moving walkway grooves, brick walls, tile floors, fence patterns, perforated metal, parallel pipes), these textures are SECONDARY visual elements:
- Subject occupies the center 40–70% of the frame
- Subject is fully opaque IN FRONT of the texture — texture does NOT pass through or blur into the subject's body area
- Background texture is softened by depth of field, never matches subject sharpness
- No motion-blur smearing of the subject — only the background may have slight motion softness

Common failure: woman on escalator → image gen renders the escalator treads in sharp detail and dissolves the subject's torso/legs into vertical streaks. To prevent: explicitly state "subject in sharp foreground, escalator treads in soft background, no texture overlap with subject."

If a drift seed (Marseille Stranger) is active, the background figure stands at deep background (10m+ behind subject), NEVER on the same surface (escalator step, walkway) as the subject.

SKIN AND FACE REALISM (CRITICAL for close-up / portrait archetypes):
When the slot is emotional_close or any frame where the face fills more than ~30% of the frame, the prompt MUST specify natural realism, otherwise the gen defaults to "AI beauty" (over-smoothed skin, perfect symmetry, plastic appearance):
- "natural skin texture with visible pores"
- "subtle asymmetry — eyes / eyebrows / lip corners not perfectly aligned (real faces aren't symmetric)"
- "no airbrush, no plastic smoothing, no over-retouching, no soft-focus filter"
- "minor skin redness or subtle blemish acceptable (not flawless)"

These markers push the gen away from generic averaged beauty toward photo-realistic specificity.

TEXT IN FRAME (CRITICAL — image gens cannot render legible text):
Any text on objects (tickets, transit cards, signs, labels, logos, screens, business cards, receipts, fortune slips) will be produced as scribble/gibberish by current image generators. Pre-empt this by describing text as already-illegible — the artifact then reads as INTENTIONAL aging, not failure.

When a slot involves a text-bearing object:
- Ferry tickets / transit cards (Vivienne canon — from routes no longer running): "weathered ticket, ink faded with age, stamps worn smooth, text barely visible / illegible"
- Hand-held papers / cards in close-up: "edges worn, ink rubbed away at fold lines, text blurred or out of focus"
- Background signage / posters / station boards: "background signage soft and unreadable, slightly out of focus"
- Phone screens / electronic displays: NEVER show contents — "screen edge visible but turned away from camera, no display content"

NEVER instruct the gen to render specific text content. Forbidden phrases:
- "ticket reads 04:17"
- "sign says SHINAGAWA"
- "label reads ..."
- "card shows ..."

The gen cannot produce legible text. Asking it to produces nonsense scribble where the audience expects readability — breaks the realism. Pre-empt by always describing text as faded / illegible / cropped.

NO INVENTION RULE (CRITICAL — violation produces wrong images):
The frame may contain ONLY:
- garments listed in CHARACTER INVARIANTS wardrobe and scene brief wardrobe_lock (exhaustive — if not listed, not worn)
- environment details listed in scene brief location_constraints
- the Marseille Stranger ONLY when explicitly flagged via drift seed
- props from ALLOWED PROPS list — and ONLY if the archetype demands one (see above)

If the scene logically would benefit from an object that is not listed, you MUST leave it out. A sparser frame is correct; an invented object is wrong.

EXPLICITLY DO NOT ADD (common confabulation):
- plastic bags, paper bags, shopping bags, takeaway bags
- coffee cups, water bottles, food containers (UNLESS "espresso cup" or "wine glass" is in the ALLOWED PROPS list AND this slot's archetype is hands_object or interaction_object AND the spatial_setup contains a table or counter surface — if any of these three conditions is false, no drink in frame)
- phones, earbuds, watches, sunglasses (unless in wardrobe)
- jewelry beyond what's listed
- branded items, logos, shop signs, posters with text
- background people (the Marseille Stranger appears ONLY when drift seed says so)
- pets, vehicles, secondary characters
- ENVIRONMENT FURNITURE not listed in spatial_setup: benches, tables, chairs, market stalls, fruit crates / boxes, vendor counters, racks, displays, second rooms visible through doorways
- A different location than the one named in spatial_setup. All 8 slots happen at the SAME micro-location. If an archetype's framing suggests a different setting, choose an angle within the current setup instead of jumping to a new place.

PROP SPATIAL LOGIC (mandatory check before including any prop):
Ask: does the spatial_setup contain a surface where this prop would naturally sit or be held?
- Bathroom / sink area: NO drink props, NO book, NO sunglasses indoors — hands empty or touching sink/mirror edge only
- Bedroom: NO drink on bed, NO coffee mid-air — drink only if there is an explicit bedside table or desk in spatial_setup
- Standing on street / stairs / walking: NO props in hand unless archetype is hands_object AND prop is in allowed_props
When in doubt: empty hands.

ABSOLUTE BANS in language (image generator chokes on these):
- ethereal, dreamy, moody, atmospheric, evocative, soulful, magical, otherworldly
- cinematic grade, film look, vibe, aesthetic, energy
- gorgeous, stunning, breathtaking, beautiful, perfect, flawless
- optical physics: chromatic aberration, subsurface scattering, lens breathing, focus breathing
- biological/medical: saccadic drift, ischemic blanching, mydriasis, capillary flush
- abstract measurements: 0.2Hz, ±2mm, 1–3%, Hz, μ
- philosophical: "caught existing", "observational truth"
- emotional abstraction: "she feels", "her soul"`;

const CINEMATIC_PHOTO_OUTPUT = `OUTPUT RULES:

Write 60–100 words. Single paragraph OR comma-separated tags — whichever reads more naturally for a photo caption. Plain visual language only.

Cover in this order:
1. Subject — short physical description (age, hair, build) from the visual brief. If THIS slot is a close-up / face-cropped archetype (hands_object, fabric_texture, emotional_close, or any frame that doesn't show the full face), ADD feminine anatomy markers from the ANATOMY ANCHOR rules at the front of the description (e.g. "feminine hands, slim fingers, smooth skin, no body hair" for hands_object).
2. Wardrobe — REPEAT the scene brief wardrobe_lock verbatim, garment by garment. Do not paraphrase. Do not add unlisted items.
3. Action — what she is doing right now (one verb in present participle). DEFAULT VERBS WITHOUT PROPS: walking, standing, looking, leaning, descending, riding (escalator), pausing, turning. Use a prop-action verb (holding, examining, peeling, reading) ONLY if this slot's archetype is hands_object, interaction_object, creator_process, or setup_shot. Otherwise: empty hands, hands in pockets, or hands at sides.
4. Setting — location respecting the scene brief SPATIAL SETUP exactly. Do NOT invent geometry (no walls where there are stairs, no escalators going into walls, no impossible perspectives). Camera position must be one that physically exists in the described setup.
5. Light — one source + direction + indoor/outdoor + rough time (e.g. "fluorescent overhead, late afternoon, indoor")
6. Camera — lens in mm, aperture, shot type (e.g. "50mm f/2.8, medium shot, eye level")
7. Quality tags — pick 3: photorealistic, natural skin texture, candid photo, real photograph, 35mm film, documentary photography
8. Frame contains — explicit closure: "Frame contains: [list everything visible from steps 1-4, including 'empty hands' or specific prop if applicable]. Nothing else in frame."

End on its own line: "Signature: [one palette word] / [one lens word] / [one motion word]."
(e.g. "Signature: charcoal / 50mm / still.")

OUTPUT: First line "Model: Soul 2 🖼️ Image Prompt", then the prompt, then the signature line.`;

const CINEMATIC_VIDEO_HEADER = `You are writing a video prompt for an AI video generator (Seedance 2.0). Video generators understand director's notes describing concrete motion — NOT optical physics jargon, biological terminology, or screenwriting Act/Scene language.

Words the model does not recognize produce broken motion, wrong framing, or static frames.

WRITE LIKE: a director writing a 4-line shot description to their DOP.

ABSOLUTE BANS:
- ethereal, dreamy, moody, atmospheric, evocative, soulful, magical
- cinematic grade, film look, vibe, aesthetic
- gorgeous, stunning, breathtaking, beautiful, perfect
- optical physics terms (chromatic aberration, focus breathing, lens breathing, rolling shutter skew specifics)
- biological/medical terms (mydriasis, saccadic drift, capillary flush)
- abstract measurements (0.2Hz, ±2mm, 1–3%, Hz, μ)
- screenwriting jargon: Act I, Scene 2, EXT., INT., FADE IN
- emotional abstraction: "she feels", "her soul"`;

const CINEMATIC_VIDEO_OUTPUT = `OUTPUT RULES:

Write 70–110 words. Single paragraph in plain motion vocabulary.

Cover in this order:
1. Hook (first 0–3s) — the strongest visual moment that stops the scroll (concrete, e.g. "she turns her head toward the camera as fluorescent light flickers")
2. Camera movement — one of: static / slow pan / slow dolly in / slow dolly out / handheld follow / orbit
3. Starting distance — e.g. "from 1.5m"
4. Subject action — mid-motion verb (mid-turn, mid-step, mid-exhale, hand mid-raise — never start or end)
5. Setting — short location from scene brief
6. Light — source, direction, whether it shifts during the shot
7. One physical element in motion — hair, fabric, steam, shadow edge, reflection
8. Loop logic — one sentence: how the motion returns to start
9. Tech — "Duration: 7s, 24fps, 9:16"

End on its own line: "Signature: [palette word] / [lens word] / [motion word]."

OUTPUT: First line "Model: Seedance 2.0 🎬 Video Prompt", then the prompt, then the signature line.`;

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
    photoStyleHeader: CINEMATIC_PHOTO_HEADER,
    photoOutputRules: CINEMATIC_PHOTO_OUTPUT,
    videoStyleHeader: CINEMATIC_VIDEO_HEADER,
    videoOutputRules: CINEMATIC_VIDEO_OUTPUT,
    photoMaxTokens: 500,
    videoMaxTokens: 500,
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

  const lines: string[] = [];
  const wardrobe = (sacred as { wardrobe_anchors?: unknown }).wardrobe_anchors;
  if (Array.isArray(wardrobe) && wardrobe.length > 0) {
    lines.push(`- Wardrobe ANCHORS (always present, never substituted): ${wardrobe.map(String).join("; ")}`);
  }
  const props = (sacred as { props?: unknown }).props;
  if (Array.isArray(props) && props.length > 0) {
    lines.push(`- Allowed props (use ONLY these; no other carry-objects may appear): ${props.map(String).join("; ")}`);
  }
  const env = (sacred as { recurring_environment?: unknown }).recurring_environment;
  if (Array.isArray(env) && env.length > 0) {
    lines.push(`- Recurring environments: ${env.map(String).join("; ")}`);
  }
  const stranger = (sacred as { marseille_stranger?: { prompt_injection?: string } }).marseille_stranger;
  if (stranger?.prompt_injection) {
    lines.push(`- Background figure (ONLY if drift seed recurring_stranger is active in this batch — otherwise NO background figure): ${stranger.prompt_injection}`);
  }
  const anatomy = (sacred as { anatomy_anchors?: Record<string, string> }).anatomy_anchors;
  if (anatomy && typeof anatomy === "object" && Object.keys(anatomy).length > 0) {
    const parts = Object.entries(anatomy).map(([k, v]) => `${k}: ${v}`);
    lines.push(`- Anatomy anchors (mandatory in close-up / face-cropped frames): ${parts.join("; ")}`);
  }
  const never = (sacred as { never_show?: unknown }).never_show;
  if (Array.isArray(never) && never.length > 0) {
    lines.push(`- ABSOLUTELY NEVER SHOW: ${never.map(String).join("; ")}`);
  }

  if (lines.length === 0) return "";
  return `\nCHARACTER INVARIANTS (mandatory — enumerative, not suggestive):
${lines.join("\n")}\n`;
}

function commonBody(args: BuildArgs): string {
  const visualRules = args.sceneBriefJson.visual_rules.map((r) => `- ${r}`).join("\n");
  const constraints = args.sceneBriefJson.location_constraints.map((c) => `- ${c}`).join("\n");
  const allowedProps = (args.sceneBriefJson.allowed_props ?? []).map((p) => `- ${p}`).join("\n");
  const spatial = args.sceneBriefJson.spatial_setup;

  // Detect whether this slot's archetype is one that justifies a visible prop
  const archetypeAllowsProp =
    args.archetypeId === "hands_object" ||
    args.archetypeId === "interaction_object" ||
    args.archetypeId === "creator_process" ||
    args.archetypeId === "setup_shot";

  return `SCENE CONTINUITY LOCK (same for all assets in today's batch — use as concrete reference, NOT as language to copy):
${args.sceneBriefDoctrine}

STRUCTURED LOCK PARAMETERS (translate these into plain visual language):
- Wardrobe lock (EXHAUSTIVE — these and only these garments): ${args.sceneBriefJson.wardrobe_lock}
- Lighting state: ${args.sceneBriefJson.lighting_state}
- Time of day: ${args.sceneBriefJson.time_of_day}
- Weather implied: ${args.sceneBriefJson.weather_implied}
- Color palette: ${args.sceneBriefJson.color_palette.join(", ")}

${spatial ? `SPATIAL SETUP (single shared 3D layout — every slot's camera position must respect this; do NOT invent new geometry):
${spatial}
` : ""}
ALLOWED PROPS (OPTIONAL — use ONLY if this slot's archetype demands one; otherwise DEFAULT IS NO PROP, empty hands):
${allowedProps || "- (none defined)"}
${archetypeAllowsProp
    ? `THIS SLOT'S ARCHETYPE (${args.archetypeId}) DEMANDS a prop — choose exactly one from the list above.`
    : `THIS SLOT'S ARCHETYPE (${args.archetypeId}) does NOT demand a prop — leave hands empty, do not include any object from the props list.`}

VISUAL RULES (must be obeyed, but never write them verbatim into the prompt):
${visualRules}

LOCATION CONSTRAINTS (geometric — respect spatial setup):
${constraints}

CHARACTER VISUAL BRIEF: ${args.character.visual_brief}
${args.character.soul_id ? `SOUL ID: ${args.character.soul_id}` : ""}
${sacredBlock(args.character.sacred_details)}

SLOT: ${args.slot.slot}${args.slot.sequence_index ? ` (carousel position ${args.slot.sequence_index} of 5)` : ""}
SLOT FRAMING: ${args.slot.framing}
${args.carouselSlide ? `
CAROUSEL ARC ROLE — slide ${args.carouselSlide.slide} of 5 (${args.carouselSlide.role.toUpperCase()}):
Visual intention: ${args.carouselSlide.visual_intention}
Align composition, framing, and subject action to serve this arc position in the 5-slide story. The overlay text for this slide is already set — do NOT add a Hook: line.
` : ""}
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
  return `${spec.videoStyleHeader}

${commonBody(args)}

${spec.videoOutputRules}`;
}

const CAROUSEL_SLOTS = new Set(["carousel_1", "carousel_2", "carousel_3", "carousel_4", "carousel_5"]);

const HOOK_INSTRUCTION = `

HOOK TEXT (carousel overlay — optional):
After the Signature line, add one optional line in this exact format:
Hook: [2 to 5 words, lowercase, no punctuation]

The hook is a short text overlay the photographer places on the finished photo. Match the slot's framing and today's tier:

lifestyle_travel tier:
- carousel_1 (wide/establishing): location or arrival energy — "rome at noon", "last light here", "nobody's arrived yet", "still in lisbon"
- carousel_2 (mid, subject): presence — "she stays longer", "still moving", "in transit"
- carousel_3 (texture/detail): material or sensory — "silk season", "this texture", "linen and light", "the weight of it"
- carousel_4 (reverse/over-shoulder): perspective — "from here", "what she sees", "the other side", "looking back"
- carousel_5 (emotional close): most impactful — "don't look away", "she knows", "impossible not to", "stay"

intimate_aesthetic tier:
- carousel_1: arrival/setting the scene — "checked in", "do not disturb", "south-facing room"
- carousel_2: slow morning — "unhurried", "still here", "room service"
- carousel_3 (fabric/skin detail): material and body — "the silk stays", "skin first", "this texture"
- carousel_4: perspective shift — "from behind", "what you'd see", "if you were here"
- carousel_5 (emotional close): most daring — "you wouldn't", "don't pretend", "she always wins", "stay longer"

Omit the Hook line entirely if no strong one-liner emerges naturally from this frame. Never force it.`;

export interface SlotPromptResult {
  prompt: string;
  visualSignature: { palette: string; lens: string; movement: string } | null;
  hookText: string | null;
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

function extractHookText(text: string): string | null {
  const match = text.match(/^Hook:\s*(.+)$/im);
  if (!match) return null;
  return match[1].trim().toLowerCase().replace(/[.!?]+$/, "");
}

export async function generateSlotPrompt(args: BuildArgs): Promise<SlotPromptResult> {
  const spec = DOCTRINES[args.doctrine];
  const isCarouselPhoto = CAROUSEL_SLOTS.has(args.slot.slot) && args.slot.type === "photo";

  // If carousel script provided, arc role is already injected in commonBody — no hook generation needed.
  // If no script, fall back to per-slot HOOK_INSTRUCTION.
  const extraInstruction = (isCarouselPhoto && !args.carouselSlide) ? HOOK_INSTRUCTION : "";
  const baseSystem = args.slot.type === "video" ? buildVideoSystem(args) : buildPhotoSystem(args);
  const systemPrompt = extraInstruction ? `${baseSystem}${extraInstruction}` : baseSystem;

  const maxTokens = args.slot.type === "video" ? spec.videoMaxTokens : spec.photoMaxTokens;
  const extraTokens = isCarouselPhoto && !args.carouselSlide ? 30 : 0;

  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens + extraTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: `Generate the ${args.slot.slot} prompt now.` }],
  });

  const text = (msg.content[0] as { type: string; text: string }).text;

  // Hook text: use pre-planned from carousel script, or extract from response (fallback)
  let hookText: string | null = null;
  if (isCarouselPhoto) {
    hookText = args.carouselSlide?.overlay_text ?? extractHookText(text);
  }

  return {
    prompt: text,
    visualSignature: extractSignature(text),
    hookText,
  };
}
