import type { SceneBriefJson } from "@/lib/sceneBrief";
import {
  compileSimpleReel,
  type ReelFraming,
  type SimpleReelPrompt,
  START_FRAME_FRAMING_NEGATIVES,
} from "@/lib/recovery/simpleReelCompiler";
import {
  assertSceneUnchanged,
  validateMotifAgainstBrief,
  validatePlan,
  type BackgroundComplexity,
  type ContrastLevel,
  type FaceDominance,
  type HookType,
  type MotifFamily,
  type SocialPresence,
  type VhdFraming,
  type VisualHookPlan,
} from "./visualHookPlan";

// VHD v1 — the two compilers.
//
//   VisualHookPlan + SceneBrief -> start-frame prompt (Higgsfield Soul V2)
//   VisualHookPlan + SceneBrief -> hook beats -> the EXISTING recovery motion compiler
//
// The motion compiler is not rewritten and not forked. lib/recovery/simpleReelCompiler.ts stays
// the single source of the motion prompt's shape; this file only decides what goes into its three
// variable slots (opening state, hook beat, action) and hands them over. Omit a hook and the
// recovery reels compile byte-for-byte as they did — asserted in visualHookCompiler.test.ts.

/* ── Hook structure ──────────────────────────────────────────────────────────
 *
 * The required shape is: frame 0 carries visible tension, the first change is under way almost at
 * once, and the payoff has landed inside two seconds. One main action, still.
 *
 * Each hook type resolves to three clauses:
 *   openingState — the frame-0 tension, and also what the start frame is composed to show
 *   hookBeat     — the first visible change AND its payoff, in one sentence
 *   payoffAction — the single main action the reel is actually about
 *
 * The timings are ordinal, never numeric. See the note in visualHookPlan.ts: a sub-second figure
 * in the prompt is read by the auto-reel shape validator as the clip length, and no i2v model in
 * this pipeline honours one anyway.
 */
export interface HookBeats {
  openingState: string;
  hookBeat: string;
  payoffAction: string;
}

export const HOOK_BEATS: Record<HookType, HookBeats> = {
  gaze_turn: {
    // "looking" is load-bearing: compileSimpleReel suppresses its own gaze clause when the opening
    // state already states where the eyes are, so the prompt never stacks two of them.
    openingState: "close to the lens, looking away to one side and holding it there",
    hookBeat: "Almost immediately her eyes travel back, find the lens, and stay there.",
    payoffAction: "her hand comes up and she adjusts the thin gold chain at her collarbone",
  },
  micro_expression: {
    openingState: "close to the lens, already looking straight into it, her face completely still",
    hookBeat: "Almost immediately the stillness breaks and one corner of her mouth lifts before the other.",
    payoffAction: "the small asymmetric smile finishes and her eyes narrow very slightly with it",
  },
  light_shift: {
    openingState: "close to the lens, half of her face in shadow, looking down and away from the light",
    hookBeat: "Almost immediately she shifts her head and shoulders a few degrees and the hard edge of light crosses her eyes.",
    payoffAction: "her chin settles and her eyes come up into the light, straight to the lens",
  },
  environment_reaction: {
    openingState: "close to the lens, looking off to one side into the room",
    hookBeat: "Almost immediately something further that way catches her, and her eyebrows lift a fraction.",
    payoffAction: "her eyes come back and settle on the lens",
  },
  micro_action: {
    openingState: "close to the lens, looking down at her own hand, already raised toward her collarbone",
    hookBeat: "Almost immediately the movement is under way and reads clearly.",
    payoffAction: "her fingers settle the thin gold chain at her collarbone and her eyes come up to the lens",
  },
};

/* ── Start frame: plan -> Soul V2 ────────────────────────────────────────── */

const CROP_OPENING: Record<VhdFraming, string> = {
  close:
    "Vertical 9:16 CLOSE portrait, chest-up: her head and shoulders fill the frame, shot from just below the collarbone up.",
  close_medium:
    "Vertical 9:16 CHEST-UP portrait: framed from just below the chest, her head and upper torso fill the frame.",
  // Still not an establishing shot. The frame opens by exactly one notch so the repeating geometry
  // behind her is legible as a pattern rather than as wallpaper, and it closes at the waist.
  medium_graphic:
    "Vertical 9:16 WAIST-UP portrait: framed at the waist, she is centred and close, with the wall behind her filling the rest of the frame.",
};

const CROP_CLOSING: Record<VhdFraming, string> = {
  close: "Head-and-shoulders crop. The frame ends at the chest. No waist, no hips, no legs, no knees, no feet.",
  close_medium: "Chest-up crop. The frame ends just below the chest. No hips, no legs, no knees, no lower legs, no feet.",
  medium_graphic: "Waist-up crop. The frame ends at the waist. No hips below the waistband, no legs, no knees, no feet.",
};

const FACE_DOMINANCE_TEXT: Record<FaceDominance, string> = {
  dominant:
    "Her face is the dominant element and fills roughly the top third of the frame — eyes sharp and clearly readable at phone size.",
  balanced:
    "Her face and the element behind her share the frame, but her eyes are the sharpest thing in it and are clearly readable at phone size.",
  recessive:
    "The scene leads and she sits inside it, but her face stays sharp and her eyes stay readable at phone size.",
};

const MOTIF_TEXT: Record<MotifFamily, string> = {
  intimate_face: "Nothing competes with her face — the frame is her, close, and very little else.",
  bold_color:
    "One large flat block of the scene's saturated wall colour fills the frame behind her, unbroken and evenly lit, so the colour reads instantly as the first thing in the shot.",
  hard_light_shadow:
    "Hard-edged light and real shadow do the composition: a clear, sharp-edged shape of light falls across her and the surface behind her, with the dark left genuinely dark.",
  social_depth:
    "Real depth behind her — the room continues past her with other people present in it, all of them soft and none of them recognisable, so the shot reads as a populated place rather than an empty set.",
  graphic_environment:
    "The repeating geometry of the surface behind her is the second subject: the pattern runs straight and unbroken across the frame, square to camera, so it reads as a strong graphic shape.",
};

const CONTRAST_TEXT: Record<ContrastLevel, string> = {
  low: "Low contrast: soft, even falloff, no crushed shadow, no blown highlight.",
  medium: "Medium contrast: a clear light side and shadow side on her face, both still holding detail.",
  high: "High contrast: bright highlights and deep shadow in the same frame, with the shadow edge sharp rather than feathered.",
};

const BACKGROUND_TEXT: Record<BackgroundComplexity, string> = {
  empty: "The background is one clean, uninterrupted surface. Nothing else is in it.",
  simple: "The background is soft and out of focus, and holds at most one recognisable shape.",
  textured: "The background is sharp enough for its surface pattern to read, but carries no objects and no clutter.",
  populated: "The background is out of focus and has movement in it, well behind her.",
};

const SOCIAL_TEXT: Record<SocialPresence, string> = {
  solo: "She is alone in the frame.",
  implied: "She is alone in the frame, though the place is obviously one other people use.",
  ambient: "Only one sharp face in the frame — hers. Everyone else is blurred, in the background, and not interacting with her.",
};

const MOTIF_NEGATIVES: Record<MotifFamily, string[]> = {
  intimate_face: ["busy background", "background objects", "second subject"],
  bold_color: ["muted colours", "desaturated", "patterned wall", "gradient wall", "washed out"],
  hard_light_shadow: ["flat lighting", "soft even light", "diffused light", "no shadow", "overcast"],
  social_depth: ["second sharp face", "sharp background faces", "empty room", "companion beside her"],
  graphic_environment: ["warped pattern", "crooked lines", "skewed perspective", "irregular grid"],
};

/**
 * Text and typography, refused on both sides of the prompt.
 *
 * Generators cannot spell. Every legible word one of them produces is a defect that reaches the
 * feed, and a hook made of rendered lettering is a hook the model was always going to get wrong.
 */
export const NO_TYPOGRAPHY_NEGATIVES = [
  "text",
  "lettering",
  "typography",
  "caption",
  "subtitle",
  "watermark",
  "logo",
  "signage",
  "numbers",
  "handwriting",
];

/**
 * Internal workflow language that must never reach a provider. The video prompt is already checked
 * for this by the semantic validator's meta-leakage rule; the start frame has no such check, so it
 * gets one here.
 */
const META_LANGUAGE = /\b(reel_start_frame|reel_video|story_bts|carousel_\d|VisualHookPlan|experiment|control arm|challenger|Soul V2|Higgsfield|Kling|Seedance|motif_family|hook_type|VHD)\b/i;

export function findMetaLanguage(prompt: string): string | null {
  return prompt.match(META_LANGUAGE)?.[0] ?? null;
}

export interface VisualHookStartFrame {
  prompt: string;
  negativePrompt: string;
}

/**
 * Translates a VisualHookPlan into Soul V2 instructions.
 *
 * Structure carried over from the recovery start frame, where it was learned the expensive way:
 * the crop is stated FIRST, the room is explicitly demoted to background, and the crop is restated
 * LAST. Stated once in the middle, Soul 2 returned a full-body shot with a small face — which is
 * the slow-establishing failure the whole thesis is against, since a viewer can only be looked at
 * in the first second if the face is large in the frame.
 */
export function compileVisualHookStartFrame(plan: VisualHookPlan, brief: SceneBriefJson): VisualHookStartFrame {
  const planErrors = validatePlan(plan);
  if (planErrors.length > 0) throw new Error(`VisualHookPlan #${plan.experimentIndex} invalid: ${planErrors.join("; ")}`);
  const motifProblem = validateMotifAgainstBrief(plan.motifFamily, brief);
  if (motifProblem) throw new Error(`VisualHookPlan #${plan.experimentIndex}: ${motifProblem}`);

  const beats = HOOK_BEATS[plan.hookType];

  const prompt = [
    CROP_OPENING[plan.framing],
    FACE_DOMINANCE_TEXT[plan.faceDominance],
    MOTIF_TEXT[plan.motifFamily],
    // The start frame IS the hook's frame 0. If it shows a resolved, settled pose, the video has
    // nothing to resolve and the first second is spent arriving at a starting point.
    `She is ${beats.openingState}. Face clearly visible and unobscured.`,
    `Wearing (upper body only in frame): ${brief.wardrobe_lock}.`,
    `Background: ${brief.spatial_setup}`,
    BACKGROUND_TEXT[plan.backgroundComplexity],
    SOCIAL_TEXT[plan.socialPresence],
    `Light: ${brief.lighting_state}. ${brief.time_of_day.replace(/_/g, " ")}.`,
    CONTRAST_TEXT[plan.contrastLevel],
    // Readability is the point of the whole arm: a frame that needs a second to parse has already
    // lost the viewer it was built for.
    "The whole frame reads in a glance on a phone screen — one subject, one idea, nothing to decode.",
    "Real phone photo, natural skin texture, no beauty filter. No lettering, no signage and no numbers anywhere in the frame.",
    CROP_CLOSING[plan.framing],
  ].join(" ");

  const meta = findMetaLanguage(prompt);
  if (meta) throw new Error(`start frame #${plan.experimentIndex} leaked internal language: "${meta}"`);

  const negativePrompt = [...START_FRAME_FRAMING_NEGATIVES.split(", "), ...NO_TYPOGRAPHY_NEGATIVES, ...MOTIF_NEGATIVES[plan.motifFamily]]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");

  return { prompt, negativePrompt };
}

/* ── Motion: plan -> the existing recovery compiler ──────────────────────── */

/**
 * `medium_graphic` has no counterpart in the recovery compiler's framing vocabulary and is not
 * being added to it — the motion prompt only needs to say the camera does not move, and the actual
 * crop is fixed by the start frame the video is generated FROM.
 */
export function toReelFraming(framing: VhdFraming): ReelFraming {
  return framing === "close" ? "close" : "close_medium";
}

export interface VisualHookReelInput {
  plan: VisualHookPlan;
  brief: SceneBriefJson;
  durationSec: number;
  /** Replaces the hook type's default payoff action when the scene calls for a specific one. */
  action?: string;
}

/**
 * Builds the motion prompt through lib/recovery/simpleReelCompiler.ts.
 *
 * The plan supplies the three variable clauses and nothing else; the shape, the loop line, the
 * duration line, the negatives and the full semantic validation all stay where they were.
 */
export function compileVisualHookReel(input: VisualHookReelInput): SimpleReelPrompt {
  const { plan, brief, durationSec } = input;

  const planErrors = validatePlan(plan);
  if (planErrors.length > 0) throw new Error(`VisualHookPlan #${plan.experimentIndex} invalid: ${planErrors.join("; ")}`);
  const motifProblem = validateMotifAgainstBrief(plan.motifFamily, brief);
  if (motifProblem) throw new Error(`VisualHookPlan #${plan.experimentIndex}: ${motifProblem}`);

  const beats = HOOK_BEATS[plan.hookType];
  const before = JSON.parse(JSON.stringify(brief)) as SceneBriefJson;

  const compiled = compileSimpleReel({
    sceneBrief: brief,
    dayNumber: plan.experimentIndex,
    durationSec,
    framing: toReelFraming(plan.framing),
    openingState: beats.openingState,
    hookBeat: beats.hookBeat,
    action: input.action?.trim() || beats.payoffAction,
  });

  // The invariant, checked rather than asserted in prose.
  assertSceneUnchanged(before, brief);

  return compiled;
}
