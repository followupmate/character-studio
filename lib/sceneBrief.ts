import { claudeWithRetry } from "@/lib/generatePrompts";

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
  return JSON.parse(slice);
}

export async function generateSceneBrief({ storyScene, character }: GenerateArgs): Promise<SceneBriefResult> {
  const sacredText = character.sacred_details
    ? `SACRED DETAILS (invariant across all 7 assets — never change):\n${JSON.stringify(character.sacred_details, null, 2)}`
    : "";

  const toneText = character.visual_tone ? `VISUAL TONE: ${character.visual_tone}` : "";
  const stylingText = character.styling_note ? `STYLING OVERRIDE: ${character.styling_note}` : "";
  const sceneJsonText = storyScene.scene ? `STRUCTURED SCENE:\n${JSON.stringify(storyScene.scene, null, 2)}` : "";
  const tierText = storyScene.tier ? `TIER: ${storyScene.tier}` : "";
  const driftRules = driftRulesForBrief(storyScene.drift_seeds, character.sacred_details);
  const driftText = driftRules.length > 0
    ? `\nDRIFT SEEDS ACTIVE TODAY (mandatory — bake these into the brief's visual_rules array verbatim):\n${driftRules.map((r) => `- ${r}`).join("\n")}`
    : "";

  const systemPrompt = `You are the cinematic director for ${character.name}.

Your task: produce ONE scene brief that locks visual continuity across 7 separate AI-generated assets (5 carousel photos + 1 reel video + 1 story photo) that will all be generated from this brief.

If the brief is loose, the 7 assets will feel disconnected. If the brief is precise, they will read as one moment captured from multiple angles.

CHARACTER VISUAL BRIEF:
${character.visual_brief}

${sacredText}

${toneText}
${stylingText}

${tierText}

STORY CONTEXT:
Location: ${storyScene.location}
Mood: ${storyScene.mood}
Arc position: ${storyScene.arc_position}
Emotional beat: ${storyScene.emotional_beat ?? storyScene.mood}
Narrative: ${storyScene.narrative}
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
  "allowed_props": ["AT MOST 3-4 objects that MAY appear in detail/interaction-archetype slots. Most slots will use NONE of these. Anchored to character's sacred_details.props. Examples: 'three loose mandarins in right coat pocket', 'used ferry ticket in left pocket', 'plain notebook in shoulder bag', 'metal token on keyring'. Do NOT include scene-specific newcomers — keep tight. NEVER include: plastic bags, shopping bags, takeaway containers, coffee cups, phones, branded items."],
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
