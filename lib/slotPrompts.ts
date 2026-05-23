import {
  MASTER_DOCTRINE,
  SENSOR_REALISM,
  ARC_TRANSLATION,
  VIDEO_RULES,
  claudeWithRetry,
} from "@/lib/generatePrompts";
import { SlotSpec } from "@/lib/archetypeDeck";
import { SceneBriefJson } from "@/lib/sceneBrief";

interface BuildArgs {
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

function sacredBlock(sacred: Record<string, unknown> | null): string {
  if (!sacred || Object.keys(sacred).length === 0) return "";
  return `\nSACRED DETAILS (MANDATORY — present in every frame, never altered):
${JSON.stringify(sacred, null, 2)}\n`;
}

function buildPhotoSystem(args: BuildArgs): string {
  const arcNote = ARC_TRANSLATION[args.arcPosition] ?? ARC_TRANSLATION.quiet;
  const visualRules = args.sceneBriefJson.visual_rules.map((r) => `- ${r}`).join("\n");
  const constraints = args.sceneBriefJson.location_constraints.map((c) => `- ${c}`).join("\n");

  return `${MASTER_DOCTRINE}

${SENSOR_REALISM}

${arcNote}

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

SLOT: ${args.slot.slot} (carousel position ${args.slot.sequence_index ?? "n/a"} of 5)
SLOT FRAMING: ${args.slot.framing}

ARCHETYPE: ${args.archetypeId}
ARCHETYPE GUIDANCE: ${args.archetypeGuidance}

OUTPUT RULES:
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

End the prompt with a 2-3 word visual signature tag: [palette], [lens character], [movement]. Format: "Signature: warm beige / 50mm soft / stillness."

Write what a camera sees. Not what a poet feels.

OUTPUT: Start with "Model: Soul 2 🖼️ Image Prompt" then the paragraph including the signature tag. Nothing else.`;
}

function buildVideoSystem(args: BuildArgs): string {
  const arcNote = ARC_TRANSLATION[args.arcPosition] ?? ARC_TRANSLATION.quiet;
  const visualRules = args.sceneBriefJson.visual_rules.map((r) => `- ${r}`).join("\n");
  const constraints = args.sceneBriefJson.location_constraints.map((c) => `- ${c}`).join("\n");

  return `${MASTER_DOCTRINE}

${VIDEO_RULES}

${SENSOR_REALISM}

${arcNote}

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
${sacredBlock(args.character.sacred_details)}

SLOT: ${args.slot.slot}
SLOT FRAMING: ${args.slot.framing}

ARCHETYPE: ${args.archetypeId}
ARCHETYPE GUIDANCE: ${args.archetypeGuidance}

HOOK REQUIREMENT (critical for short-form):
The first 0–3 seconds must be a scroll-stopper. Front-load the strongest motion, contrast, or composition. The viewer decides to keep watching or scroll within 1 second.

OUTPUT RULES:
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

End with a 2-3 word visual signature tag: [palette], [lens character], [movement]. Format: "Signature: warm beige / 50mm soft / drift."

Write what a camera operator executes. Not what a director imagines.

OUTPUT: Start with "Model: Seedance 2.0 🎬 Video Prompt" then the paragraph including the signature tag. Nothing else.`;
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
  const systemPrompt = args.slot.type === "video" ? buildVideoSystem(args) : buildPhotoSystem(args);
  const maxTokens = args.slot.type === "video" ? 900 : 800;

  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: `Generate the ${args.slot.slot} prompt now.` }],
  });

  const text = (msg.content[0] as { type: string; text: string }).text;
  return { prompt: text, visualSignature: extractSignature(text) };
}
