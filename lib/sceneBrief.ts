import { claudeWithRetry } from "@/lib/generatePrompts";

export interface SceneBriefJson {
  camera_language: string;
  color_palette: string[];
  visual_rules: string[];
  location_constraints: string[];
  wardrobe_lock: string;
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
  };
  character: {
    name: string;
    visual_brief: string;
    sacred_details: Record<string, unknown> | null;
    visual_tone: string | null;
    styling_note: string | null;
  };
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

  const systemPrompt = `You are the cinematic director for ${character.name}.

Your task: produce ONE scene brief that locks visual continuity across 7 separate AI-generated assets (5 carousel photos + 1 reel video + 1 story photo) that will all be generated from this brief.

If the brief is loose, the 7 assets will feel disconnected. If the brief is precise, they will read as one moment captured from multiple angles.

CHARACTER VISUAL BRIEF:
${character.visual_brief}

${sacredText}

${toneText}
${stylingText}

STORY CONTEXT:
Location: ${storyScene.location}
Mood: ${storyScene.mood}
Arc position: ${storyScene.arc_position}
Emotional beat: ${storyScene.emotional_beat ?? storyScene.mood}
Narrative: ${storyScene.narrative}
${sceneJsonText}

You will output TWO things, separated by the literal line "---DOCTRINE---":

PART 1 — STRUCTURED JSON (machine-readable continuity lock).
Valid JSON only, no markdown:
{
  "camera_language": "one sentence describing the operator's signature for the day (e.g. 'slow handheld, breath drift, 50mm soft')",
  "color_palette": ["3 to 5 specific color tokens drawn from the scene"],
  "visual_rules": ["3 to 5 hard rules every asset must obey, e.g. 'no direct eye contact', 'natural movement only', 'wardrobe never adjusted'"],
  "location_constraints": ["2 to 4 spatial constraints: same building, same window, same time slice"],
  "wardrobe_lock": "exact garments, fabric, fit — one sentence, no fashion language",
  "lighting_state": "single light source description + direction + temperature",
  "time_of_day": "one of: dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp",
  "weather_implied": "atmospheric state derivable from scene (clear, overcast, humid, dry wind, post-rain)"
}

PART 2 — PROSE DOCTRINE (180–220 words).
This is the continuity master that will be injected into every one of the 7 prompt calls. Write it as if briefing a film crew before they shoot 7 frames of the same moment from different positions.

Cover, in flowing prose:
- The physical reality of the location (one paragraph): air, temperature, surfaces, what the camera body would feel
- The wardrobe and how the fabric is behaving on her body right now (not how it looks — how it sits)
- The light: source, direction, where it falls, where it does not
- The emotional state expressed as physiology (breathing, posture, gaze drift), never as label
- The hard NO list for this day: 3 specific things the prompts must avoid (e.g. "no mirrors", "no posed eye contact", "no full smile")

Forbidden in doctrine: poetic abstraction, "ethereal", "dreamy", "moody", any of the AI clichés. Write what a camera operator would write to another camera operator.

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
