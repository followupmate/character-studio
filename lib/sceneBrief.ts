import { claudeWithRetry } from "@/lib/generatePrompts";
import { StylingProfile } from "@/lib/stylingDeck";

export interface SceneBriefJson {
  camera_language: string;
  color_palette: string[];
  visual_rules: string[];
  location_constraints: string[];
  spatial_setup: string;
  wardrobe_lock: string;
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
}

function driftRulesForBrief(seeds: Array<{ kind: string; detail?: string }> | null, sacred: Record<string, unknown> | null): string[] {
  if (!seeds || seeds.length === 0) return [];
  const rules: string[] = [];
  for (const s of seeds) {
    if (s.kind === "recurring_stranger") {
      const stranger = (sacred && typeof sacred === "object" && "marseille_stranger" in sacred
        ? (sacred as { marseille_stranger?: { prompt_injection?: string } }).marseille_stranger
        : null);
      const inj = stranger?.prompt_injection ??
        "An indeterminate male figure in a long charcoal wool coat stands completely still deep in the background. He is out of focus, heavily blurred by shallow depth of field (f/1.4), blending into the urban geometry, ignoring the subject.";
      rules.push(
        `Background presence (mandatory, inject into 2 of the 7 frames only — never all): ${inj} Never described as a character. Never named. Never foregrounded.`
      );
    } else if (s.kind === "timestamp_mismatch") {
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

export async function generateSceneBrief({ storyScene, character, recentBriefs, stylingProfile, lifeNote }: GenerateArgs): Promise<SceneBriefResult> {
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
  // Depth is built from OBJECTS and natural layers, never from background people — those are banned in the
  // downstream slot-prompt contract (only a deliberate drift seed adds one figure).
  const environmentDepth = `\nENVIRONMENT DEPTH (all tiers): lock a location that has real depth and layers, not a flat backdrop. In spatial_setup and location_constraints, name the foreground, midground and background elements that ARE present, so the slot prompts can build three-dimensional composition without inventing anything downstream. Match the density to the tier and mood — a café, kitchen or gym is dense with objects and layered surfaces; an intimate bedroom or an open beach stays minimal but STILL has depth (a window, a lamp, curtains, the horizon, soft background). Build depth from OBJECTS, surfaces and natural layers ONLY — never from background people (background people are excluded downstream unless a drift seed adds one). Never lock an empty, sterile or minimalist frame with nothing behind the subject.`;
  // lived_moments is "Magnetic Everyday Life" — it wants rich, lived-in spaces with
  // real background depth, the opposite of the sparse "empty micro-location" bias baked into
  // the spatial_setup instruction below. Put the richness INTO the lock: when the elements are
  // enumerated in spatial_setup / location_constraints, the slot prompts are allowed to show
  // them, so depth is legitimate and the NO-INVENTION rule is never broken. Depth comes from
  // objects and natural layers, never from background people (banned downstream, drift seed aside).
  const livedMomentsBrief = storyScene.tier === "lived_moments"
    ? `\nLIVED_MOMENTS ENVIRONMENT (overrides the "sparse micro-location" bias in spatial_setup for THIS brief):
This location must feel like a real, lived-in everyday place with visual DEPTH — not an empty corner or a bare wall. In spatial_setup AND location_constraints, lock a LAYERED space and enumerate its background elements explicitly, e.g.:
- café → nearby empty tables and chairs, a counter with cups, a pastry case, a window to the street, hanging plants
- kitchen → counter with everyday items, open shelves, a window, a fruit bowl
- living room → sofa, a low table, shelves with books, a lamp, a plant
- bedroom → unmade bed, a nightstand, a window with curtains, a chair with clothes
Because these elements are named in the lock, the slot prompts are ALLOWED to show them — that is intended. Still ONE micro-location and still exhaustive, but exhaustive about a RICH space: list what IS there across foreground + midground + background so every slot has real depth. Build this depth from OBJECTS, furniture and natural layers, NOT from background people (background people are excluded downstream unless a drift seed adds one). Genuinely sparse outdoor locations (beach, pool, open street) get their depth from distance and natural layers (horizon, water, a distant coastline, dunes, the sky) rather than furniture — do not force furniture where it would not exist. Never lock an empty, sterile or minimalist frame for this tier.`
    : "";
  const driftRules = driftRulesForBrief(storyScene.drift_seeds, character.sacred_details);
  const driftText = driftRules.length > 0
    ? `\nDRIFT SEEDS ACTIVE TODAY (mandatory — bake these into the brief's visual_rules array verbatim):\n${driftRules.map((r) => `- ${r}`).join("\n")}`
    : "";

  const stylingText2 = stylingProfile
    ? `\nSTYLING PROFILE FOR TODAY — MANDATORY OVERRIDE (replaces wardrobe_anchors for this batch):
Label: ${stylingProfile.label}
Vibe: ${stylingProfile.vibe}
Outfit: ${stylingProfile.outfit}
Hair: ${stylingProfile.hair}
Jewelry: ${stylingProfile.jewelry}
Makeup: ${stylingProfile.makeup}

RULE: Use this profile as the wardrobe_lock. Adapt minor details to fit the location (${storyScene.location}) and time of day, but the styling category must be preserved — if it says beach club, she is in beach club attire; if it says couture gown, she is in a gown.
RULE: Do NOT revert to the generic silk slip dress + linen blazer from wardrobe_anchors. The slip dress is NOT today's look.
Add the character constants from sacred_details (gold chain, earrings) as always-present accessories.`
    : "";

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
${livedMomentsBrief}
${rotationText}

STORY CONTEXT:
Location: ${storyScene.location}
Mood: ${storyScene.mood}
Arc position: ${storyScene.arc_position}
Emotional beat: ${storyScene.emotional_beat ?? storyScene.mood}
Narrative: ${storyScene.narrative}
${lifeNote ? `Life continuity (let it subtly color mood/energy, not the tier): ${lifeNote}` : ""}
${sceneJsonText}
${driftText}

You will output TWO things, separated by the literal line "---DOCTRINE---":

PART 1 — STRUCTURED JSON (machine-readable continuity lock).
Valid JSON only, no markdown:
{
  "camera_language": "one short phrase in plain words (e.g. 'static handheld 50mm' or 'slow dolly 35mm')",
  "color_palette": ["3 to 5 simple color tokens (e.g. 'charcoal', 'fluorescent green', 'concrete grey')"],
  "visual_rules": ["3 to 5 plain rules each in 3-7 words (e.g. 'no direct eye contact', 'no smiling', 'wardrobe never changed', 'no mirrors')"],
  "location_constraints": ["3 to 5 GEOMETRIC/SPATIAL constraints — describe what is WHERE in physical space. Examples: 'subject stands on north-side platform edge', 'escalator descends to her left at 30 degrees', 'concrete pillar 2m in front of her', 'fluorescent ceiling lights at 3m height', 'no signage or text visible in frame'. AVOID vague constraints like 'same lighting' — instead say 'overhead fluorescent fixtures every 3m'."],
  "spatial_setup": "ONE concrete sentence describing a SINGLE MICRO-LOCATION (max 10m × 10m radius) where ALL 8 slots are captured. Camera moves around within this micro-location; subject stays in this micro-location for the entire batch. PICK ONE entry from the character's sacred_details.recurring_environment — do not span multiple. Example: 'Shinagawa station underground passage between exits 2 and 3, concrete walls left and right, fluorescent strip lights overhead, descending escalator 5m to the right, no benches no stalls no vendors no shop fronts in frame.' Be physically possible — no escalators into walls, no stairs to nowhere. Be EXHAUSTIVE about what is and is NOT in this micro-location, so slot prompts cannot invent secondary furniture or environment elements (benches, tables, fruit crates, market stalls, signs, second rooms).",
  "wardrobe_lock": "EXHAUSTIVE list of garments, comma-separated. Format: 'charcoal wool coat (knee-length, late-90s cut), black trousers, black ankle boots, brown leather shoulder bag (worn strap), no jewelry, no scarf, no hat'. If a garment is not listed, it is NOT in the frame.",
  "allowed_props": ["DEFAULT IS EMPTY — output an empty array unless the spatial_setup explicitly contains a flat surface (table, desk, windowsill, counter) where a prop would naturally sit, AND the prop is in sacred_details.props. Spatial logic is mandatory: BATHROOM → empty array, no exceptions. BEDROOM without desk/table → empty array. HALLWAY / STAIRCASE / STREET / BEACH / POOL → empty array. TERRACE WITH TABLE or CAFÉ → one drink prop allowed (espresso cup OR wine/champagne — not both, not coffee AND book). HOTEL ROOM WITH DESK OR WINDOWSILL → book or key card only, no food or drink. BALCONY WITH RAILING, no table → sunglasses only if outdoor. Maximum 1 prop. If in doubt: empty array."],
  "lighting_state": "one light source, direction, color (e.g. 'overhead fluorescent, harsh, neutral white')",
  "time_of_day": "one of: dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp | fluorescent",
  "weather_implied": "simple word (clear, overcast, humid, dry wind, post-rain, indoor)"
}

PART 2 — PROSE DOCTRINE (120–160 words).
This text is injected verbatim into every one of the 7 slot prompt calls. The slot prompts are then ingested by AI image and video generators. Therefore: use PLAIN VISUAL LANGUAGE that an image model recognizes. No academic vocabulary, no philosophical phrasing.

Cover, in 4 short paragraphs of plain prose:
1. The location, physically: where exactly, what surfaces and objects surround her, indoor or outdoor, urban or quiet
2. The wardrobe: exact garments, fabric, fit — concrete
3. The light: one source (e.g. "overhead fluorescent in convenience store"), direction, time of day, color temperature
4. A short NO list for this day: 3 specific things prompts must avoid (e.g. "no mirrors", "no direct eye contact", "no smiling")

REALISM (state once, plainly): this is a real photo taken on a phone — shot on an iPhone 16 Pro, candid, natural light, visible skin texture, no beauty filter, slightly imperfect framing. Not a studio render, not retouched.

BANNED words in doctrine (image models reject them): ethereal, dreamy, moody, atmospheric, evocative, soulful, magical, poetic, gorgeous, stunning, beautiful, breathtaking, perfect, ineffable, otherworldly. Also banned: physiology terms (breathing rate, gaze drift, EMG, capillary), optical jargon (chromatic aberration, subsurface scattering, lens breathing), abstract measurements.

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
  const doctrine = doctrinePart.trim();

  if (doctrine.length < 100) {
    throw new Error("Scene brief doctrine too short");
  }

  return { json, doctrine };
}
