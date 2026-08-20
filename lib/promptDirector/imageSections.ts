import type { PromptDirectorInput } from "./types";
import { archetypeAllowsProp, cleanList, isCloseUpArchetype, sacredAnatomyAnchors, sacredList } from "./helpers";

// Deterministic IMAGE section builders (spec §7). These never call an LLM — every fact comes
// from sceneBrief / character.sacredDetails / slot, per the "no invention" rule (§7B / §22).
//
// This file is the Soul 2.0 (soul2) compiler in practice: "image" is the only outputType routed
// here, and soul2 is the only PromptDirectorTargetModel with supportsImage:true (see
// lib/promptDirector/constants.ts MODEL_CAPABILITIES). Shaped per Higgsfield's Soul 2.0 guidance:
// short, front-loaded prompts — most important visual info first, and no restating of core
// identity/wardrobe-policy facts once a Soul ID is doing that job on the platform side.

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

// Relevance-filtered anatomy anchor lines for THIS framing only (§ "Relevance filtering" — an
// anchor is only worth a word budget line when the archetype actually puts that body part on
// screen). `labeled` controls whether the line carries an explicit "Anatomy anchor (part):"
// prefix — used for the no-Soul-ID full brief, dropped for the Soul ID short cue where every word
// counts.
function anatomyAnchorLines(input: PromptDirectorInput, labeled: boolean): string[] {
  const relevantParts = ANATOMY_RELEVANCE[input.archetypeId] ?? [];
  if (relevantParts.length === 0) return [];
  const anchors = sacredAnatomyAnchors(input.character.sacredDetails);
  const lines: string[] = [];
  for (const part of relevantParts) {
    const marker = anchors[part];
    if (marker) lines.push(labeled ? `Anatomy anchor (${part}): ${marker}` : marker);
  }
  return lines;
}

export function buildIdentitySection(input: PromptDirectorInput): string[] {
  if (input.character.soulId) {
    // Soul ID behavior (Higgsfield Soul 2.0 guidance): identity/wardrobe-anchor/never-show policy
    // and the Soul ID UUID are the platform's job, not the prompt's — restating them burns word
    // budget on facts Soul ID already enforces. Only a short cue survives, plus a relevant anatomy
    // anchor when THIS framing genuinely puts that body part on screen.
    return cleanList(["Same character identity as the Soul ID reference.", ...anatomyAnchorLines(input, false)]);
  }

  // No Soul ID on file — nothing on the platform enforces identity, so the full brief is the only
  // thing keeping the character consistent across generations.
  const lines: string[] = [`Character visual brief: ${input.character.visualBrief}`];
  const wardrobeAnchors = sacredList(input.character.sacredDetails, "wardrobe_anchors");
  if (wardrobeAnchors.length > 0) {
    lines.push(`Wardrobe anchors (always present, never substituted): ${wardrobeAnchors.join("; ")}`);
  }
  const neverShow = sacredList(input.character.sacredDetails, "never_show");
  if (neverShow.length > 0) {
    lines.push(`Never show: ${neverShow.join("; ")}`);
  }
  lines.push(...anatomyAnchorLines(input, true));
  return cleanList(lines);
}

// §"SUBJECT ACTION / POSE" — Soul 2.0's item 2. Pulls the concrete visible action out of
// situationTranslation's structured block (rather than dumping the whole multi-paragraph
// SITUATION text, which alone can blow the 80-150 word target). Never invents an action — if
// situationTranslation has none, this legitimately returns []. Deliberately does NOT fall back to
// archetypeGuidance: that field is directorial/meta guidance to whoever is composing the shot
// ("Establish the room before she enters it.", "Punchline of the visual sentence."), not a visual
// fact about the frame, and reads as an out-of-place meta-sentence if it reaches the model as-is.
//
// TODO: extractVisibleAction() depends on the exact "- Visible action \ pose: ..." line format
// emitted by translateSituationForSlotPrompt() in lib/situationPlanner.ts. If that upstream
// template's wording changes, this regex silently stops matching (falls back to no pose line)
// rather than throwing — worth a shared fixture/contract test if that template is ever revised.
function extractVisibleAction(situationTranslation?: string): string | undefined {
  if (!situationTranslation) return undefined;
  const match = situationTranslation.match(/Visible action\s*\\?\s*pose:\s*([^\n]+)/i);
  return match?.[1]?.trim();
}

export function buildPoseActionSection(input: PromptDirectorInput): string[] {
  return cleanList([extractVisibleAction(input.situationTranslation) ?? null]);
}

// §7B — SCENE (locked exactly to sceneBrief; never invents). Soul 2.0's "SCENE / MICRO-LOCATION"
// — spatial_setup and wardrobe_lock must reach the compiled prompt verbatim (never paraphrased).
// location_constraints is deliberately NOT enumerated here: lib/sceneBrief.ts's own doctrine
// already writes spatial_setup as a 120-160-word layered depth description and bakes its
// environment_anchor into that same text (confirmed against real production scene briefs —
// location_constraints re-states the same facts as a separate array, not new information), so
// repeating it here was pure duplication, not scene fidelity. environment_anchor is only added as
// its own line on the rare brief where it ISN'T already part of spatial_setup.
export function buildSceneSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  const lines: string[] = [sb.spatial_setup];

  if (sb.environment_anchor && !sb.spatial_setup.includes(sb.environment_anchor)) {
    lines.push(`${sb.environment_anchor}.`);
  }

  lines.push(`Wearing ${sb.wardrobe_lock}.`);
  if (sb.pet_lock) lines.push(`With ${sb.pet_lock}.`);

  const allowedProps = sb.allowed_props ?? [];
  if (archetypeAllowsProp(input.archetypeId) && allowedProps.length > 0) {
    lines.push(`May hold: ${allowedProps.join(" or ")}.`);
  } else {
    lines.push("Empty hands, nothing held.");
  }

  return cleanList(lines);
}

// Wardrobe/animal lock as its own PromptPackage section (kept separate from `scene` per the
// PromptPackage shape) — always locked verbatim from sceneBrief, never invented (§7B "NO
// INVENTION RULE"). Not rendered as its own block in the Soul 2.0 profile (its content is folded
// into `scene`, see buildSceneSection above) but kept populated here for callers/tests that read
// `sections.appearance` directly.
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

// §7C — CAMERA / "SHOT / FRAMING / CAMERA" (Soul 2.0's item 1 — leads the prompt). Prompt
// Director picks ONE concrete camera behavior from the archetype/framing — no random technical
// jargon, no lens mm unless it's actually useful for this provider.
export function buildCameraSection(input: PromptDirectorInput): string[] {
  const lines: string[] = [input.slot.framing];
  if (isCloseUpArchetype(input)) {
    lines.push("close framing, face or detail fills a large part of the frame");
  } else if (input.slot.family === "environment") {
    lines.push("wide shot, subject embedded in environment");
  } else {
    lines.push("medium shot");
  }
  lines.push(input.sceneBrief.camera_language);
  lines.push(...firstFramePrepLines(input));
  return cleanList(lines);
}

// §7D — LIGHTING. Real, concrete formulations — never "cinematic glow" / "dramatic studio light".
export function buildLightingSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  return cleanList([sb.lighting_state, `${sb.time_of_day}, ${sb.weather_implied}`]);
}

// "AESTHETIC / EMOTIONAL DIRECTION" — Soul 2.0's item 5. Explicit medium/style + mood cues (per
// Higgsfield guidance: Soul 2.0 responds well to these), chosen from what the scene actually
// implies rather than a fixed list — never more than a handful of words.
export function buildAestheticSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  const lines = ["candid social-media realism"];
  lines.push(isCloseUpArchetype(input) ? "intimate, spontaneous energy" : "relaxed, natural body language");
  if (sb.time_of_day) lines.push(`${sb.time_of_day} mood`);
  return cleanList(lines);
}

// §7E — HUMAN REALISM / "MINIMAL REALISM CUES" — Soul 2.0's item 6. Deliberately capped at a
// handful of cues (2-4) rather than the full social-realism list — Soul 2.0 guidance is explicit
// that dumping every realism phrase on every shot is counter-productive. Close-up gets the
// stronger, face-specific set; a wide/full-body frame gets the lighter one.
export function buildRealismSection(input: PromptDirectorInput): string[] {
  if (isCloseUpArchetype(input)) {
    return cleanList(["natural skin texture", "visible pores", "subtle facial asymmetry", "real hair strands"]);
  }
  return cleanList(["natural skin texture", "realistic clothing folds", "natural phone exposure"]);
}

// §7F — MICRO IMPERFECTIONS. Only when the model/scene benefit from "real camera ≠ CGI render".
// Skipped for archetype families that don't read as phone-camera captures (kept conservative: on
// for subject/detail/bts families, which is where phone-camera imperfection reads as authentic;
// off for wide environment establishing shots where it adds nothing). Not rendered as its own
// block in the Soul 2.0 profile (folded into the realism cues above) but kept populated here for
// callers/tests that read `sections.imperfections` directly.
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
