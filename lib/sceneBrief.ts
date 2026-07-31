import { claudeWithRetry } from "@/lib/generatePrompts";
import { StylingProfile } from "@/lib/stylingDeck";
import { ensureEnvironmentAnchored } from "@/lib/shotDirection";

export interface SceneBriefJson {
  camera_language: string;
  color_palette: string[];
  visual_rules: string[];
  location_constraints: string[];
  spatial_setup: string;
  wardrobe_lock: string;
  // Optional: only present when an animal appears in the day's scene. Older briefs
  // stored before this field existed simply omit it.
  pet_lock?: string;
  allowed_props: string[];
  lighting_state: string;
  time_of_day: string;
  weather_implied: string;
}

export interface SceneBriefResult {
  json: SceneBriefJson;
  doctrine: string;
}

interface GenerateArgs {
  storyScene: {
    location: string;
    mood: string;
    narrative: string;
    arc_position: string;
    emotional_beat: string | null;
    scene: Record<string, unknown> | null;
    tier: string | null;
    drift_seeds: Array<{ kind: string; detail?: string }> | null;
  };
  character: {
    name: string;
    visual_brief: string;
    sacred_details: Record<string, unknown> | null;
    visual_tone: string | null;
    styling_note: string | null;
  };
  recentBriefs?: Array<{ wardrobe_lock: string; allowed_props: string[] }>;
  stylingProfile?: StylingProfile;
  lifeNote?: string; // life_layer: short mood/energy continuity note (optional, never overrides tier)
  situationContext?: string; // open_life_generation_v1: today's situation summary (sibling to lifeNote, never replaces it)
  activityContext?: { activity: string; continuityPhase: string }; // sensual_visual_language_v1: passed through to buildStylingRule's ACTIVITY/PHASE WINS rule
}

function driftRulesForBrief(seeds: Array<{ kind: string; detail?: string }> | null): string[] {
  if (!seeds || seeds.length === 0) return [];
  const rules: string[] = [];
  for (const s of seeds) {
    if (s.kind === "timestamp_mismatch") {
      rules.push(
        `Timestamp contradiction is in effect — the caption will say ${s.detail ?? "04:17"} while the scene is clear daylight. Do NOT reconcile this in any prompt. Light it as the time of day suggests, not as the caption suggests.`
      );
    } else if (s.kind === "impossible_weather_memory") {
      rules.push(
        "Impossible weather memory is in effect — narrative references rain that didn't happen. Do not show wet ground or wet hair in any frame. The contradiction lives in the text, not in the image."
      );
    }
  }
  return rules;
}

// The styling profile is picked from the tier and the day's moment_family, which can
// land on a category the day's actual location cannot carry — a vacation_beach_water
// day whose story resolved to a gym pulled a beach_club profile, and the old rule
// ("the styling category must be preserved") locked a bikini onto a weights floor.
// The location wins now: the profile keeps its character (palette, fabrics, silhouette,
// hair, jewellery, makeup) while the garments become what a real person would wear there.
// Exported for tests.
export function buildStylingRule(
  profile: { label: string; vibe: string; outfit: string; hair: string; jewelry: string; makeup: string },
  location: string,
  activityContext?: { activity: string; continuityPhase: string }
): string {
  return `\nSTYLING PROFILE FOR TODAY — MANDATORY OVERRIDE (replaces wardrobe_anchors for this batch):
Label: ${profile.label}
Vibe: ${profile.vibe}
Outfit: ${profile.outfit}
Hair: ${profile.hair}
Jewelry: ${profile.jewelry}
Makeup: ${profile.makeup}

RULE: Use this profile as the wardrobe_lock, but THE LOCATION WINS. Dress her the way this
person would actually be dressed at ${location} at that time of day.
RULE: If the profile's category would be implausible in that place — beach club attire in a
gym, a couture gown in a kitchen, swimwear on a city street — do NOT force it. Keep the
profile's CHARACTER (its colour palette, fabrics, silhouette, hair, jewellery and makeup) and
swap the garments for ones that belong in this location. Never lock an outfit a real person
would not wear there; a believable everyday look always beats a styled-but-wrong one.
RULE: Adapting to the location does NOT mean falling back to the generic silk slip dress +
linen blazer from wardrobe_anchors. The slip dress is NOT today's look — stay recognisably
within today's profile.${activityContext ? `
RULE: the profile must also make sense for TODAY'S ACTIVITY (${activityContext.activity}) and moment (${activityContext.continuityPhase}) — adapt it the same way as the location rule above (keep palette/fabric/silhouette, swap the garment) if the category is implausible for what she is actually doing right now; never force a mismatched outfit just to hit a higher energy level.` : ""}
Add the character constants from sacred_details (gold chain, earrings) as always-present accessories.`;
}

function safeJsonExtract(raw: string): SceneBriefJson {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  const slice = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
  try {
    return JSON.parse(slice);
  } catch {
    throw new Error(`Scene brief JSON parse failed. Claude returned: ${raw.slice(0, 300)}`);
  }
}

export async function generateSceneBrief({ storyScene, character, recentBriefs, stylingProfile, lifeNote, situationContext, activityContext }: GenerateArgs): Promise<SceneBriefResult> {
  const sacredText = character.sacred_details
    ? `SACRED DETAILS (invariant across all 7 assets — never change):\n${JSON.stringify(character.sacred_details, null, 2)}`
    : "";

  const toneText = character.visual_tone ? `VISUAL TONE: ${character.visual_tone}` : "";
  const stylingText = character.styling_note ? `STYLING OVERRIDE: ${character.styling_note}` : "";
  const sceneJsonText = storyScene.scene ? `STRUCTURED SCENE:\n${JSON.stringify(storyScene.scene, null, 2)}` : "";
  const tierText = storyScene.tier ? `TIER: ${storyScene.tier}` : "";
  // Tier-neutral environment-building instruction (all tiers). Fixes flat, backdrop-against-a-
  // wall locks by requiring real depth and by enumerating the background layers that ARE present,
  // so the slot prompts can build three-dimensional composition without inventing anything.
  // Density is calibrated per tier/mood (a café is dense with objects; an intimate bedroom stays minimal).
  // Depth comes from objects, natural layers AND, in public places, a few blurred anonymous background
  // people — the one hard rule is identity safety: never a second sharp or recognizable face.
  const environmentDepth = `\nENVIRONMENT DEPTH (all tiers): lock a location that has real depth and layers, not a flat backdrop. In spatial_setup and location_constraints, name the foreground, midground and background elements that ARE present, so the slot prompts can build three-dimensional composition without inventing anything downstream. Match the density to the tier and mood — a café, kitchen or gym is dense with objects and layered surfaces; an intimate bedroom or an open beach stays minimal but STILL has depth (a window, a lamp, curtains, the horizon, soft background). In public places (café, gym, street, shop, beach) a few BLURRED, ANONYMOUS, out-of-focus background people are welcome as ambient life — they make the scene feel real — but NEVER a second sharp or recognizable face, never a foreground companion, never anyone interacting with the subject. The subject stays the single clear main character. Never lock an empty, sterile or minimalist frame with nothing behind the subject.`;
  // Until this existed the brief said WHAT was in the room but never WHEN or in WHAT TASTE,
  // so image models filled the gap with their statistical average interior: dated builder
  // kitchens, beige-on-beige rentals, flat-pack showrooms. The output read as drab and
  // ten years old even when every other rule was satisfied. This states the era and taste
  // positively rather than banning ugliness, which is the only thing image models act on.
  const contemporaryWorld = `\nERA AND TASTE (all tiers — this is present-day content, and it must look it): her world is a young woman's life RIGHT NOW, styled the way someone with taste actually lives today — not a catalogue, not a rental, not a period piece. Interiors are current: warm woods, handmade or textured ceramics, real plants, layered textiles, a piece of art or a print, mixed materials, one or two things slightly out of place because someone lives there. There is real COLOUR in the frame — a painted cabinet, a ceramic in a strong glaze, fruit or flowers, a coloured textile, a book stack — never an all-beige or all-grey room.
EXPLICITLY AVOID (these read as dated or depressing and are the default an image model falls back to): 1980s/1990s builder kitchens, oak-and-cream fitted units, laminate worktops, fluorescent ceiling panels, popcorn or textured ceilings, vertical blinds, flat-pack showroom sets with nothing personal in them, hospital-white walls with a single chair, brown-on-brown furniture, net curtains, dated floral wallpaper.
The energy is fresh and alive — daylight, colour, texture, movement — even when the mood is quiet. A calm frame can still be bright and current; quiet must never come out as grey, tired or institutional.`;
  // lived_moments is "Magnetic Everyday Life" — it wants rich, lived-in spaces with
  // real background depth, the opposite of the sparse "empty micro-location" bias baked into
  // the spatial_setup instruction below. Put the richness INTO the lock: when the elements are
  // enumerated in spatial_setup / location_constraints, the slot prompts are allowed to show
  // them, so depth is legitimate and the NO-INVENTION rule is never broken. In public places a
  // few blurred anonymous background people are welcome (identity safety: never a second sharp face).
  const livedMomentsBrief = storyScene.tier === "lived_moments"
    ? `\nLIVED_MOMENTS ENVIRONMENT (overrides the "sparse micro-location" bias in spatial_setup for THIS brief):
This location must feel like a real, lived-in everyday place with visual DEPTH — not an empty corner or a bare wall. In spatial_setup AND location_constraints, lock a LAYERED space and enumerate its background elements explicitly, e.g.:
- café → nearby tables and chairs, a counter with cups, a pastry case, a window to the street, hanging plants, a couple of blurred anonymous patrons deep in the background
- kitchen → counter with everyday items, open shelves, a window, a fruit bowl
- living room → sofa, a low table, shelves with books, a lamp, a plant
- bedroom → unmade bed, a nightstand, a window with curtains, a chair with clothes
Because these elements are named in the lock, the slot prompts are ALLOWED to show them — that is intended. Still ONE micro-location and still exhaustive, but exhaustive about a RICH space: list what IS there across foreground + midground + background so every slot has real depth. In busy public places a few BLURRED, ANONYMOUS, out-of-focus background people are welcome as ambient life — but NEVER a second sharp or recognizable face, never a foreground companion; she stays the single clear main character. Genuinely sparse outdoor locations (beach, pool, open street) get their depth from distance and natural layers (horizon, water, a distant coastline, dunes, the sky) plus, where natural, a few far-off blurred figures — do not force furniture where it would not exist. Never lock an empty, sterile or minimalist frame for this tier.`
    : "";
  const driftRules = driftRulesForBrief(storyScene.drift_seeds);
  const driftText = driftRules.length > 0
    ? `\nDRIFT SEEDS ACTIVE TODAY (mandatory — bake these into the brief's visual_rules array verbatim):\n${driftRules.map((r) => `- ${r}`).join("\n")}`
    : "";

  const stylingText2 = stylingProfile ? buildStylingRule(stylingProfile, storyScene.location, activityContext) : "";

  const rotationText = recentBriefs && recentBriefs.length > 0
    ? `\nWARDROBE + PROP ROTATION (mandatory — enforce visible variety day to day):
Recent wardrobe_lock values (most recent first — do NOT repeat the same combination):
${recentBriefs.map((b, i) => `  Day -${i + 1}: ${b.wardrobe_lock}`).join("\n")}

Recent allowed_props (avoid repeating the same prop two days in a row):
${recentBriefs.slice(0, 3).map((b, i) => `  Day -${i + 1}: ${b.allowed_props.join(", ")}`).join("\n")}

RULE: today's wardrobe_lock must use a DIFFERENT garment combination than Day -1 above. Rotate through the full wardrobe_anchors list — do not default to the same dress + blazer every day.
RULE: today's allowed_props must include at most ONE prop that appeared yesterday. Prefer props that have not appeared in the last 3 days.`
    : "";

  const systemPrompt = `You are the cinematic director for ${character.name}.

Your task: produce ONE scene brief that locks visual continuity across 7 separate AI-generated assets (5 carousel photos + 1 reel video + 1 story photo) that will all be generated from this brief.

If the brief is loose, the 7 assets will feel disconnected. If the brief is precise, they will read as one moment captured from multiple angles.

CHARACTER VISUAL BRIEF:
${character.visual_brief}

${sacredText}

${toneText}
${stylingText}
${stylingText2}

${tierText}
${environmentDepth}
${contemporaryWorld}
${livedMomentsBrief}
${rotationText}

STORY CONTEXT:
Location: ${storyScene.location}
Mood: ${storyScene.mood}
Arc position: ${storyScene.arc_position}
Emotional beat: ${storyScene.emotional_beat ?? storyScene.mood}
Narrative: ${storyScene.narrative}
${lifeNote ? `Life continuity (let it subtly color mood/energy, not the tier): ${lifeNote}` : ""}
${situationContext ? `Today's situation (open_life_generation_v1 — let it inform spatial_setup/wardrobe_lock naturally, never override SACRED DETAILS or the environment doctrine above): ${situationContext}` : ""}
${sceneJsonText}
${driftText}

You will output TWO things, separated by the literal line "---DOCTRINE---":

PART 1 — STRUCTURED JSON (machine-readable continuity lock).
Valid JSON only, no markdown:
{
  "camera_language": "one short phrase in plain words (e.g. 'static handheld 50mm' or 'slow dolly 35mm')",
  "color_palette": ["3 to 5 simple color tokens. At least ONE must be an actual colour, not a neutral — an all-beige/grey/charcoal palette reads flat and dated. Pick what suits the tier and mood (e.g. 'terracotta', 'sage green', 'butter yellow', 'faded denim blue', 'warm cream', 'soft clay pink', 'deep olive', 'warm oak'). Neutrals are fine alongside a colour, never instead of one."],
  "visual_rules": ["3 to 5 plain STRUCTURAL rules each in 3-7 words (e.g. 'wardrobe never changed', 'no mirrors', 'no legible text', 'one light source')"],
  "location_constraints": ["3 to 5 GEOMETRIC/SPATIAL constraints — describe what is WHERE in physical space. Examples: 'tall window 1.5m to her right, sheer linen curtain half-drawn', 'open oak shelving along the left wall at 1.6m height', 'round marble-topped table 60cm in front of her', 'trailing pothos on the shelf above the counter', 'no signage or text visible in frame'. AVOID vague constraints like 'same lighting' — instead say 'one window, light entering from the left at 40 degrees'."],
  "spatial_setup": "ONE concrete sentence describing a SINGLE MICRO-LOCATION (max 10m × 10m radius) where ALL 8 slots are captured. Camera moves around within this micro-location; subject stays in this micro-location for the entire batch. PICK ONE entry from the character's sacred_details.recurring_environment — do not span multiple. Example: 'Her kitchen — pale oak counter along the window wall, deep-sage lower cabinets, open shelf above holding stacked handmade ceramics and a trailing pothos, tall window to the left with a sheer curtain half-drawn, a bowl of apricots on the counter, no upper cabinets, no island, no dining table, no appliances on the counter beyond the kettle.' Be physically possible — no escalators into walls, no stairs to nowhere. Be EXHAUSTIVE about what is and is NOT in this micro-location, so slot prompts cannot invent secondary furniture or environment elements (benches, tables, fruit crates, market stalls, signs, second rooms).",
  "pet_lock": "ONLY if an animal appears in today's scene — otherwise omit this key entirely. One EXHAUSTIVE description of that ONE individual animal, so every slot renders the SAME creature: species, breed, exact coat colour and pattern, eye colour, size/build, collar or no collar. Format: 'one cat — British Shorthair, solid blue-grey short coat, no markings, copper-orange eyes, stocky, no collar'. If a garment-level detail is not listed it is not there; same rule applies here. The animal never changes colour, breed, size or count between slots.",
  "wardrobe_lock": "EXHAUSTIVE list of garments, comma-separated. Format: 'washed-white cotton tee (relaxed, slightly cropped), faded straight-leg jeans (high-rise, mid-blue), no shoes, thin gold chain, small gold hoops, no bag, no watch, no belt'. If a garment is not listed, it is NOT in the frame.",
  "allowed_props": ["DEFAULT IS EMPTY — output an empty array unless the spatial_setup explicitly contains a flat surface (table, desk, windowsill, counter) where a prop would naturally sit, AND the prop is in sacred_details.props. Spatial logic is mandatory: BATHROOM → empty array, no exceptions. BEDROOM without desk/table → empty array. HALLWAY / STAIRCASE / STREET / BEACH / POOL → empty array. TERRACE WITH TABLE or CAFÉ → one drink prop allowed (espresso cup OR wine/champagne — not both, not coffee AND book). HOTEL ROOM WITH DESK OR WINDOWSILL → book or key card only, no food or drink. BALCONY WITH RAILING, no table → sunglasses only if outdoor. Maximum 1 prop. If in doubt: empty array."],
  "lighting_state": "one light source, direction, colour (e.g. 'window light from the left, soft, warm morning white' or 'single bedside lamp, directional, amber'). Prefer real daylight or a warm practical lamp; harsh overhead fluorescent only when the location genuinely has it.",
  "time_of_day": "one of: dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp | fluorescent",
  "weather_implied": "simple word (clear, overcast, humid, dry wind, post-rain, indoor)"
}

PART 2 — PROSE DOCTRINE (120–160 words).
This text is injected verbatim into every one of the 7 slot prompt calls. The slot prompts are then ingested by AI image and video generators. Therefore: use PLAIN VISUAL LANGUAGE that an image model recognizes. No academic vocabulary, no philosophical phrasing.

Cover, in 4 short paragraphs of plain prose:
1. The location, physically: where exactly, what surfaces and objects surround her, indoor or outdoor, urban or quiet
2. The wardrobe: exact garments, fabric, fit — concrete
3. The light: one source (e.g. "overhead fluorescent in convenience store"), direction, time of day, color temperature
4. A short NO list for this day: 3 specific STRUCTURAL things prompts must avoid (e.g. "no mirrors", "no legible text", "no second face in frame") — do not default to banning smiling or eye contact; only list those if the tier's mood genuinely calls for it

REALISM (state once, plainly): this is a real photo taken on a phone — shot on an iPhone 16 Pro, candid, natural light, visible skin texture, no beauty filter, slightly imperfect framing. Not a studio render, not retouched.

BANNED words in doctrine (image models reject them): ethereal, dreamy, moody, atmospheric, evocative, soulful, magical, poetic, gorgeous, stunning, beautiful, breathtaking, perfect, ineffable, otherworldly. Also banned: physiology terms (breathing rate, gaze drift, EMG, capillary), optical jargon (chromatic aberration, subsurface scattering, lens breathing), abstract measurements. Also banned (they produce empty, sterile, catalogue frames): clean, minimalist, minimal, sterile, empty, bare, devoid of clutter, uncluttered, pristine, balanced exposure — describe the real, lived-in objects that ARE there instead.

Write the way a real photographer writes a one-paragraph location note before a shoot.

Output format:
{JSON}
---DOCTRINE---
{prose doctrine}`;

  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: 1600,
    system: systemPrompt,
    messages: [{ role: "user", content: "Generate the scene brief now." }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text;
  const [jsonPart, doctrinePart] = raw.split(/---DOCTRINE---/i);

  if (!jsonPart || !doctrinePart) {
    throw new Error("Scene brief response missing JSON or doctrine section");
  }

  const json = safeJsonExtract(jsonPart);

  // Environment-continuity fix (same mechanism as lib/shotDirection.ts, reused not reimplemented):
  // this brief is already shared verbatim across all 7-8 slots (see lib/slotPrompts.ts's
  // commonBody/captionBody), but a real production finding showed Claude's own spatial_setup/
  // location_constraints still describe distant background architecture in generic terms ("low-
  // rise rooflines, 2 to 4 storeys of buildings") — specific enough for the foreground (pool,
  // furniture, props) but not for the skyline/architecture beyond it, so independently-generated
  // slots (reel_start_frame vs story_bts) still rendered different buildings. Anchoring
  // spatial_setup here — once, before this brief is persisted and shared — fixes it everywhere the
  // brief is used, without touching slotPrompts.ts.
  const anchoredSpatial = ensureEnvironmentAnchored(json.spatial_setup);
  if (anchoredSpatial !== json.spatial_setup) {
    const anchorDetail = anchoredSpatial.slice(json.spatial_setup.length + 3);
    json.spatial_setup = anchoredSpatial;
    json.location_constraints = [...json.location_constraints, anchorDetail];
  }

  const doctrine = doctrinePart.trim();

  if (doctrine.length < 100) {
    throw new Error("Scene brief doctrine too short");
  }

  return { json, doctrine };
}
