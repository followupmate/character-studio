/**
 * Phase 2 — reel recipes: `ootd_stop` and `grwm_loading`.
 *
 * A recipe is the complete, curated definition of one repeatable reel shape:
 *   - the motion clauses that plug into compileSimpleReel's seams (openingState, hookBeat, action,
 *     closingBeat, negativePrompt) — the compiler itself is NOT forked;
 *   - the pool of burned-in hook strings (lib/video/hookOverlay). Hook text comes ONLY from this
 *     pool: curated, lowercase, <= 6 words, validated by hookTextValidator in the test suite. It is
 *     never produced by an LLM, because a typo or a banned term burned into the pixels cannot be
 *     fixed after posting;
 *   - which scene action classes it can legitimately run on (FORMAT_REQUIRED_ACTIONS mirrors this);
 *   - the chs_shot_archetypes row it needs (id === recipe id; see the Phase 2 SQL migration).
 *
 * Feature gating lives in the callers: reel_recipes_v1 (character flag) / REEL_RECIPES_ENABLED env.
 */
import type { SceneBriefJson } from "@/lib/sceneBrief";
import type { ActionClass } from "@/lib/sceneSemantics";
import {
  compileSimpleReel,
  DEFAULT_REEL_NEGATIVES,
  type ReelFraming,
  type SimpleReelPrompt,
} from "./simpleReelCompiler";

export const REEL_RECIPE_IDS = ["ootd_stop", "grwm_loading"] as const;
export type ReelRecipeId = (typeof REEL_RECIPE_IDS)[number];

export interface ReelRecipe {
  /** Also the chs_shot_archetypes.id and chs_media.shot_archetype value. */
  id: ReelRecipeId;
  label: string;
  /** Scene action classes the recipe may run on. Anything else -> recipe is skipped for the day. */
  requiredActionClasses: ReadonlyArray<ActionClass>;
  framing: ReelFraming;
  durationSec: number;
  openingState: string;
  hookBeat: string;
  action: string;
  closingBeat: string;
  /** FULL replacement for the default negative prompt. */
  negativePrompt: string;
  /** Curated overlay strings. lowercase, <= 6 words, validated in reelRecipes.test.ts. */
  hookTextPool: ReadonlyArray<string>;
  /** Static action for lib/reelArchetypeAction.ts (start-frame pose prep). */
  archetypeAction: string;
  /** chs_shot_archetypes.guidance */
  archetypeGuidance: string;
  // ReelFormat-shaped fields (lib/reelFormats.ts) used by the discovery-mode deck framing.
  coverCue: string;
  videoDirective: string;
  overlayStyle: string;
}

export const REEL_RECIPES: Record<ReelRecipeId, ReelRecipe> = {
  ootd_stop: {
    id: "ootd_stop",
    label: "OOTD stop",
    requiredActionClasses: ["locomotion", "standing_still"],
    framing: "medium",
    durationSec: 8,
    // Mid-stride on purpose: image-to-video cannot "walk in" from outside the start frame, so the
    // start frame already catches her arriving. No sentence below may trip the validator's
    // locomotion rule (she walks / steps forward / strides forward) — it fires on stationary scenes.
    openingState: "mid-stride, arriving toward the camera",
    hookBeat: "She slows to a stop and her eyes find the lens.",
    action: "one hand smooths the front of her outfit once and her weight settles onto one hip",
    closingBeat: "She holds the pose, outfit fully readable, and the clip ends on a clean still frame.",
    negativePrompt: [
      "no speech",
      "no text",
      "no captions",
      "no watermark",
      "no zoom",
      "no cuts",
      "no jump cuts",
      "no scene change",
      "no outfit change",
      "no second person in frame",
      "no face morphing",
      "no sliding feet",
    ].join(", "),
    hookTextPool: [
      "ootd, one second",
      "stop scrolling, it’s the fit",
      "today’s fit, one take",
      "wait for the outfit",
      "how’s the fit",
      "the fit, no filter",
    ],
    archetypeAction: "she comes to a stop, one hand smoothing the front of her outfit as her eyes find the lens",
    archetypeGuidance:
      "OOTD stop — outfit-readable medium shot (knees up). She arrives into the frame mid-stride, slows to a stop and settles into one relaxed pose; wardrobe fully visible, face clearly readable, clean space in the top third for a text overlay. One take, no cuts.",
    coverCue:
      "Mid-stride arrival, outfit fully readable from the knees up, face visible and turned toward the lens. Clean negative space in the top third for the overlay.",
    videoDirective:
      "She arrives mid-stride, slows to a stop, one small outfit gesture, holds the pose and the look. One take, no cuts, ends on a clean still frame.",
    overlayStyle: "Short lowercase OOTD line — 'ootd, one second', 'how’s the fit'. Top third.",
  },
  grwm_loading: {
    id: "grwm_loading",
    label: "GRWM loading",
    requiredActionClasses: ["grooming", "gesture", "seated_still", "standing_still"],
    framing: "close_medium",
    durationSec: 8,
    openingState: "mid get-ready, one hand already raised toward her hair, looking toward the mirror just off camera",
    hookBeat: "Within the first second she glances to the lens as if to say it is still loading.",
    action: "she finishes one small get-ready touch and her shoulders drop into a satisfied half-smile",
    closingBeat: "She holds the look, almost ready, and the last frame matches the first so it loops.",
    negativePrompt: [...DEFAULT_REEL_NEGATIVES, "no outfit change", "no fast movement"].join(", "),
    hookTextPool: [
      "grwm loading…",
      "grwm, almost ready",
      "getting ready, slowly",
      "one more touch and done",
      "grwm, slow edition",
      "almost ready, almost",
    ],
    archetypeAction: "she finishes one small get-ready touch and her shoulders drop into a satisfied half-smile",
    archetypeGuidance:
      "GRWM loading — close-medium, mid get-ready (hair, jewellery, collar). One small finishing touch, a glance to the lens, a satisfied half-smile; the clip should read like a progress bar completing. Clean space in the top third for a text overlay.",
    coverCue:
      "Unfinished, in-process get-ready moment — hand raised to hair or collar, face visible, relaxed and real. Clean negative space in the top third for the overlay.",
    videoDirective:
      "One finishing touch, a glance to the lens, a satisfied half-smile — like a progress bar completing. 2 beats, loops on the half-smile.",
    overlayStyle: "Short lowercase GRWM line — 'grwm loading…'. Top third.",
  },
};

export const REEL_RECIPE_LIST: ReelRecipe[] = REEL_RECIPE_IDS.map((id) => REEL_RECIPES[id]);

export function getReelRecipe(id: string | null | undefined): ReelRecipe | undefined {
  return id && (REEL_RECIPE_IDS as readonly string[]).includes(id) ? REEL_RECIPES[id as ReelRecipeId] : undefined;
}

export function isReelRecipeId(id: string | null | undefined): id is ReelRecipeId {
  return !!getReelRecipe(id);
}

/** Recipes are on when the character has reel_recipes_v1 or REEL_RECIPES_ENABLED=true (kill switch: "false"). */
export function reelRecipesEnabled(flagOn: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const e = env.REEL_RECIPES_ENABLED;
  if (e === "false") return false;
  return e === "true" || flagOn;
}

/** Deterministic hook text: pool index advances once per full rotation of recipes. */
export function pickHookText(recipe: ReelRecipe, dayNumber: number | null | undefined): string {
  const n = Number.isFinite(dayNumber) ? Math.trunc(dayNumber as number) : 0;
  const step = Math.floor(Math.abs(n) / REEL_RECIPE_IDS.length);
  return recipe.hookTextPool[step % recipe.hookTextPool.length];
}

export function recipeSupportsActionClass(recipe: ReelRecipe, cls: ActionClass): boolean {
  return recipe.requiredActionClasses.includes(cls);
}

/** Persisted under chs_media.visual_signature.reel_recipe — read back by video-async. */
export interface ReelRecipeMarker {
  id: ReelRecipeId;
  hook_text: string;
  negative_prompt: string;
  target_duration_sec: number;
  /** Set by video-async: "applied" | "render_failed" | "needs_review" | "skipped". */
  overlay_status?: string;
  overlay_detail?: string;
}

export function readReelRecipeMarker(signature: unknown): ReelRecipeMarker | null {
  if (!signature || typeof signature !== "object") return null;
  const m = (signature as { reel_recipe?: unknown }).reel_recipe;
  if (!m || typeof m !== "object") return null;
  const r = m as Partial<ReelRecipeMarker>;
  if (!isReelRecipeId(r.id as string) || typeof r.hook_text !== "string" || !r.hook_text.trim()) return null;
  return {
    id: r.id as ReelRecipeId,
    hook_text: r.hook_text,
    negative_prompt: typeof r.negative_prompt === "string" ? r.negative_prompt : "",
    target_duration_sec: typeof r.target_duration_sec === "number" ? r.target_duration_sec : 8,
    ...(r.overlay_status ? { overlay_status: r.overlay_status } : {}),
    ...(r.overlay_detail ? { overlay_detail: r.overlay_detail } : {}),
  };
}

export interface RecipeReelInput {
  sceneBrief: SceneBriefJson;
  sceneLocation?: string | null;
  activityHint?: string | null;
  dayNumber?: number | null;
}

export interface CompiledRecipeReel extends SimpleReelPrompt {
  recipe: ReelRecipe;
  hookText: string;
  marker: ReelRecipeMarker;
}

/** Goes through compileSimpleReel's seams only; throws on semantic errors (retry logic keys on the message). */
export function compileRecipeReel(recipe: ReelRecipe, input: RecipeReelInput): CompiledRecipeReel {
  const compiled = compileSimpleReel({
    sceneBrief: input.sceneBrief,
    sceneLocation: input.sceneLocation,
    activityHint: input.activityHint,
    dayNumber: input.dayNumber,
    durationSec: recipe.durationSec,
    framing: recipe.framing,
    openingState: recipe.openingState,
    hookBeat: recipe.hookBeat,
    action: recipe.action,
    closingBeat: recipe.closingBeat,
    negativePrompt: recipe.negativePrompt,
  });
  if (!recipeSupportsActionClass(recipe, compiled.semantics.actionClass)) {
    throw new Error(
      `Semantic validation failed for reel_video (${recipe.id}): [format_coherence] recipe requires an action class in [${recipe.requiredActionClasses.join(", ")}] but this scene's action class is "${compiled.semantics.actionClass}"`
    );
  }
  if (compiled.validation.errors.length > 0) {
    throw new Error(
      `Semantic validation failed for reel_video (${recipe.id}): ${compiled.validation.errors.map((e) => `[${e.rule}] ${e.detail}`).join(" | ")}`
    );
  }
  const hookText = pickHookText(recipe, input.dayNumber);
  return {
    ...compiled,
    recipe,
    hookText,
    marker: {
      id: recipe.id,
      hook_text: hookText,
      negative_prompt: compiled.negativePrompt,
      target_duration_sec: recipe.durationSec,
    },
  };
}
