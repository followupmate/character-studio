import type { SceneBriefJson } from "@/lib/sceneBrief";
import { resolveSceneSemantics, type ActionClass, type SceneSemantics } from "@/lib/sceneSemantics";
import { validateSceneCoherence, type SemanticValidationResult } from "@/lib/promptDirector/semanticValidator";
import { REEL_DEFAULT_DURATION_SEC, REEL_DURATION_MAX_SEC, REEL_DURATION_MIN_SEC } from "./reelDuration";

// RECOVERY phase 4 — the simple, scene-aware reel compiler.
//
// Prompt Director v1 stops driving AUTO-GENERATED reel motion here. It stays available for the UI
// and for manual experiments; the automatic daily reel comes through this file.
//
// The rule is one line: ONE SITUATION -> ONE IMMEDIATELY READABLE ACTION -> ONE MICRO-REWARD
// INSIDE 2–3 SECONDS.
//
// The reference shape is Day 78 (measured: 6.28s average watch on an 8.13s file, ratio 0.772 —
// the best reel in the window on both):
//   a woman sits on a bed -> her gaze drops -> her eyes come back to the lens -> she touches the
//   chain at her collarbone -> loop.
// That is the entire prompt. Not fifteen rules on top of it. Day 76 (4.92s / 8.13s, ratio 0.605)
// and Day 71 (6.36s / 8.13s, ratio 0.783) have the same shape. What the collapsed reels have instead is a stack of layers — depth doctrine, generic
// micro-motion, physics, environment boilerplate, audio boilerplate, a framing block full of
// internal workflow language — and one action buried inside it, or three offered as alternatives.
//
// Deliberately NOT optimised for the three surviving archetypes. The between-archetype differences
// are smaller than the day-to-day noise (walking_motion: 337, 227, 243, 265 views — mid-field; the
// single best post in the whole window was gesture_motion), so this optimises for the PROPERTIES
// that separate the winners and leaves the archetype pool wide.

// Duration constants live in ./reelDuration so the semantic validator can share them without a
// circular import. Re-exported here so existing importers keep working unchanged.
export {
  REEL_DURATION_MIN_SEC,
  REEL_DURATION_MAX_SEC,
  REEL_DEFAULT_DURATION_SEC,
  REEL_DURATION_GATE,
} from "./reelDuration";

export type ReelFraming = "close" | "close_medium";

const FRAMING_TEXT: Record<ReelFraming, string> = {
  close: "Close on her, camera static at eye height.",
  close_medium: "Close-medium on her, camera static at chest height.",
};

// One readable action per action class. Every entry is something a person can do WITHOUT moving
// through space and WITHOUT an object the scene might not contain — the two failure modes that
// produced "she walks" in a car seat and "glass tilts, liquid follows gravity" in a pilates studio.
// The wardrobe-anchored variants are always legal: the thin gold chain and her own hair are in
// every wardrobe_lock this character has ever had (sacred details), so they cannot be invented.
const ACTION_BANK: Record<ActionClass, string[]> = {
  gesture: [
    "her hand comes up and she adjusts the thin gold chain at her collarbone",
    "she tucks one strand of hair back behind her ear",
    "she tilts her head a few degrees and lets it settle",
  ],
  seated_still: [
    "her hand comes up and she adjusts the thin gold chain at her collarbone",
    "she shifts her weight once and settles deeper into the seat",
    "she tucks one strand of hair back behind her ear",
  ],
  standing_still: [
    "she draws one slow breath and her shoulders drop",
    "her hand comes up and she adjusts the thin gold chain at her collarbone",
    "she tucks one strand of hair back behind her ear",
  ],
  reclining: [
    "she settles back a fraction and lets her shoulders drop",
    "her hand comes up and she adjusts the thin gold chain at her collarbone",
    "she turns her chin a few degrees toward the light",
  ],
  grooming: [
    "she smooths one strand of hair back into place",
    "she runs a fingertip along her jaw once and stops",
  ],
  exercise: [
    "she rolls her shoulders back once and settles",
    "she draws one slow breath and her chest lowers",
  ],
  // Locomotion is allowed to move, but ONE step — not "continuing forward motion", which is an
  // instruction to leave the frame.
  locomotion: [
    "she takes one unhurried step forward and stops",
    "she turns a quarter toward the camera and stops",
  ],
  // eating_drinking is the only class that references an object, and compileSimpleReel() refuses
  // to use it unless the scene brief actually contains a drinking vessel.
  eating_drinking: [
    "she lifts the cup, takes one slow sip, and sets it back down",
  ],
  swimming: [
    "she lifts one hand out of the water and lets it fall back",
  ],
  other: [
    "her hand comes up and she adjusts the thin gold chain at her collarbone",
    "she tucks one strand of hair back behind her ear",
  ],
};

const DRINKING_VESSEL = /\b(glass|cup|mug|coupe|tumbler|espresso|wine|champagne|coffee)\b/i;

export interface SimpleReelInput {
  sceneBrief: SceneBriefJson;
  /** chs_story_days.location */
  sceneLocation?: string | null;
  /** situation.activity / narrative — what she is actually doing today. */
  activityHint?: string | null;
  /** chs_story_days.day_number — seeds the deterministic action rotation. */
  dayNumber?: number | null;
  /** Explicit override from the operator. Skips the action bank entirely. */
  action?: string;
  /** 6, 7 or 8. Anything else is rejected. */
  durationSec?: number;
  framing?: ReelFraming;
  /**
   * The opening-state clause, e.g. "sitting on the edge of the unmade bed". Derived from the scene
   * brief when absent. Never invents furniture — falls back to a neutral clause.
   */
  openingState?: string;
  /**
   * Replaces the default eye-contact beat sentence.
   *
   * The default IS a hook — a gaze turn — and it is the right one for every recovery reel, which
   * is why it was hardcoded. The visual/hook experiment (lib/experiments/) needs four other hook
   * shapes, and a light-shift or environment-reaction beat cannot be expressed by a sentence that
   * always says the eyes arrive first. This is the seam for that, and nothing else about the
   * compiler changes: omit it and the output is byte-identical to before.
   */
  hookBeat?: string;
  /**
   * Replaces the two closing sentences ("She holds the look." and the loop line).
   *
   * Same seam as `hookBeat`, and for the same reason: the loop line is correct for the recovery
   * reels and is not a goal anywhere else. Loop closure was explicitly demoted on 2026-09-04 after
   * the end-frame lock produced a frozen head on a moving body — the loop delta improved tenfold
   * while the motion got visibly worse. It is a diagnostic, never a gate, and an experiment that
   * is not testing looping should not be spending prompt on it. Omit this and the output is
   * byte-identical to before.
   */
  closingBeat?: string;
}

/** The gaze-turn beat every recovery reel uses. Exported so the experiment layer can name the
 *  control condition rather than re-typing it and hoping the two stay the same. */
export const DEFAULT_HOOK_BEAT = "Within the first second her eyes find the lens and stay there.";

/** The closing pair every recovery reel uses. Exported for the same reason DEFAULT_HOOK_BEAT is. */
export const DEFAULT_CLOSING_BEATS = [
  "She holds the look.",
  "The last frame matches the first so it loops seamlessly.",
];

export interface SimpleReelPrompt {
  prompt: string;
  negativePrompt: string;
  durationSec: number;
  framing: ReelFraming;
  action: string;
  semantics: SceneSemantics;
  validation: SemanticValidationResult;
}

// Deterministic rotation so consecutive days do not repeat the same beat, without introducing an
// LLM call or a random seed that makes the output untestable.
function pickFromBank(bank: string[], dayNumber: number | null | undefined): string {
  const n = Number.isFinite(dayNumber) ? Math.trunc(dayNumber as number) : 0;
  return bank[((n % bank.length) + bank.length) % bank.length];
}

export function deriveAction(semantics: SceneSemantics, dayNumber: number | null | undefined): string {
  let cls = semantics.actionClass;
  // Never emit the drinking beat unless the vessel genuinely exists in the scene.
  if (cls === "eating_drinking" && !DRINKING_VESSEL.test(semantics.entityText)) cls = "gesture";
  return pickFromBank(ACTION_BANK[cls] ?? ACTION_BANK.other, dayNumber);
}

// The opening state comes out of the scene brief's own spatial setup, so it can only name things
// the lock already contains. When nothing usable is there we say nothing rather than invent a sofa.
export function deriveOpeningState(brief: SceneBriefJson, semantics: SceneSemantics): string {
  const setup = (brief.spatial_setup ?? "").toLowerCase();
  if (semantics.actionClass === "reclining") return "reclined back, close to the lens";
  if (semantics.actionClass === "seated_still") {
    if (/\bbed\b/.test(setup)) return "sitting on the edge of the bed, close to the lens";
    return "seated, close to the lens";
  }
  if (semantics.actionClass === "locomotion") return "mid-step, close to the lens";
  return "close to the lens";
}

/**
 * Builds the whole prompt. One paragraph, no section headers, no labels — every one of those is a
 * layer the model has to read past before it reaches the action.
 */
export function compileSimpleReel(input: SimpleReelInput): SimpleReelPrompt {
  const durationSec = input.durationSec ?? REEL_DEFAULT_DURATION_SEC;
  if (durationSec < REEL_DURATION_MIN_SEC || durationSec > REEL_DURATION_MAX_SEC) {
    throw new Error(
      `Recovery reel duration must be ${REEL_DURATION_MIN_SEC}–${REEL_DURATION_MAX_SEC}s, got ${durationSec}s`
    );
  }

  const semantics = resolveSceneSemantics(input.sceneBrief, {
    sceneLocation: input.sceneLocation,
    activityHint: input.activityHint,
  });

  const framing: ReelFraming = input.framing ?? "close_medium";
  const action = input.action?.trim() || deriveAction(semantics, input.dayNumber);
  const openingState = input.openingState?.trim() || deriveOpeningState(input.sceneBrief, semantics);

  // The eye-contact beat is the whole retention mechanism and it is FIRST, not eventual. Day 78's
  // 6.02s came from a viewer being looked at inside the first second.
  // The opening clause states where her gaze starts — off camera — because the eye-contact beat
  // only reads as a beat if there is somewhere for the eyes to come FROM. An openingState that
  // already says where she is looking supplies its own, so we do not stack two gaze clauses.
  const gazeAlreadyStated = /\blook(?:ing|s)?\b|\bgaze\b/i.test(openingState);
  const prompt = [
    FRAMING_TEXT[framing],
    gazeAlreadyStated ? `She starts ${openingState}.` : `She starts ${openingState}, looking just off camera.`,
    input.hookBeat?.trim() || DEFAULT_HOOK_BEAT,
    `${action.charAt(0).toUpperCase()}${action.slice(1)}.`,
    ...(input.closingBeat?.trim() ? [input.closingBeat.trim()] : DEFAULT_CLOSING_BEATS),
    `${durationSec}s, vertical 9:16.`,
  ].join(" ");

  // Kept out of the positive prompt on purpose — the point of this compiler is that the positive
  // prompt contains the shot and nothing else.
  const negativePrompt = [
    "no speech",
    "no text",
    "no captions",
    "no watermark",
    "no camera movement",
    "no zoom",
    "no cuts",
    "no second person in frame",
    "no face morphing",
  ].join(", ");

  const validation = validateSceneCoherence({
    brief: input.sceneBrief,
    prompt,
    sceneLocation: input.sceneLocation,
    activityHint: input.activityHint,
    enforceAutoReelShape: true,
  });

  return { prompt, negativePrompt, durationSec, framing, action, semantics, validation };
}

/**
 * The Reel 1 "firestarter" shape, specified exactly. Kept as its own function rather than as a
 * config row because it is a named, agreed deliverable and the shape must not drift.
 */
export function compileFirestarterReel(input: Omit<SimpleReelInput, "action" | "openingState">): SimpleReelPrompt {
  const base = compileSimpleReel({
    ...input,
    framing: input.framing ?? "close_medium",
    durationSec: input.durationSec ?? REEL_DEFAULT_DURATION_SEC,
    openingState: "close to the lens, looking away to one side",
    action: "a very slight asymmetric smile starts, and her hand comes up to adjust a strand of hair and the thin gold chain at her collarbone",
  });
  return base;
}

/**
 * The start frame for an image-to-video recovery reel.
 *
 * Same discipline as the motion prompt: what is in the room, what she is wearing, where the light
 * comes from, and the pose the motion continues from. Nothing else — no depth doctrine, no realism
 * boilerplate, no identity paragraph (the Soul reference carries identity, and restating it wastes
 * a short prompt's whole budget).
 *
 * Two hard requirements, both learned from the first real generation (2026-09-04):
 *
 * 1. THE FACE. This frame is the identity anchor the video animates from, and a cropped, headless
 *    or face-away frame makes the video model invent a different person.
 *
 * 2. THE CROP. The first attempt asked for "close-medium portrait" once, then spent three lines
 *    describing the room — and Soul 2 rendered a full-body shot from the knees up, with the face
 *    a small fraction of the frame. That is the slow-establishing failure the whole recovery
 *    thesis is against: Day 78 works because a viewer is LOOKED AT inside the first second, which
 *    only reads if the face is large in frame. So the crop is stated first, the location is
 *    explicitly demoted to background, and the crop is restated last, where a prompt's final
 *    clause carries weight.
 */
/**
 * Framing negatives for the start frame. Soul V2 exposes no crop or zoom parameter — the API takes
 * prompt, negative_prompt, aspect_ratio and the Soul id, and nothing else — so the negative prompt
 * is the only lever left once the positive prompt has said "waist-up crop" twice and still come
 * back with a full-body shot (which is exactly what happened on the first two attempts).
 */
export const START_FRAME_FRAMING_NEGATIVES = [
  "full body",
  "full-length shot",
  "wide shot",
  "long shot",
  "legs visible",
  "knees visible",
  "lower legs",
  "thighs visible",
  "feet visible",
  "distant subject",
  "small face",
  "subject far from camera",
  "cluttered background",
].join(", ");

export function compileRecoveryStartFrame(input: {
  sceneBrief: SceneBriefJson;
  framing?: ReelFraming;
  /** The pose the motion begins from — must agree with the motion prompt's opening clause. */
  openingState?: string;
}): string {
  const b = input.sceneBrief;
  const framing = input.framing ?? "close_medium";
  const pose = input.openingState?.trim() || "close to the lens, looking away to one side";
  const crop =
    framing === "close"
      ? "Vertical 9:16 CLOSE portrait, chest-up: her head and shoulders fill the frame, shot from just below the collarbone up."
      : "Vertical 9:16 CHEST-UP portrait: framed from just below the chest, her head and upper torso fill the frame.";
  return [
    crop,
    // Stated as a proportion, not a label. "Close-medium" is a word a model can satisfy loosely;
    // "her face fills roughly the top third" is a measurement it can hit.
    "Her face is the dominant element and fills roughly the top third of the frame — eyes sharp, clearly readable at phone size.",
    `She is ${pose}. Face clearly visible and unobscured, turned toward the lens.`,
    `Wearing (upper body only in frame): ${b.wardrobe_lock}`,
    // The seated posture still has to read, or the motion prompt's opening state contradicts the
    // frame it is animating from.
    "Her seated posture still reads — shoulders and the line of her back show she is sitting, not standing.",
    `Soft, out-of-focus background context only: ${b.spatial_setup}`,
    `Light: ${b.lighting_state}. ${b.time_of_day.replace(/_/g, " ")}.`,
    "Real phone photo, natural skin texture, no beauty filter.",
    framing === "close"
      ? "Head-and-shoulders crop. The frame ends at the chest. No waist, no hips, no legs, no knees, no feet."
      : "Chest-up crop. The frame ends just below the chest. No hips, no legs, no knees, no lower legs, no feet.",
  ].join(" ");
}
