import {
  AUDIO_CLASSES_BY_LOCATION,
  AUDIO_PHRASE_CLASSES,
  MANIPULABLE_OBJECTS,
  STATIONARY_ACTION_CLASSES,
  resolveSceneSemantics,
  type SceneSemantics,
  type SceneSemanticsSource,
} from "@/lib/sceneSemantics";
import { plannedActionForReelArchetype } from "@/lib/reelArchetypeAction";

// RECOVERY phase 3 — LAYER 1: deterministic semantic checks. No LLM, no network.
//
// The existing lib/promptDirector/validator.ts checks a prompt against ITSELF and reported
// errors: [] / warnings: [] on every reel in the Days 88–93 window. These checks compare the
// prompt against the SCENE BRIEF, which is where all six contradictions actually live.
//
// Severity contract: `error` blocks generation. `warning` is recorded and, for the speech case,
// carries an automatic removal instruction. Nothing silently passes — see logSemanticValidation().

export type SemanticViolationType = "prop" | "action" | "format" | "audio" | "structure" | "speech";

export interface SemanticViolation {
  type: SemanticViolationType;
  severity: "error" | "warning";
  rule: string;
  detail: string;
}

export interface SemanticValidationResult {
  errors: SemanticViolation[];
  warnings: SemanticViolation[];
  /** Resolved scene classes, echoed so callers/logs can see WHAT the prompt was judged against. */
  semantics: SceneSemantics;
  /** Layer-1 sanitizer output: the prompt with warning-level layers stripped (speech). */
  sanitizedPrompt?: string;
}

export interface SemanticValidationInput {
  /** scene_brief JSON (the structured fields are optional — see resolveSceneSemantics). */
  brief: SceneSemanticsSource;
  /** The FINAL compiled prompt text, exactly as it would be sent to the provider. */
  prompt: string;
  /** chs_media.shot_archetype for this slot. */
  archetypeId?: string | null;
  /** chs_story_days.location — often more explicit about the KIND of place than spatial_setup. */
  sceneLocation?: string | null;
  /** Today's activity text (situation.activity / narrative), when available. */
  activityHint?: string | null;
  /** The reel format applied to this slot (lib/reelFormats.ts id), when one was. */
  reelFormatId?: string | null;
  /**
   * Auto-generated reel slots must obey the recovery shape rules (one action, 6–7s, no overlay
   * text, no boilerplate). Manual/UI experiments are checked for coherence but not for shape.
   */
  enforceAutoReelShape?: boolean;
}

/* ── Rule 1: format coherence ─────────────────────────────────────────────────
 * The reel format was picked by pickReelFormat(day_number) — a pure rotation with no knowledge of
 * the scene, which is how an ASMR format landed on a walking scene and GRWM logic on a travel
 * moment. A format must be derivable from the scene, not from the calendar.
 */
export const FORMAT_REQUIRED_ACTIONS: Record<string, { actions: ReadonlyArray<string>; why: string }> = {
  asmr_satisfying: {
    actions: ["gesture", "eating_drinking", "grooming"],
    why: "ASMR/satisfying needs a close, repeatable tactile action the subject performs in place",
  },
  grwm: {
    actions: ["grooming", "gesture"],
    why: "GRWM needs an actual getting-ready action",
  },
  reveal_transition: {
    actions: ["gesture", "grooming", "locomotion"],
    why: "a reveal needs a before/after state change the subject performs",
  },
  // POV, wait_for_it, romanticize and relatable_confession impose no action requirement — they are
  // framing/expression shapes that work over any action class.
};

function checkFormatCoherence(input: SemanticValidationInput, semantics: SceneSemantics): SemanticViolation[] {
  if (!input.reelFormatId) return [];
  const spec = FORMAT_REQUIRED_ACTIONS[input.reelFormatId];
  if (!spec) return [];
  if (spec.actions.includes(semantics.actionClass)) return [];
  return [
    {
      type: "format",
      severity: "error",
      rule: "format_coherence",
      detail: `reel format "${input.reelFormatId}" requires an action class in [${spec.actions.join(", ")}] but this scene's action class is "${semantics.actionClass}" — ${spec.why}`,
    },
  ];
}

/* ── Rule 2: audio environment coherence ─────────────────────────────────────
 * An ambience class outside its location's allowed list is physically impossible, not a style
 * choice. Both shipped failures came from the same place: a String.includes() lookup that matched
 * "mall" inside "small white towel" and "car" inside "no parked cars".
 */
function checkAudioCoherence(input: SemanticValidationInput, semantics: SceneSemantics): SemanticViolation[] {
  const lower = input.prompt.toLowerCase();
  const allowed = AUDIO_CLASSES_BY_LOCATION[semantics.locationClass];
  const out: SemanticViolation[] = [];
  for (const { phrase, audioClass } of AUDIO_PHRASE_CLASSES) {
    if (!lower.includes(phrase)) continue;
    if (allowed.includes(audioClass)) continue;
    out.push({
      type: "audio",
      severity: "error",
      rule: "audio_environment_coherence",
      detail: `prompt claims "${phrase}" (${audioClass}) but the scene's location class is "${semantics.locationClass}", which only supports [${allowed.join(", ")}]`,
    });
  }
  return out;
}

/* ── Rule 3: speech gating ───────────────────────────────────────────────────
 * A speech layer only belongs when the brief declares speaking as the point of the video. Warning,
 * not error, plus automatic removal — a mistakenly-spoken reel is recoverable by stripping the
 * layer, and hard-blocking on it would stall the pipeline for a fixable formatting issue.
 */
const SPEECH_BLOCK = /(EXACT SPOKEN LINE[\s\S]*?(?:\n\n|$)|Spoken line:[\s\S]*?(?:\n\n|$))/g;
const SPEECH_MARKERS = /\b(EXACT SPOKEN LINE|Spoken line:|lip[- ]?sync|articulates? the spoken line|speaking the line)\b/i;

function checkSpeechGating(
  input: SemanticValidationInput,
  semantics: SceneSemantics
): { violations: SemanticViolation[]; sanitized?: string } {
  if (!SPEECH_MARKERS.test(input.prompt)) return { violations: [] };
  if (semantics.speechIsThePoint) return { violations: [] };
  const sanitized = input.prompt.replace(SPEECH_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    violations: [
      {
        type: "speech",
        severity: "warning",
        rule: "speech_gating",
        detail:
          "prompt carries a speech layer but the scene brief does not declare speaking as the point of this video — layer removed automatically",
      },
    ],
    sanitized,
  };
}

/* ── Rule 4: auto-reel length and structure ──────────────────────────────────
 * One action, 6–7s, no on-screen text, no boilerplate stack. This is the shape the two
 * best-performing reels in the window actually had.
 */
const DURATION_RANGE = /(\d+)\s*[–—-]\s*(\d+)\s*(?:s\b|sec|second)/i;
const DURATION_SINGLE = /(?<!\d[–—-])\b(\d+(?:\.\d+)?)\s*(?:s\b|sec\b|seconds?\b)/i;
const OVERLAY_TEXT = /\b(text overlay|on-screen text|caption overlay|title card|subtitle)\b/i;
// Generic layers the recovery compiler removes outright: they are the same lines on every reel,
// they consume prompt budget, and they are what the model actually renders instead of the action.
const BOILERPLATE_LAYERS: Array<{ label: string; pattern: RegExp }> = [
  { label: "generic micro-motion", pattern: /natural blinking[,.\s]+subtle breathing|subtle breathing[,.\s]+minor posture shifts/i },
  { label: "depth doctrine", pattern: /DEPTH & COMPOSITION|foreground \/ midground \/ background/i },
  { label: "environment boilerplate", pattern: /No environment jump, no random camera reframing/i },
];
// Internal workflow language that must never reach a provider — slot names, provider names, the
// character's own name used as a warning, and the framing block's meta instructions.
const META_LEAKAGE = /\b(reel_start_frame|reel_video|story_bts|carousel_\d|Kling \/ Seedance|image-to-video \(|loses Vivienne|Motion prompt for)\b/i;
// Three or more alternative actions offered in one clause ("turning her head, raising a cup,
// adjusting a sleeve") — the model picks one at random, or blends them.
const ALTERNATIVE_ACTIONS = /—\s*\w+ing\b[^.\n]*,\s*\w+ing\b[^.\n]*,\s*\w+ing\b/i;

function checkAutoReelShape(input: SemanticValidationInput): SemanticViolation[] {
  if (!input.enforceAutoReelShape) return [];
  const out: SemanticViolation[] = [];
  const prompt = input.prompt;

  const range = prompt.match(DURATION_RANGE);
  if (range) {
    out.push({
      type: "structure",
      severity: "error",
      rule: "auto_reel_duration",
      detail: `prompt declares a duration RANGE of ${range[1]}–${range[2]}s; an auto reel must declare one duration between 6 and 7 seconds`,
    });
  } else {
    const single = prompt.match(DURATION_SINGLE);
    if (!single) {
      out.push({
        type: "structure",
        severity: "error",
        rule: "auto_reel_duration",
        detail: "prompt declares no duration; an auto reel must declare one duration between 6 and 7 seconds",
      });
    } else {
      const secs = Number(single[1]);
      if (secs < 6 || secs > 7) {
        out.push({
          type: "structure",
          severity: "error",
          rule: "auto_reel_duration",
          detail: `prompt declares ${secs}s; an auto reel must be 6–7 seconds`,
        });
      }
    }
  }

  if (OVERLAY_TEXT.test(prompt)) {
    out.push({
      type: "structure",
      severity: "error",
      rule: "auto_reel_no_overlay_text",
      detail: "prompt asks the generator for on-screen text — image/video models cannot spell; the hook is an overlay added in post",
    });
  }

  if (ALTERNATIVE_ACTIONS.test(prompt)) {
    out.push({
      type: "structure",
      severity: "error",
      rule: "auto_reel_single_action",
      detail: "prompt offers three or more alternative actions in one clause; an auto reel must name exactly one readable action",
    });
  }

  for (const layer of BOILERPLATE_LAYERS) {
    if (layer.pattern.test(prompt)) {
      out.push({
        type: "structure",
        severity: "error",
        rule: "auto_reel_no_boilerplate",
        detail: `prompt carries the ${layer.label} boilerplate layer, which is identical on every reel and crowds out the action`,
      });
    }
  }

  const meta = prompt.match(META_LEAKAGE);
  if (meta) {
    out.push({
      type: "structure",
      severity: "error",
      rule: "auto_reel_no_meta_leakage",
      detail: `internal workflow language leaked into the provider prompt: "${meta[0]}"`,
    });
  }

  return out;
}

/* ── Rule 5: locomotion coherence ────────────────────────────────────────────
 * "she walks, continuing forward motion" for a woman reclined in the passenger seat of a car. The
 * archetype is checked as well as the prompt, because on Day 88 the prompt itself had already
 * argued its way out ("no walking") while the walking_motion archetype was still what drove the
 * whole slot.
 */
const LOCOMOTION_ASSERTION = /\b(she walks|walking rhythm|continuing forward motion|feet contact ground|strides? forward|steps? forward)\b/i;

function checkLocomotionCoherence(input: SemanticValidationInput, semantics: SceneSemantics): SemanticViolation[] {
  if (!STATIONARY_ACTION_CLASSES.has(semantics.actionClass)) return [];
  const out: SemanticViolation[] = [];

  const promptAsserts = input.prompt.match(LOCOMOTION_ASSERTION);
  if (promptAsserts) {
    out.push({
      type: "action",
      severity: "error",
      rule: "locomotion_coherence",
      detail: `prompt asserts locomotion ("${promptAsserts[0]}") but the scene's action class is "${semantics.actionClass}" — the subject does not translate through space here`,
    });
  }

  const archetypeAction = plannedActionForReelArchetype(input.archetypeId ?? undefined);
  if (archetypeAction && LOCOMOTION_ASSERTION.test(archetypeAction)) {
    out.push({
      type: "action",
      severity: "error",
      rule: "locomotion_coherence",
      detail: `archetype "${input.archetypeId}" drives a locomotion action ("${archetypeAction}") into a scene whose action class is "${semantics.actionClass}"`,
    });
  }

  return out;
}

/* ── Rule 6: prop coherence (deterministic subset) ───────────────────────────
 * Layer 2 owns the open-ended version of this — "glass tilts, liquid follows gravity" contains no
 * noun a lexical scan would recognise as a cup. But the KNOWN failure mode is worth catching for
 * free and without an API call: if the prompt has her manipulate a drinking vessel, a phone, a
 * book, a bottle, keys or a cigarette, that object must exist somewhere in the scene brief.
 * Presence is not the test — Day 78's brief has a wine glass on the nightstand and the prompt
 * correctly leaves it there. Manipulation is.
 */
function checkPropCoherence(input: SemanticValidationInput, semantics: SceneSemantics): SemanticViolation[] {
  const out: SemanticViolation[] = [];
  for (const obj of MANIPULABLE_OBJECTS) {
    const hit = input.prompt.match(obj.pattern);
    if (!hit) continue;
    if (obj.synonyms.test(semantics.entityText)) continue;
    out.push({
      type: "prop",
      severity: "error",
      rule: "prop_coherence",
      detail: `prompt has the subject manipulate a ${obj.id.replace(/_/g, " ")} ("${hit[0]}") but no such object appears in the scene brief`,
    });
  }
  return out;
}

/* ── Layer 1 entry point ─────────────────────────────────────────────────── */

export function validateSceneCoherence(input: SemanticValidationInput): SemanticValidationResult {
  const semantics = resolveSceneSemantics(input.brief, {
    sceneLocation: input.sceneLocation,
    activityHint: input.activityHint,
  });

  const speech = checkSpeechGating(input, semantics);

  const all: SemanticViolation[] = [
    ...checkFormatCoherence(input, semantics),
    ...checkAudioCoherence(input, semantics),
    ...speech.violations,
    ...checkAutoReelShape(input),
    ...checkLocomotionCoherence(input, semantics),
    ...checkPropCoherence(input, semantics),
  ];

  return {
    errors: all.filter((v) => v.severity === "error"),
    warnings: all.filter((v) => v.severity === "warning"),
    semantics,
    sanitizedPrompt: speech.sanitized,
  };
}

// Every validation run is logged, PASSES INCLUDED. The whole reason Days 88–93 shipped is that a
// clean result was indistinguishable from no result — we need to be able to see the false
// negatives, which means seeing what the validator judged and what it decided.
export function logSemanticValidation(
  context: { day?: number | null; slot?: string; archetypeId?: string | null; layer: "1" | "2" },
  result: Pick<SemanticValidationResult, "errors" | "warnings" | "semantics">
): void {
  console.log(
    "[semantic-validator]",
    JSON.stringify({
      ...context,
      verdict: result.errors.length > 0 ? "fail" : "pass",
      location_class: result.semantics.locationClass,
      action_class: result.semantics.actionClass,
      classes_authored: result.semantics.authored,
      errors: result.errors.map((e) => `${e.rule}: ${e.detail}`),
      warnings: result.warnings.map((w) => `${w.rule}: ${w.detail}`),
    })
  );
}
