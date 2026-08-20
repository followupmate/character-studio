import type { PromptDirectorInput } from "./types";
import { archetypeAllowsProp, cleanList, isCloseUpArchetype, sacredAnatomyAnchors, sacredList } from "./helpers";
import { SOCIAL_REALISM_PROFILE } from "./constants";

// Deterministic IMAGE section builders (spec §7). These never call an LLM — every fact comes
// from sceneBrief / character.sacredDetails / slot, per the "no invention" rule (§7B / §22).

// §7A — IDENTITY / REFERENCE, split into two PromptPackage sections: `reference` (the strict
// "use the provided image" block, only when there IS a reference image) and `identity` (facts
// that always apply, image or not).
export function buildReferenceSection(input: PromptDirectorInput): string[] {
  if (!input.hasReferenceImage) return [];
  return cleanList([
    "Use the provided image as strict identity reference.",
    "Preserve exact facial identity and facial proportions.",
    "Preserve hairstyle, body proportions and visible identity details.",
    "Do not beautify, idealize or reinterpret the person.",
  ]);
}

// Which anatomy_anchors KEYS are actually visible per archetype — mirrors lib/slotPrompts.ts's
// ANATOMY ANCHOR rule verbatim (hands_object -> hands, fabric_texture -> neck/collarbone,
// emotional_close -> jawline, over_shoulder -> neck/shoulders). An archetype not listed here shows
// no reliably-identifiable body part close, so it gets no anchor at all.
//
// BUG FIX (found in fixture-1 review): the previous version gated on isCloseUpArchetype() and then
// dumped EVERY key present in sacred_details.anatomy_anchors regardless of which body part the
// archetype actually frames — an "emotional_close" (face/jawline only) shot was getting a "hands"
// anchor line even though no hand is in frame. Anatomy anchors must only ever describe a body part
// the archetype actually puts on screen.
const ANATOMY_RELEVANCE: Record<string, string[]> = {
  hands_object: ["hands", "wrists", "forearms"],
  interaction_object: ["hands", "wrists", "forearms"],
  fabric_texture: ["neck", "collarbone"],
  over_shoulder: ["neck", "shoulders", "collarbone"],
  emotional_close: ["jawline", "neck"],
};

export function buildIdentitySection(input: PromptDirectorInput): string[] {
  const lines: string[] = [];
  lines.push(`Character visual brief: ${input.character.visualBrief}`);
  if (input.character.soulId) lines.push(`Soul ID: ${input.character.soulId}`);

  const wardrobeAnchors = sacredList(input.character.sacredDetails, "wardrobe_anchors");
  if (wardrobeAnchors.length > 0) {
    lines.push(`Wardrobe anchors (always present, never substituted): ${wardrobeAnchors.join("; ")}`);
  }
  const neverShow = sacredList(input.character.sacredDetails, "never_show");
  if (neverShow.length > 0) {
    lines.push(`Never show: ${neverShow.join("; ")}`);
  }

  const relevantParts = ANATOMY_RELEVANCE[input.archetypeId] ?? [];
  if (relevantParts.length > 0) {
    const anchors = sacredAnatomyAnchors(input.character.sacredDetails);
    for (const part of relevantParts) {
      const marker = anchors[part];
      if (marker) lines.push(`Anatomy anchor (${part}): ${marker}`);
    }
  }

  return cleanList(lines);
}

// §7B — SCENE (locked exactly to sceneBrief; never invents)
export function buildSceneSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  const lines: string[] = [
    `Spatial setup: ${sb.spatial_setup}`,
    ...sb.location_constraints.map((c) => `Location constraint: ${c}`),
  ];
  if (sb.environment_anchor) lines.push(`Environment anchor (mandatory, keep specific nouns): ${sb.environment_anchor}`);
  if (input.situationTranslation) lines.push(input.situationTranslation);

  const allowedProps = sb.allowed_props ?? [];
  if (archetypeAllowsProp(input.archetypeId) && allowedProps.length > 0) {
    lines.push(`This slot's archetype (${input.archetypeId}) allows exactly one prop from: ${allowedProps.join("; ")}`);
  } else {
    lines.push("No carried prop — hands empty, nothing held.");
  }

  return cleanList(lines);
}

// Wardrobe/animal lock as its own PromptPackage section (kept separate from `scene` per the
// PromptPackage shape) — always locked verbatim from sceneBrief, never invented (§7B "NO
// INVENTION RULE").
export function buildAppearanceSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  return cleanList([
    `Wardrobe lock (exhaustive, no substitutions): ${sb.wardrobe_lock}`,
    sb.pet_lock ? `Animal lock (same individual every time): ${sb.pet_lock}` : null,
  ]);
}

// §21 — FIRST FRAME FOR VIDEO. When this image is planned to become an i2v start frame,
// plannedVideoIntent must shape the starting pose/framing so frame 0 is physically capable of
// continuing into that motion — not a random independent image. Folded into the camera section
// (it's fundamentally pose/framing guidance) rather than a new top-level PromptPackage key.
function firstFramePrepLines(input: PromptDirectorInput): string[] {
  const intent = input.plannedVideoIntent;
  if (!intent) return [];

  const lines: string[] = ["First-frame prep — this image is planned as an image-to-video start frame:"];

  if (intent.mode === "talking_to_camera") {
    lines.push(
      "Face clearly visible and turned toward camera, mouth fully unobstructed.",
      "Near-neutral expression — avoid an extreme or mid-peak facial expression that can't naturally continue into speech.",
      "Hands must not block or rest near the face."
    );
  } else if (/walk|step|stride/i.test(intent.action ?? "")) {
    lines.push(
      "Subject positioned mid-step or standing ready to move — not in a static end-pose.",
      "Leave clear space in the frame in the direction of intended movement."
    );
  } else {
    lines.push("Pose must be anatomically sustainable as a starting position — one the body can naturally continue moving from.");
  }

  return lines;
}

// §7C — CAMERA. Prompt Director picks ONE concrete camera behavior from the archetype/framing —
// no random technical jargon, no lens mm unless it's actually useful for this provider.
export function buildCameraSection(input: PromptDirectorInput): string[] {
  const lines: string[] = [`Framing: ${input.slot.framing}`];
  if (isCloseUpArchetype(input)) {
    lines.push("Shot size: close, face or detail fills a large part of the frame.");
  } else if (input.slot.family === "environment") {
    lines.push("Shot size: wide, subject embedded in environment.");
  } else {
    lines.push("Shot size: medium.");
  }
  lines.push(`Camera language: ${input.sceneBrief.camera_language}`);
  lines.push(...firstFramePrepLines(input));
  return cleanList(lines);
}

// §7D — LIGHTING. Real, concrete formulations — never "cinematic glow" / "dramatic studio light".
export function buildLightingSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  return cleanList([
    `Light source and direction: ${sb.lighting_state}`,
    `Time of day: ${sb.time_of_day}`,
    `Weather: ${sb.weather_implied}`,
  ]);
}

// §7E — HUMAN REALISM. Close-up gets a stronger block than a wide full-body frame — never the
// full list on every shot.
export function buildRealismSection(input: PromptDirectorInput): string[] {
  const base = ["natural skin texture", "no airbrush, no plastic smoothing"];
  if (!isCloseUpArchetype(input)) {
    return cleanList([...base, "natural hair strands", ...SOCIAL_REALISM_PROFILE.lines]);
  }
  return cleanList([
    ...base,
    "visible pores",
    "subtle skin redness",
    "minor imperfections",
    "natural under-eye texture",
    "realistic lip texture",
    "subtle facial asymmetry — eyes/eyebrows/lip corners not perfectly aligned",
    ...SOCIAL_REALISM_PROFILE.lines,
  ]);
}

// §7F — MICRO IMPERFECTIONS. Only when the model/scene benefit from "real camera ≠ CGI render".
// Skipped for archetype families that don't read as phone-camera captures (kept conservative: on
// for subject/detail/bts families, which is where phone-camera imperfection reads as authentic;
// off for wide environment establishing shots where it adds nothing).
export function buildImperfectionsSection(input: PromptDirectorInput): string[] {
  if (input.slot.family === "environment") return [];
  return cleanList([
    "subtle sensor noise",
    "natural HDR behavior",
    "slight exposure inconsistency",
    input.slot.type === "photo" && isCloseUpArchetype(input) ? "phone lens distortion" : null,
  ]);
}

// §7G — IMAGE NEGATIVE builder lives in lib/promptDirector/negativeBuilder.ts (shared with video).
