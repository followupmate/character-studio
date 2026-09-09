import type { SceneBriefJson } from "@/lib/sceneBrief";

// VISUAL / HOOK / DISTRIBUTION EXPERIMENT — v1.
//
// Recovery Phase 1 answered its question. All five recovery reels cleared the 4.5s watch KPI and
// the watch ratio landed between 0.70 and 0.87 (measured 2026-09-09: 0.795 / 0.757 / 0.704 /
// 0.868 / 0.753). The motion layer is no longer the constraint.
//
// What did NOT move is reach: 24h reach across the same five reels was 44 / 24 / 19 / 28 / (not
// yet matured) against an August window that reached 155–445. A reel that holds 80% of a tiny
// audience is a retention success and a distribution failure, and those are different problems
// with different causes.
//
// So the next controlled variable is the VISUAL PRESENTATION and the first two seconds — the part
// of a reel a ranking system samples before anyone has chosen to watch it. This module defines the
// plan object for that experiment.
//
// THE INVARIANT, and the reason this is a separate type rather than more fields on SceneBrief:
// a VisualHookPlan may not change WHAT is in the scene. Not the character, not the location, not
// the wardrobe, not the allowed props, not the story arc. It controls how the existing scene is
// PRESENTED and how the first beat is shaped. Everything else stays where the recovery sprint left
// it, because an experiment that moves two layers at once measures neither.

export const VHD_VERSION = "v1";
export const VHD_TOTAL = 5;

/**
 * The visual register a reel leads with. Closed set: an open string would let the experiment drift
 * into "whatever the brief happened to say", and then five results could not be grouped.
 *
 * Each family names something that must ALREADY BE PRESENT in the scene brief — see
 * `validateMotifAgainstBrief`. The plan selects and amplifies a motif; it never invents one, which
 * is what would otherwise quietly rewrite the scene.
 */
export const MOTIF_FAMILIES = [
  /** A face close to the lens carries the frame. The recovery configuration — the control. */
  "intimate_face",
  /** A large, flat block of saturated colour behind the subject. */
  "bold_color",
  /** Hard directional light and real shadow shape doing the composition. */
  "hard_light_shadow",
  /** Real ambient life at depth — other people present, none of them sharp. */
  "social_depth",
  /** A strong repeating geometric element sharing dominance with the subject. */
  "graphic_environment",
] as const;
export type MotifFamily = (typeof MOTIF_FAMILIES)[number];

/** How much of the frame the face is asked to own. */
export const FACE_DOMINANCE = ["dominant", "balanced", "recessive"] as const;
export type FaceDominance = (typeof FACE_DOMINANCE)[number];

export const CONTRAST_LEVELS = ["low", "medium", "high"] as const;
export type ContrastLevel = (typeof CONTRAST_LEVELS)[number];

export const BACKGROUND_COMPLEXITY = ["empty", "simple", "textured", "populated"] as const;
export type BackgroundComplexity = (typeof BACKGROUND_COMPLEXITY)[number];

/** Whether anyone else exists in the world of the shot, and how. */
export const SOCIAL_PRESENCE = ["solo", "implied", "ambient"] as const;
export type SocialPresence = (typeof SOCIAL_PRESENCE)[number];

/**
 * The shape of the first beat. Each type resolves to a three-part structure in
 * lib/experiments/visualHookCompiler.ts: frame 0 tension -> first visible change -> payoff.
 */
export const HOOK_TYPES = [
  /** Eyes start off-lens and arrive. The recovery reels' beat — the control hook. */
  "gaze_turn",
  /** A held neutral face breaks into one small asymmetric expression. */
  "micro_expression",
  /** A shift of head or torso carries her eyes out of shadow and into the light. */
  "light_shift",
  /** Her attention is caught by the room, then returns to the lens. */
  "environment_reaction",
  /** One small readable hand action completes and she looks up. */
  "micro_action",
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export type ExperimentRole = "control" | "challenger";

/**
 * How the frame is cropped. `medium_graphic` exists only for graphic_environment, where the
 * environment legitimately shares the frame; it is still a close read, never an establishing shot.
 */
export const VHD_FRAMINGS = ["close", "close_medium", "medium_graphic"] as const;
export type VhdFraming = (typeof VHD_FRAMINGS)[number];

export interface VisualHookPlan {
  /** 1..5 — the experiment index, and the only identity this plan has. */
  experimentIndex: number;
  motifFamily: MotifFamily;
  framing: VhdFraming;
  faceDominance: FaceDominance;
  contrastLevel: ContrastLevel;
  backgroundComplexity: BackgroundComplexity;
  socialPresence: SocialPresence;
  hookType: HookType;
  /** When the first visible change begins. QA and report metadata — see the note below. */
  hookStartSec: number;
  /** When the payoff has landed. Never above 2.0. */
  payoffSec: number;
  experimentRole: ExperimentRole;
}

// hookStartSec / payoffSec are DELIBERATELY not written into the provider prompt as numbers.
//
// Two reasons, both concrete. First, lib/promptDirector/semanticValidator.ts reads the first
// duration-shaped token in a prompt as the clip length and rejects anything outside 6–8s, so
// "within 0.8s" would fail the auto-reel shape check — correctly, because it is genuinely
// ambiguous which number is the clip. Second, no i2v model this pipeline uses honours a sub-second
// timestamp; asked for one it renders the words, not the timing. The compiler encodes the same
// structure ordinally ("almost immediately", "before she settles"), which models do follow.
//
// The numbers stay on the plan because they are what the first-frame QA gate and the evaluation
// panel check against — a hook that was supposed to pay off by 2.0s and visibly lands at 4s is a
// finding, and it is only a finding if the intent was recorded.
export const VHD_PAYOFF_CEILING_SEC = 2.0;

/* ── The invariant ───────────────────────────────────────────────────────── */

/** The scene fields a VisualHookPlan is forbidden to influence. */
export const SCENE_FIELDS_PLAN_MAY_NOT_TOUCH = [
  "spatial_setup",
  "location_constraints",
  "wardrobe_lock",
  "allowed_props",
  "scene_entities",
  "pet_lock",
] as const;

/**
 * Proves the plan changed nothing it is not allowed to change.
 *
 * This is not decoration. The temptation with a visual experiment is to "just adjust the wall
 * colour" for the bold_color arm, and the moment that happens the arm is testing a different scene
 * rather than a different presentation of the same one — and the character's continuity quietly
 * drifts along with it. Called by the compiler on every build.
 */
export function assertSceneUnchanged(before: SceneBriefJson, after: SceneBriefJson): void {
  const diffs = SCENE_FIELDS_PLAN_MAY_NOT_TOUCH.filter(
    (f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)
  );
  if (diffs.length > 0) {
    throw new Error(
      `VisualHookPlan modified scene fields it may not touch: ${diffs.join(", ")}. ` +
        `A plan controls presentation and the first beat, nothing else.`
    );
  }
}

/**
 * A motif must already exist in the brief. Returns the reason it does not, or null.
 *
 * The test is deliberately lexical and deliberately strict: it reads the brief the model will read.
 * If a human cannot point at the words that make this scene a hard-light scene, neither can Soul V2.
 */
export function validateMotifAgainstBrief(motif: MotifFamily, brief: SceneBriefJson): string | null {
  const palette = brief.color_palette.join(" ").toLowerCase();
  const setup = `${brief.spatial_setup} ${brief.location_constraints.join(" ")}`.toLowerCase();
  const light = brief.lighting_state.toLowerCase();

  switch (motif) {
    case "intimate_face":
      // Nothing to require of the scene: an intimate face reads in any room. The work is in the
      // crop, and the crop is the plan's own business.
      return null;
    case "bold_color": {
      const SATURATED =
        /\b(cobalt|crimson|scarlet|emerald|electric|vivid|saturated|deep (?:green|blue|red|teal)|oxblood|ultramarine|chartreuse)\b/;
      if (!SATURATED.test(palette) && !SATURATED.test(setup)) {
        return "bold_color needs a saturated colour named in the scene's palette or setup — a plan may not repaint the room";
      }
      return null;
    }
    case "hard_light_shadow": {
      const HARD_LIGHT = /\b(hard|direct|slatted|shutter|blind|sharp-edged|raking)\b/;
      const SHADOW_CASTER = /\b(slatted|shutter|blind|hard shadow|sharp shadow|hard-edged shadow)\b/;
      if (!HARD_LIGHT.test(light) && !SHADOW_CASTER.test(setup)) {
        return "hard_light_shadow needs a hard/directional light source in lighting_state or a shadow-casting element in the setup";
      }
      return null;
    }
    case "social_depth": {
      if (!/\b(patrons|people|crowd|passers|diners|customers|others)\b/.test(setup)) {
        return "social_depth needs other people already present in the scene's setup or constraints";
      }
      return null;
    }
    case "graphic_environment": {
      const GEOMETRY = /\b(tile|tiles|tiled|grid|arch|arches|stripe|striped|repeating|colonnade|column|columns|panelled|chequer|checker)\b/;
      if (!GEOMETRY.test(setup)) {
        return "graphic_environment needs a repeating geometric element already in the setup";
      }
      return null;
    }
  }
}

/** Structural sanity on the plan itself, independent of any scene. */
export function validatePlan(plan: VisualHookPlan): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(plan.experimentIndex) || plan.experimentIndex < 1 || plan.experimentIndex > VHD_TOTAL) {
    errs.push(`experimentIndex must be 1..${VHD_TOTAL}, got ${plan.experimentIndex}`);
  }
  if (!(plan.hookStartSec >= 0)) errs.push("hookStartSec must be >= 0");
  if (!(plan.payoffSec > plan.hookStartSec)) errs.push("payoffSec must be after hookStartSec");
  if (plan.payoffSec > VHD_PAYOFF_CEILING_SEC) {
    errs.push(`payoffSec ${plan.payoffSec}s exceeds the ${VHD_PAYOFF_CEILING_SEC}s ceiling — the payoff is the experiment`);
  }
  // medium_graphic is the only framing that lets the environment share the frame, and it exists
  // for exactly one motif. Anywhere else it is a slow establishing shot wearing a different name.
  if (plan.framing === "medium_graphic" && plan.motifFamily !== "graphic_environment") {
    errs.push('framing "medium_graphic" is only valid for the graphic_environment motif');
  }
  if (plan.motifFamily === "social_depth" && plan.socialPresence !== "ambient") {
    errs.push('social_depth motif requires socialPresence "ambient" — the people are the motif');
  }
  if (plan.socialPresence === "ambient" && plan.backgroundComplexity !== "populated") {
    errs.push('socialPresence "ambient" requires backgroundComplexity "populated"');
  }
  return errs;
}

/** The jsonb block written to chs_media.visual_signature.visual_hook_experiment. */
export interface VhdMarker {
  version: string;
  index: number;
  motif_family: MotifFamily;
  hook_type: HookType;
  hook_start_sec: number;
  payoff_sec: number;
  experiment_role: ExperimentRole;
  experiment_total?: number;
  /**
   * Pipeline fields, not part of the experiment record. The generation route reads these to route
   * the video slot through the Kling chain and to hand Soul V2 its framing negatives, exactly as
   * the recovery marker does. Kept in the same object so a slot carries one marker, not two.
   */
  target_duration_sec?: number;
  negative_prompt?: string;
}

export function buildVhdMarker(plan: VisualHookPlan, extra?: Partial<VhdMarker>): VhdMarker {
  return {
    version: VHD_VERSION,
    index: plan.experimentIndex,
    motif_family: plan.motifFamily,
    hook_type: plan.hookType,
    hook_start_sec: plan.hookStartSec,
    payoff_sec: plan.payoffSec,
    experiment_role: plan.experimentRole,
    experiment_total: VHD_TOTAL,
    ...extra,
  };
}
