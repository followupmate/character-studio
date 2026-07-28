import type { SexualEnergyLevel, VitalityLevel } from "@/types";
import type { GenerativeSituation, SensualVisualLanguage } from "@/lib/situationPlanner";
import {
  normalizeOutfitArchetypeFamily,
  normalizePoseArchetype,
  LUXE_CAR_TRANSITION_POSE_FAMILIES,
  isQuietIndoorBeigeDay,
  OUTDOOR_OR_SOCIAL_LOCATION_PATTERN,
  INDOOR_HOME_CONTEXT_PATTERN,
} from "@/lib/situationPlanner";
import type { PlayfulHotWorldProfile } from "@/lib/playfulHotWorldConfig";
import { MAGNETISM_REASONS } from "@/lib/sexualEnergyConfig";
import type { WeeklyBalanceNudges } from "@/lib/situationMemory";

// open_life_generation_v1 — the 15-point concept checklist (spec §11), split into BLOCKING
// errors (structurally unusable — trigger a retry) and non-blocking warnings (suboptimal but
// never regenerated for, and never used to exhaust the generation search space). Each check is
// a small named, independently-exported, pure function — no DB, no LLM — so every rule is
// unit-testable in isolation against hand-built fixtures.

// iteration 4 (luxury_seduction_v1) bumped this 3 → 4 — a cheap safety margin against the
// growing number of blocking checks across 4 layers (cost only appears on the failure path).
export const SITUATION_MAX_ATTEMPTS = 4;

export interface ValidationContext {
  allowedSexualEnergyLevels: SexualEnergyLevel[];
  recentCliches?: string[];
  hadSufficientHistory?: boolean;
  weeklyBalanceNudges?: WeeklyBalanceNudges;
  requireSensualVisualLanguage?: boolean; // sensual_visual_language_v1 (iteration 2)
  requireSexAppealStyle?: boolean; // sex_appeal_style_v1 (iteration 3)
  requireLuxurySeduction?: boolean; // luxury_seduction_v1 (iteration 4)
  // luxury_seduction_v1 — normalized families from the last 14 GENERATED days (not the full
  // ~18-day memory lookback used for soft nudges elsewhere) — the hard repeat cap is deliberately
  // scoped to this narrower rolling window per product direction, so a family isn't blocked just
  // for appearing twice outside the 14-day evaluation window.
  recentFashionDirectionFamilies?: string[];
  recentPoseArchetypeFamilies?: string[];
  requirePlayfulHotWorld?: boolean; // playful_hot_world_v1 (iteration 5)
  dictatedPlayfulHotWorld?: PlayfulHotWorldProfile;
  // playful_hot_world_v1 — same rolling 14-GENERATED-day window convention as
  // recentFashionDirectionFamilies/recentPoseArchetypeFamilies above.
  recentVitalityLevels?: VitalityLevel[];
  recentQuietIndoorBeigeFlags?: boolean[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const STOPWORDS = new Set(["this", "that", "with", "from", "into", "there", "their", "about", "which", "would", "could", "while", "after", "before", "today", "still"]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );
}

function sharesContentWord(a: string, b: string): boolean {
  const wordsA = contentWords(a);
  for (const w of contentWords(b)) if (wordsA.has(w)) return true;
  return false;
}

// #1 — Vivien must want or decide something; she is never a passive object placed into a scene.
export function hasDesireOrDecision(situation: GenerativeSituation): string | null {
  const signal = situation.desire_signal?.trim();
  if (!signal) return "desire_signal is missing — she must want or decide something, not be a passive object";
  if (/^(she is|to be) (photographed|seen|captured|watched)\.?$/i.test(signal)) {
    return `desire_signal "${signal}" describes being observed, not a want/decision of her own`;
  }
  return null;
}

// #2 — the activity must have a reason distinct from restating the activity itself.
export function activityHasReason(situation: GenerativeSituation): string | null {
  const activity = situation.activity?.trim();
  const reason = situation.reason?.trim();
  if (!reason || reason.length < 4) return "activity has no reason (spec: an activity with no reason is not a valid situation)";
  if (activity && reason.toLowerCase() === activity.toLowerCase()) {
    return "reason merely repeats the activity verbatim — it must explain WHY, not restate WHAT";
  }
  return null;
}

// #6 — sexual_energy.level must stay within the tier's allowed range (non-zero cells of
// SEXUAL_ENERGY_RANGE — see lib/sexualEnergyConfig.ts).
export function sexualEnergyWithinTierRange(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  const level = situation.sexual_energy?.level;
  if (!ctx.allowedSexualEnergyLevels.includes(level)) {
    return `sexual_energy.level "${level}" is outside this tier's allowed range (${ctx.allowedSexualEnergyLevels.join(", ")})`;
  }
  return null;
}

// #7 — sexual energy must be expressed through the situation, not through a bare skin-amount claim.
const SKIN_ONLY_PATTERN = /^(more|less|a lot of|some|little|no)?\s*(bare\s*)?skin(\s*(showing|visible|exposed))?\.?$/i;
export function sexualEnergyIsMoreThanSkin(situation: GenerativeSituation): string | null {
  const expression = situation.sexual_energy?.expression?.trim() ?? "";
  if (!expression) return "sexual_energy.expression is missing";
  if (SKIN_ONLY_PATTERN.test(expression) || expression.length < 12) {
    return `sexual_energy.expression "${expression}" reduces to a skin-amount claim, not a situational expression (posture, proximity, gaze, a decision)`;
  }
  return null;
}

// #11 — must never require a second sharp/recognizable face (identity + safety rule already
// enforced elsewhere for wardrobe/environment; this checks the situation's own social_context text).
const SECOND_FACE_PATTERN = /\b(her friend'?s?\s+face|his face|another (person'?s?\s+)?face|two faces|both (looking|facing) (at |into )?the camera|second face)\b/i;
// iteration 4 fix — a live 14-day run showed a real false positive: "the cat is a warm shape
// across her legs, no second face in frame, animal body only partially visible" was REJECTED
// because it contains the literal substring "second face", even though the sentence explicitly
// DENIES one. A negation immediately before the match (no/never/without/not a second face) means
// the situation is compliant, not violating — checked first, short-circuits to a pass.
const SECOND_FACE_NEGATION_PATTERN = /\b(no|never|without|not\s+a)\s+second\s+(sharp\s+)?face\b/i;
export function noSecondSharpFace(situation: GenerativeSituation): string | null {
  const implication = situation.social_context?.implication ?? "";
  if (SECOND_FACE_NEGATION_PATTERN.test(implication)) return null;
  if (SECOND_FACE_PATTERN.test(implication)) {
    return `social_context.implication ("${implication}") implies a second sharp/recognizable face — never allowed`;
  }
  return null;
}

// #13 — not just a modeling pose with no life: the reason cannot reduce to "posing for the camera".
const CAMERA_ONLY_REASON = /^(for|to)\s+(the\s+)?(camera|photo(shoot)?|content|the shot)\b/i;
export function notPureModelingPose(situation: GenerativeSituation): string | null {
  const reason = situation.reason?.trim() ?? "";
  if (CAMERA_ONLY_REASON.test(reason)) {
    return `reason "${reason}" is a modeling-pose reason (exists only for the camera), not a life reason`;
  }
  return null;
}

// #14 — not just a practical task with no magnetism: magnetic_hook must add something beyond
// the bare activity/reason.
export function notPureTaskNoMagnetism(situation: GenerativeSituation): string | null {
  const hook = situation.magnetic_hook?.trim() ?? "";
  const activity = situation.activity?.trim().toLowerCase() ?? "";
  if (!hook) return "magnetic_hook is missing — a practical task with no magnetic reason is not a valid StoryDay concept";
  if (hook.toLowerCase() === activity) {
    return `magnetic_hook "${hook}" merely restates the activity — it adds no reason to stop scrolling`;
  }
  return null;
}

// #5 — magnetism_reason must be a real, named reason — never reducible to "she is attractive".
const BARE_ATTRACTION_HOOK = /^(she'?s?|her)?\s*(is\s+)?(just\s+)?(attractive|hot|pretty|beautiful|sexy)\.?$/i;
export function magnetismReasonPresent(situation: GenerativeSituation): string | null {
  const reason = situation.magnetism_reason;
  if (!MAGNETISM_REASONS.includes(reason)) {
    return `magnetism_reason "${reason}" is not one of the 9 recognized reasons`;
  }
  const hook = situation.magnetic_hook?.trim() ?? "";
  if (BARE_ATTRACTION_HOOK.test(hook)) {
    return `magnetic_hook "${hook}" reduces to "she is attractive" — not a concrete hook`;
  }
  return null;
}

// #3 / #12 — must be visually understandable from ONE image, not a multi-beat sequence.
const MULTI_SCENE_PATTERN = /\b(then|afterwards|later (that|in the) (day|night|evening)|meanwhile|before that|next she|after which)\b/i;
export function rendersAsOneImage(situation: GenerativeSituation): string | null {
  const action = situation.visual_execution?.action_visible ?? "";
  if (MULTI_SCENE_PATTERN.test(action)) {
    return `visual_execution.action_visible ("${action}") describes a sequence of moments, not one renderable image`;
  }
  if (action.length > 240) {
    return "visual_execution.action_visible is too long/complex to read as a single coherent image";
  }
  return null;
}

// #9 — Fanvue continuation must be logically derived from the SAME event, never a random,
// unrelated lingerie/bedroom swap.
export function fanvueContinuationDerivedFromEvent(situation: GenerativeSituation): string | null {
  const tension = situation.fanvue_tension;
  if (!tension) return "fanvue_tension is missing";
  if (tension.potential === "none") {
    if (tension.continuation) return `fanvue_tension.potential is "none" but continuation is set — should be null`;
    return null;
  }
  if (!tension.continuation || !tension.continuation.trim()) {
    return `fanvue_tension.potential is "${tension.potential}" but continuation is missing`;
  }
  const relatedToActivity = sharesContentWord(tension.continuation, situation.activity ?? "");
  const relatedToLocation = sharesContentWord(tension.continuation, situation.visual_execution?.location ?? "");
  const relatedToDomain = sharesContentWord(tension.continuation, situation.life_domain ?? "");
  if (!relatedToActivity && !relatedToLocation && !relatedToDomain) {
    return `fanvue_tension.continuation ("${tension.continuation}") does not appear related to today's activity/location/domain — looks like an unrelated swap, not a continuation of the same event`;
  }
  if (tension.potential === "strong" && (!tension.withheld_element || !tension.withheld_element.trim())) {
    return `fanvue_tension.potential is "strong" but withheld_element is missing`;
  }
  return null;
}

// ── Warnings (non-blocking — never trigger a retry, never removed from the candidate pool) ──

// #10 — soft cliché-repeat check. Only runs with sufficient history (spec: anti-repeat
// requires available data); never hard-blocks (spec: must not exhaust generation search space).
export function noRecentClicheRepeat(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  if (!ctx.hadSufficientHistory || !ctx.recentCliches || ctx.recentCliches.length === 0) return null;
  const todaysCliches = situation.sexual_cliches ?? [];
  const overlap = todaysCliches.filter((c) => ctx.recentCliches!.includes(c));
  if (overlap.length > 0) {
    return `repeats a recently-used sexual cliché as today's dominant mechanism (soft — not blocked): ${overlap.join(", ")}`;
  }
  return null;
}

// Weekly-balance deviation (spec §8/§12 doplnenie) — informational only, never a hard rule and
// never overrides tier selection.
export function respectsWeeklyBalance(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  if (!ctx.hadSufficientHistory || !ctx.weeklyBalanceNudges) return null;
  const n = ctx.weeklyBalanceNudges;
  const misses: string[] = [];
  if (n.needsSocialDay && situation.social_context.mode === "alone") misses.push("a socially-implied day is still due this week, but today is alone");
  if (n.needsProvocativeOrIntimateDay && !["provocative", "intimate"].includes(situation.sexual_energy.level)) {
    misses.push("a provocative/intimate day is still due this week");
  }
  if (n.consecutiveNightCapHit && situation.visual_execution.time_of_day === "night") misses.push("two dominant-night days already ran back to back");
  if (n.needsCalmerContrastDay && !["subtle", "warm"].includes(situation.sexual_energy.level)) misses.push("a calmer contrast day is still due this week");
  return misses.length > 0 ? misses.join("; ") : null;
}

// ── sensual_visual_language_v1 (iteration 2) — concrete visual grammar of sexuality ──────────
// A production dry-run showed sexual_energy validated as "provocative"/"confident eye contact"
// but rendered as a neutral sweater-and-wine scene. These checks require the CONCRETE fields
// (wardrobe_signal/body_emphasis/gesture_or_action/camera_relationship/exposure_boundary) that
// actually reach the image prompt, scaled by level — blocking, only when
// ctx.requireSensualVisualLanguage is true.

const GENERIC_WARDROBE_PATTERN = /^(an?\s+)?(attractive|feminine|sensual|nice|pretty|stylish)\s+(outfit|clothing|styling|clothes|look)\.?$/i;
const CONCRETE_GARMENT_PATTERN = /\b(dress|skirt|top|shorts|blouse|robe|swimsuit|bodysuit|bra|camisole|leggings|jeans|blazer|slip|fitted|cropped|open|sheer|bare|exposed|slit|high-waisted|off-shoulder)\b/i;

// Positive AND negative check: a denylist alone lets a long, purely abstract phrase through
// ("a beautifully considered and deliberately alluring ensemble") — this also requires at
// least one concrete garment/cut/body-relation word to actually be present.
export function noGenericWardrobeSignal(wardrobeSignal: string | undefined | null): string | null {
  const text = wardrobeSignal?.trim() ?? "";
  if (!text) return "wardrobe_signal is missing";
  if (GENERIC_WARDROBE_PATTERN.test(text)) {
    return `wardrobe_signal "${text}" is a generic label with no garment named`;
  }
  if (text.length < 12) {
    return `wardrobe_signal "${text}" is too short to be a concrete garment description`;
  }
  if (!CONCRETE_GARMENT_PATTERN.test(text)) {
    return `wardrobe_signal "${text}" names no recognizable garment/cut/body-relation word — a long abstract phrase is not enough`;
  }
  return null;
}

// Deliberately low threshold — body_emphasis is legitimately a single short word ("legs",
// "hips", "waist") per its own schema description; this must not reject that.
function nonEmptyConcrete(field: string | undefined | null): boolean {
  return !!field && field.trim().length >= 3;
}

// warm — deliberately the MILDEST check: a gentle camera-relationship/private-access cue alone
// is enough, never forces a bolder outfit (especially in a calm aftermath/recovery moment).
export function sensualCueForWarm(situation: GenerativeSituation): string | null {
  if (situation.sexual_energy?.level !== "warm") return null;
  const s = situation.sensual_visual_language;
  if (!s) return "sexual_energy.level is 'warm' but sensual_visual_language is missing";
  const candidates = [s.wardrobe_signal, s.body_emphasis, s.gesture_or_action, s.camera_relationship];
  if (!candidates.some((c) => nonEmptyConcrete(c))) {
    return "warm level requires at least one concrete sensual cue (wardrobe_signal, body_emphasis, gesture_or_action, or camera_relationship — a gentle camera-relationship cue alone is enough)";
  }
  return null;
}

export function sensualCuesForPlayful(situation: GenerativeSituation): string | null {
  if (situation.sexual_energy?.level !== "playful") return null;
  const s = situation.sensual_visual_language;
  if (!s) return "sexual_energy.level is 'playful' but sensual_visual_language is missing";
  const all = [s.wardrobe_signal, s.body_emphasis, s.gesture_or_action, s.camera_relationship];
  const presentCount = all.filter((c) => nonEmptyConcrete(c)).length;
  const hasWardrobeOrBody = nonEmptyConcrete(s.wardrobe_signal) || nonEmptyConcrete(s.body_emphasis);
  if (presentCount < 2 || !hasWardrobeOrBody) {
    return "playful level requires at least 2 concrete sensual cues, including at least one wardrobe_signal or body_emphasis";
  }
  return null;
}

// Shared by provocative + intimate (intimate is provocative's requirements PLUS closeness).
function provocativeTierRequirements(s: SensualVisualLanguage | undefined, levelLabel: string): string | null {
  if (!s) return `sexual_energy.level is '${levelLabel}' but sensual_visual_language is missing`;
  const wardrobeErr = noGenericWardrobeSignal(s.wardrobe_signal);
  if (wardrobeErr) return `${levelLabel} level: ${wardrobeErr}`;
  if (!nonEmptyConcrete(s.body_emphasis)) return `${levelLabel} level requires a concrete body_emphasis`;
  if (!nonEmptyConcrete(s.camera_relationship)) return `${levelLabel} level requires a concrete camera_relationship`;
  if (!nonEmptyConcrete(s.exposure_boundary)) return `${levelLabel} level requires a concrete exposure_boundary`;
  return null;
}

export function sensualCuesForProvocative(situation: GenerativeSituation): string | null {
  if (situation.sexual_energy?.level !== "provocative") return null;
  return provocativeTierRequirements(situation.sensual_visual_language, "provocative");
}

const CLOSE_RELATIONSHIP_PATTERN = /\b(close|private|familiar|intimate)\b/i;

export function sensualCuesForIntimate(situation: GenerativeSituation): string | null {
  if (situation.sexual_energy?.level !== "intimate") return null;
  const base = provocativeTierRequirements(situation.sensual_visual_language, "intimate");
  if (base) return base;
  const s = situation.sensual_visual_language!;
  if (!CLOSE_RELATIONSHIP_PATTERN.test(s.camera_relationship ?? "")) {
    return `intimate level requires camera_relationship to convey closeness (close/private/familiar/intimate) — got "${s.camera_relationship}"`;
  }
  if (!situation.fanvue_tension?.withheld_element || !situation.fanvue_tension.withheld_element.trim()) {
    return "intimate level requires fanvue_tension.withheld_element (re-affirms the existing strong-tension check)";
  }
  return null;
}

// Independent of the level checks above — checks internal consistency between body_emphasis and
// visual_execution.shot_intent: a legs/thighs/waist/hips emphasis must be renderable in the shot,
// not paired with a face-only close-up. collarbone/neckline/shoulders/back ARE compatible with a
// close-up (they're upper-body/face-adjacent), so those never trigger this check.
const LOWER_BODY_EMPHASIS_PATTERN = /\b(legs?|thighs?|waist|hips?)\b/i;
const FACE_ONLY_SHOT_PATTERN = /^(close-?up|headshot|face[- ]only|portrait crop)\b/i;
const BODY_MENTION_PATTERN = /\b(body|legs?|thighs?|full[- ]?body|waist|silhouette|figure|seated|standing|walking|wide)\b/i;

export function bodyEmphasisRendersInShot(situation: GenerativeSituation): string | null {
  const s = situation.sensual_visual_language;
  if (!s?.body_emphasis) return null;
  const emphasis = s.body_emphasis.trim();
  const shotIntent = situation.visual_execution?.shot_intent?.trim() ?? "";
  if (LOWER_BODY_EMPHASIS_PATTERN.test(emphasis) && FACE_ONLY_SHOT_PATTERN.test(shotIntent) && !BODY_MENTION_PATTERN.test(shotIntent)) {
    return `body_emphasis ("${emphasis}") requires legs/waist/hips to be visible, but shot_intent ("${shotIntent}") describes only a face close-up`;
  }
  return null;
}

// ── sex_appeal_style_v1 (iteration 3) — explicit outfit archetype, silhouette/shot-intent
// compatibility, mandatory facial energy, hard tier bans (no pure-gym intimate_aesthetic, no
// homewear luxe_car). Blocking, only when ctx.requireSexAppealStyle is true.

const GENERIC_OUTFIT_ARCHETYPE_PATTERN = /^(an?\s+)?(attractive|feminine|sexy|elegant|stylish|flattering)\s+(outfit|styling|clothing|look|clothes)\.?$/i;
const CONCRETE_OUTFIT_ARCHETYPE_PATTERN = /\b(dress|skirt|top|shorts|blouse|blazer|stockings?|tights|bra|leggings|swimsuit|swimwear|cocktail|nightlife|camisole|sheath|pencil|bodycon|slip|sheer|cover-?up)\b/i;

export function noGenericOutfitArchetype(outfitArchetype: string | undefined | null): string | null {
  const text = outfitArchetype?.trim() ?? "";
  if (!text) return "outfit_archetype is missing";
  if (GENERIC_OUTFIT_ARCHETYPE_PATTERN.test(text)) {
    return `outfit_archetype "${text}" is a generic label with no garment named`;
  }
  if (text.length < 10) {
    return `outfit_archetype "${text}" is too short to be a concrete archetype`;
  }
  if (!CONCRETE_OUTFIT_ARCHETYPE_PATTERN.test(text)) {
    return `outfit_archetype "${text}" names no recognizable garment/cut word`;
  }
  return null;
}

type SilhouetteCategory = "lower_body" | "mid_body" | "face_adjacent" | "back_shoulder" | "other";

function classifySilhouetteFocus(text: string): SilhouetteCategory {
  if (/\b(legs?|thighs?|bodycon)\b/i.test(text)) return "lower_body";
  if (/\b(waist|hips?|midriff)\b/i.test(text)) return "mid_body";
  if (/\b(neckline|collarbone)\b/i.test(text)) return "face_adjacent";
  if (/\b(back|shoulders?)\b/i.test(text)) return "back_shoulder";
  return "other";
}

// Same proven heuristic as iteration 2's bodyEmphasisRendersInShot (incompatible-pattern match,
// not a required-pattern demand — avoids false-positive-rejecting loosely-worded but valid
// shot_intent text). face_adjacent/other are always compatible (never checked).
const SILHOUETTE_INCOMPATIBLE_SHOT_PATTERN: Partial<Record<SilhouetteCategory, RegExp>> = {
  lower_body: /^(close-?up|headshot|face[- ]only|portrait crop)\b/i,
  mid_body: /^(close-?up|headshot|face[- ]only|portrait crop)\b/i,
  back_shoulder: /^(close-?up|headshot|face[- ]only|portrait crop|straight[- ]on|frontal)\b/i,
};
const BODY_VISIBLE_IN_SHOT_PATTERN = /\b(body|legs?|thighs?|full[- ]?body|waist|silhouette|figure|seated|standing|walking|wide|side|over[- ]?shoulder|from behind|back|medium)\b/i;

export function silhouetteFocusRendersInShot(situation: GenerativeSituation): string | null {
  const focus = situation.sex_appeal_style?.silhouette_focus?.trim();
  if (!focus) return null;
  const category = classifySilhouetteFocus(focus);
  const incompatible = SILHOUETTE_INCOMPATIBLE_SHOT_PATTERN[category];
  if (!incompatible) return null;
  const shotIntent = situation.visual_execution?.shot_intent?.trim() ?? "";
  if (incompatible.test(shotIntent) && !BODY_VISIBLE_IN_SHOT_PATTERN.test(shotIntent)) {
    return `silhouette_focus "${focus}" (${category.replace("_", " ")}) requires the body to be visible, but shot_intent "${shotIntent}" describes only a face close-up`;
  }
  return null;
}

const GENERIC_FACIAL_ENERGY_PATTERN = /^(neutral expression|calm face|natural expression|slight smile)\.?$/i;

export function facialEnergyRequiredForLevel(situation: GenerativeSituation): string | null {
  const level = situation.sexual_energy?.level;
  if (!["playful", "provocative", "intimate"].includes(level)) return null;
  const facial = situation.sex_appeal_style?.facial_energy?.trim();
  if (!facial) return `sexual_energy.level is '${level}' but sex_appeal_style.facial_energy is missing (required for playful/provocative/intimate)`;
  if (GENERIC_FACIAL_ENERGY_PATTERN.test(facial)) {
    return `facial_energy "${facial}" is too generic for level '${level}'`;
  }
  return null;
}

const PURE_GYM_PATTERN = /\b(gym|workout|weights?|treadmill|reformer|pilates machine|exercise machine|training session|lifting|active cardio)\b/i;
const TRANSITION_CONTEXT_PATTERN = /\b(post-?workout|after training|recovery|changing area|locker room|hotel wellness|shower|coming home|back from (the )?gym|just finished)\b/i;

export function intimateAestheticNotPureGymScene(situation: GenerativeSituation): string | null {
  if (situation.content_tier !== "intimate_aesthetic") return null;
  const text = `${situation.activity ?? ""} ${situation.visual_execution?.location ?? ""} ${situation.reason ?? ""}`;
  if (!PURE_GYM_PATTERN.test(text)) return null;
  const hasTransition = TRANSITION_CONTEXT_PATTERN.test(text) || situation.continuity_phase === "aftermath";
  if (!hasTransition) {
    return `intimate_aesthetic cannot be a pure gym/workout scene ("${situation.activity}") without a transition context (post-workout, recovery, changing area, hotel wellness, shower, or coming home after training)`;
  }
  return null;
}

const HOMEWEAR_PATTERN = /\b(pyjamas?|pajamas?|robe|sleepwear|nightgown|loungewear|lounge set|oversized sweater|shapeless|cozy)\b/i;

export function luxeCarNoHomewear(situation: GenerativeSituation): string | null {
  if (situation.content_tier !== "luxe_car") return null;
  const outfit = situation.sex_appeal_style?.outfit_archetype ?? "";
  if (HOMEWEAR_PATTERN.test(outfit)) {
    return `luxe_car cannot use homewear/pyjama/robe/loungewear styling ("${outfit}")`;
  }
  return null;
}

const FLIRTY_FACIAL_PATTERN = /\b(teasing|seductive|flirtatious|flirty|playful|inviting|provocative)\s+(smile|look|glance|eye contact)\b/i;
const INCOMPATIBLE_EMOTION_PATTERN = /\b(exhausted|grieving|furious|terrified|bored|numb|devastated)\b/i;

export function facialEnergyMatchesContext(situation: GenerativeSituation): string | null {
  const facial = situation.sex_appeal_style?.facial_energy?.trim();
  if (facial && FLIRTY_FACIAL_PATTERN.test(facial) && INCOMPATIBLE_EMOTION_PATTERN.test(situation.emotional_state ?? "")) {
    return `facial_energy "${facial}" contradicts emotional_state "${situation.emotional_state}" — a flirtatious expression cannot pair with that mood`;
  }
  // luxury_seduction_v1 (iteration 4, doplnenie #11) — facial_seduction REFINES facial_energy,
  // never contradicts it; scanned with the same pattern pair.
  const luxuryFacial = situation.luxury_seduction?.facial_seduction?.trim();
  if (luxuryFacial && FLIRTY_FACIAL_PATTERN.test(luxuryFacial) && INCOMPATIBLE_EMOTION_PATTERN.test(situation.emotional_state ?? "")) {
    return `luxury_seduction.facial_seduction "${luxuryFacial}" contradicts emotional_state "${situation.emotional_state}" — a flirtatious expression cannot pair with that mood`;
  }
  return null;
}

const CONTEXT_SENSITIVE_OUTFIT_PATTERN = /\b(stockings?|tights|blazer\b.*\bbare\s+legs?)\b/i;
const BEACH_POOL_PATTERN = /\b(beach|pool|swim|ocean|sea|lake)\b/i;
const ACTIVE_GYM_CONTEXT_PATTERN = /\b(gym|workout|active exercise|training session|weights?|treadmill)\b/i;

// Cross-tier (unlike intimateAestheticNotPureGymScene/luxeCarNoHomewear, which are tier-specific)
// — stockings/tights/blazer-bare-legs must respect weather/time/life_domain/activity, never
// appear in a beach/pool/active-gym situation purely to hit a higher sex-appeal reading.
export function outfitArchetypeContextuallyPlausible(situation: GenerativeSituation): string | null {
  // iteration 4 — also scans luxury_seduction.fashion_direction/footwear (minimal diff, no new
  // ctx flag needed: requireLuxurySeduction always implies requireSexAppealStyle).
  const outfit = `${situation.sex_appeal_style?.outfit_archetype ?? ""} ${situation.luxury_seduction?.fashion_direction ?? ""} ${situation.luxury_seduction?.footwear ?? ""}`;
  if (!CONTEXT_SENSITIVE_OUTFIT_PATTERN.test(outfit)) return null;
  const context = `${situation.life_domain ?? ""} ${situation.activity ?? ""} ${situation.visual_execution?.location ?? ""}`;
  const isBeachPool = BEACH_POOL_PATTERN.test(context);
  const isActiveGym = ACTIVE_GYM_CONTEXT_PATTERN.test(context) && !TRANSITION_CONTEXT_PATTERN.test(context) && situation.continuity_phase !== "aftermath";
  if (isBeachPool || isActiveGym) {
    return `outfit_archetype/fashion_direction ("${outfit.trim()}") is contextually implausible for ${isBeachPool ? "a beach/pool" : "an active-gym"} situation ("${situation.activity}")`;
  }
  return null;
}

// ── luxury_seduction_v1 (iteration 4) — wider fashion/pose/material/status vocabulary, hard
// (blocking, not soft) outfit/pose anti-repeat, luxe_car POSITIVE styling requirement, and
// cross-field coherence between fashion_direction/outfit_archetype/wardrobe_signal/body_geometry/
// silhouette_focus/facial_seduction (doplnenie #11) — a conflict here must retry, never reach the
// provider as contradictory instructions. Blocking, only when ctx.requireLuxurySeduction is true.

const GENERIC_FASHION_DIRECTION_PATTERN = /^(an?\s+)?(generic|attractive|feminine|sexy|elegant|stylish|flattering|nice)\s+(mini\s+dress|outfit|styling|clothing|look|clothes)\.?$/i;
const CONCRETE_FASHION_DIRECTION_PATTERN = /\b(blazer|dress|skirt|corset|blouse|bodysuit|trousers|sequin|sheer|jumpsuit|stockings?|tights|halter|satin|silk|velvet|leather|swimwear|swimsuit|loungewear|shorts|top)\b/i;

export function noGenericFashionDirection(fashionDirection: string | undefined | null): string | null {
  const text = fashionDirection?.trim() ?? "";
  if (!text) return "fashion_direction is missing";
  if (GENERIC_FASHION_DIRECTION_PATTERN.test(text)) {
    return `fashion_direction "${text}" is a generic label with no real archetype named`;
  }
  if (text.length < 10) {
    return `fashion_direction "${text}" is too short to be a concrete archetype`;
  }
  if (!CONCRETE_FASHION_DIRECTION_PATTERN.test(text)) {
    return `fashion_direction "${text}" names no recognizable garment/cut/material word`;
  }
  return null;
}

// Hard repeat cap (iteration 4 — direct fix for the iteration-3 live-run finding that a SOFT
// nudge alone let slip_dress/swimwear_coverup repeat 3x/14). Scoped to ctx.recentXFamilies, which
// storyGeneration.ts computes from a rolling 14-GENERATED-day window (not the wider ~18-day
// memory lookback used for soft nudges elsewhere) — a 3rd occurrence within that window is
// rejected, forcing a retry with a different family.
export function fashionDirectionFamilyNotOverused(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  if (!ctx.recentFashionDirectionFamilies) return null;
  const family = normalizeOutfitArchetypeFamily(situation.luxury_seduction?.fashion_direction) ?? normalizeOutfitArchetypeFamily(situation.sex_appeal_style?.outfit_archetype);
  if (!family) return null;
  const priorCount = ctx.recentFashionDirectionFamilies.filter((f) => f === family).length;
  if (priorCount >= 2) {
    return `fashion_direction family "${family}" has already appeared ${priorCount}x in the last 14 generated days — pick a different archetype`;
  }
  return null;
}

export function poseArchetypeFamilyNotOverused(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  if (!ctx.recentPoseArchetypeFamilies) return null;
  const family = normalizePoseArchetype(situation.luxury_seduction?.pose_archetype);
  if (!family) return null;
  const priorCount = ctx.recentPoseArchetypeFamilies.filter((f) => f === family).length;
  if (priorCount >= 2) {
    return `pose_archetype family "${family}" has already appeared ${priorCount}x in the last 14 generated days — pick a different pose`;
  }
  return null;
}

type ShotCategory = "lower_body" | "mid_body" | "face_adjacent" | "back_shoulder" | "other";

function classifyGeometryOrFocusText(text: string): ShotCategory {
  if (/\b(legs?|thighs?|bodycon)\b/i.test(text)) return "lower_body";
  if (/\b(waist|hips?|midriff)\b/i.test(text)) return "mid_body";
  if (/\b(neckline|collarbone|neck)\b/i.test(text)) return "face_adjacent";
  if (/\b(back|shoulders?)\b/i.test(text)) return "back_shoulder";
  return "other";
}

const SHOT_INCOMPATIBLE_PATTERN: Partial<Record<ShotCategory, RegExp>> = {
  lower_body: /^(close-?up|headshot|face[- ]only|portrait crop)\b/i,
  mid_body: /^(close-?up|headshot|face[- ]only|portrait crop)\b/i,
  back_shoulder: /^(close-?up|headshot|face[- ]only|portrait crop|straight[- ]on|frontal)\b/i,
};
const BODY_VISIBLE_PATTERN = /\b(body|legs?|thighs?|full[- ]?body|waist|silhouette|figure|seated|standing|walking|wide|side|over[- ]?shoulder|from behind|back|medium)\b/i;

// Same shot-compatibility heuristic as iteration 3's silhouetteFocusRendersInShot, applied to
// body_geometry instead — most of the 15 poses/geometry lines need medium/full-body framing.
// Also indirectly keeps body_geometry and silhouette_focus mutually compatible: both are checked
// against the SAME shot_intent, so if both pass, they're transitively compatible with each other.
export function bodyGeometryRendersInShot(situation: GenerativeSituation): string | null {
  const geometry = situation.luxury_seduction?.body_geometry?.trim();
  if (!geometry) return null;
  const category = classifyGeometryOrFocusText(geometry);
  const incompatible = SHOT_INCOMPATIBLE_PATTERN[category];
  if (!incompatible) return null;
  const shotIntent = situation.visual_execution?.shot_intent?.trim() ?? "";
  if (incompatible.test(shotIntent) && !BODY_VISIBLE_PATTERN.test(shotIntent)) {
    return `body_geometry "${geometry}" (${category.replace("_", " ")}) requires the body to be visible, but shot_intent "${shotIntent}" describes only a face close-up`;
  }
  return null;
}

// Same shot-compatibility heuristic as iteration 3's poseArchetypeRendersInShot precedent
// (silhouetteFocusRendersInShot/bodyEmphasisRendersInShot) — most of the 15 pose archetypes
// require medium/full-body framing, incompatible with a pure face-only close-up shot_intent.
const POSE_LOWER_BODY_FAMILIES = new Set(["seated_crossed_legs", "hand_on_thigh", "one_knee_bent", "heel_against_chair"]);
const POSE_BACK_SHOULDER_FAMILIES = new Set(["over_shoulder_jacket_removal", "balcony_lean"]);
export function poseArchetypeRendersInShot(situation: GenerativeSituation): string | null {
  const pose = situation.luxury_seduction?.pose_archetype?.trim();
  if (!pose) return null;
  const family = normalizePoseArchetype(pose);
  if (!family) return null;
  const category: ShotCategory = POSE_LOWER_BODY_FAMILIES.has(family) ? "lower_body" : POSE_BACK_SHOULDER_FAMILIES.has(family) ? "back_shoulder" : "other";
  const incompatible = SHOT_INCOMPATIBLE_PATTERN[category];
  if (!incompatible) return null;
  const shotIntent = situation.visual_execution?.shot_intent?.trim() ?? "";
  if (incompatible.test(shotIntent) && !BODY_VISIBLE_PATTERN.test(shotIntent)) {
    return `pose_archetype "${pose}" requires the body to be visible, but shot_intent "${shotIntent}" describes only a face close-up`;
  }
  return null;
}

// doplnenie #11 — fashion_direction is the primary fashion concept; outfit_archetype and
// wardrobe_signal must describe the SAME concept (normalize to the same family), never a
// different garment. A disagreement is a genuine concept conflict, not a soft styling variance —
// must retry, never reach the provider as two contradictory garment instructions.
export function luxuryConceptCoherence(situation: GenerativeSituation): string | null {
  const fashionFamily = normalizeOutfitArchetypeFamily(situation.luxury_seduction?.fashion_direction);
  if (!fashionFamily) return null;
  const archetypeFamily = normalizeOutfitArchetypeFamily(situation.sex_appeal_style?.outfit_archetype);
  if (archetypeFamily && archetypeFamily !== fashionFamily) {
    return `luxury_seduction.fashion_direction ("${situation.luxury_seduction?.fashion_direction}", family "${fashionFamily}") disagrees with sex_appeal_style.outfit_archetype ("${situation.sex_appeal_style?.outfit_archetype}", family "${archetypeFamily}") — they must describe the same garment concept`;
  }
  const wardrobeFamily = normalizeOutfitArchetypeFamily(situation.sensual_visual_language?.wardrobe_signal);
  if (wardrobeFamily && wardrobeFamily !== fashionFamily) {
    return `luxury_seduction.fashion_direction ("${situation.luxury_seduction?.fashion_direction}", family "${fashionFamily}") disagrees with sensual_visual_language.wardrobe_signal ("${situation.sensual_visual_language?.wardrobe_signal}", family "${wardrobeFamily}") — they must describe the same garment concept`;
  }
  return null;
}

// doplnenie #12 — social_status_signal must have a concrete visual correlate in the same
// sentence, not just a bare declarative claim ("reserved table"/"private access" alone).
const BARE_STATUS_DECLARATION_PATTERN = /^(a\s+|the\s+)?(reserved\s+table|private\s+access|invitation-only\s+event)\.?$/i;
const STATUS_VISUAL_CORRELATE_PATTERN = /\b(place card|glass|champagne|card|key|jacket|driver|door|valet|folded|waiting|menu|towel|robe|attendant|host|sign|light|view|water|tray|bag|case)\b/i;

export function socialStatusSignalIsVisuallyGrounded(situation: GenerativeSituation): string | null {
  const text = situation.luxury_seduction?.social_status_signal?.trim();
  if (!text) return null;
  if (BARE_STATUS_DECLARATION_PATTERN.test(text)) {
    return `social_status_signal "${text}" is a bare declaration with no visual correlate — it must describe something spatial_setup/allowed_props can actually render`;
  }
  if (text.length > 12 && !STATUS_VISUAL_CORRELATE_PATTERN.test(text)) {
    return `social_status_signal "${text}" names no concrete visible object/gesture/spatial detail — a text-only status claim is not enough`;
  }
  return null;
}

// doplnenie #6/#9 — barefoot is only ever legal in a private/pool/aftermath context.
const BAREFOOT_PATTERN = /\bbarefoot\b/i;
const PRIVATE_POOL_AFTERMATH_CONTEXT_PATTERN = /\b(private|pool|home|suite|bedroom|bathroom|balcony|hotel room|spa)\b/i;
export function barefootOnlyInPrivateContext(situation: GenerativeSituation): string | null {
  const footwear = situation.luxury_seduction?.footwear ?? "";
  if (!BAREFOOT_PATTERN.test(footwear)) return null;
  const isAftermath = situation.continuity_phase === "aftermath";
  const isAlone = situation.social_context?.mode === "alone";
  const context = `${situation.life_domain ?? ""} ${situation.activity ?? ""} ${situation.visual_execution?.location ?? ""}`;
  const isPrivateOrPool = PRIVATE_POOL_AFTERMATH_CONTEXT_PATTERN.test(context) || BEACH_POOL_PATTERN.test(context);
  if (!isAftermath && !isAlone && !isPrivateOrPool) {
    return `footwear "${footwear}" describes barefoot outside a private/pool/aftermath context ("${situation.activity}")`;
  }
  return null;
}

// doplnenie #1 — luxe_car's POSITIVE styling requirement (the negative half, no homewear, is
// already covered by luxeCarNoHomewear above). Self-contained: also scans fashion_direction for
// homewear so a day can't pass by leaving sex_appeal_style.outfit_archetype non-homewear while
// fashion_direction independently describes homewear. Footwear rule follows the user's literal
// wording ("heels or elegant footwear") — elegant flats are NOT excluded (they're a legal
// footwear value everywhere, including luxe_car, per the field's own "only as contrast" allowance).
const ELEGANT_FOOTWEAR_PATTERN = /\b(heels?|boots?|strappy\s+sandals?|elegant\s+flats?)\b/i;
const EVENING_ACCESSORY_PATTERN = /\b(clutch|evening\s+bag)\b/i;
export function luxeCarRequiresNightlifeStyling(situation: GenerativeSituation): string | null {
  if (situation.content_tier !== "luxe_car") return null;
  const ls = situation.luxury_seduction;
  if (!ls) return null;
  if (HOMEWEAR_PATTERN.test(ls.fashion_direction ?? "")) {
    return `luxe_car cannot use homewear/pyjama/robe/loungewear styling in fashion_direction ("${ls.fashion_direction}")`;
  }
  const footwearOk = ELEGANT_FOOTWEAR_PATTERN.test(ls.footwear ?? "") || (BAREFOOT_PATTERN.test(ls.footwear ?? "") && situation.continuity_phase === "aftermath");
  if (!footwearOk) {
    return `luxe_car requires heels/boots/strappy sandals/elegant flats in footwear (or barefoot only when continuity_phase is aftermath) — got "${ls.footwear}"`;
  }
  if (!EVENING_ACCESSORY_PATTERN.test(ls.accessory_language ?? "")) {
    return `luxe_car requires a clutch or evening bag in accessory_language — got "${ls.accessory_language}"`;
  }
  const poseFamily = normalizePoseArchetype(ls.pose_archetype);
  if (poseFamily && !LUXE_CAR_TRANSITION_POSE_FAMILIES.includes(poseFamily)) {
    return `luxe_car requires an arrival/departure/decision-to-continue pose_archetype (${LUXE_CAR_TRANSITION_POSE_FAMILIES.join(", ")}) — got "${ls.pose_archetype}" (family "${poseFamily}")`;
  }
  return null;
}

// ── playful_hot_world_v1 (iteration 5) — the world must be warmer/more playful/sunnier/more
// alive, not just more luxurious. Blocking, only when ctx.requirePlayfulHotWorld is true.

// doplnenie #1 (schválené rozšírenie) — the FIRST real equality-check validation in the project
// (every prior "dictated" field, including sexual_energy.level, was only ever range-checked, not
// equality-checked — see sexualEnergyWithinTierRange above). Covers vitality_level/social_pulse/
// seasonality specifically, per the user's own reasoning: if vitality_level lands correctly
// "playful" but social_pulse quietly drifts to "private" or seasonality to "neutral", the result
// is still "a nice, slightly livelier, but closed-off woman indoors" — the same failure in a
// different disguise. mood_temperature/color_energy/fun_factor are dictated for consistency only
// and are NOT equality-checked (no acceptance-criteria stake).
export function playfulHotWorldMatchesDictated(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  const dictated = ctx.dictatedPlayfulHotWorld;
  const actual = situation.playful_hot_world;
  if (!dictated || !actual) return null;
  if (actual.vitality_level !== dictated.vitality_level) {
    return `playful_hot_world.vitality_level "${actual.vitality_level}" does not match the dictated value "${dictated.vitality_level}"`;
  }
  if (actual.social_pulse !== dictated.social_pulse) {
    return `playful_hot_world.social_pulse "${actual.social_pulse}" does not match the dictated value "${dictated.social_pulse}"`;
  }
  if (actual.seasonality !== dictated.seasonality) {
    return `playful_hot_world.seasonality "${actual.seasonality}" does not match the dictated value "${dictated.seasonality}"`;
  }
  return null;
}

// Hard ceiling on vitality_level: calm — same repeat-cap pattern as iteration 4's
// fashionDirectionFamilyNotOverused, scoped to the rolling 14-generated-day window (ctx.recentVitalityLevels).
export function vitalityLevelCalmNotOverused(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  if (!ctx.recentVitalityLevels) return null;
  const level = situation.playful_hot_world?.vitality_level;
  if (level !== "calm") return null;
  const priorCount = ctx.recentVitalityLevels.filter((l) => l === "calm").length;
  if (priorCount >= 2) {
    return `vitality_level "calm" has already appeared ${priorCount}x in the last 14 generated days — the ceiling is 2`;
  }
  return null;
}

// Hard ceiling on "quiet indoor beige days" (≤3/14 per acceptance) — same repeat-cap pattern,
// rejects the 4th occurrence in the rolling 14-day window.
export function quietIndoorBeigeNotOverused(situation: GenerativeSituation, ctx: ValidationContext): string | null {
  if (!ctx.recentQuietIndoorBeigeFlags) return null;
  if (!isQuietIndoorBeigeDay(situation)) return null;
  const priorCount = ctx.recentQuietIndoorBeigeFlags.filter(Boolean).length;
  if (priorCount >= 3) {
    return `"quiet indoor beige" days have already appeared ${priorCount}x in the last 14 generated days — the ceiling is 3`;
  }
  return null;
}

// doplnenie #3 (architektonické rozhodnutie) — a lightweight backstop, NOT the primary mechanism
// for the environment-mix criteria (a single day cannot verify a 14-day aggregate; the primary
// lever is the pacing-aware dictation of seasonality/social_pulse in lib/playfulHotWorldConfig.ts).
// Rejects the implausible combination of a dictated high_summer day whose location/activity text
// still reads as generic indoor.
export function seasonalityLocationPlausible(situation: GenerativeSituation): string | null {
  const seasonality = situation.playful_hot_world?.seasonality;
  if (seasonality !== "high_summer") return null;
  const context = `${situation.activity ?? ""} ${situation.visual_execution?.location ?? ""}`;
  if (OUTDOOR_OR_SOCIAL_LOCATION_PATTERN.test(context)) return null;
  if (INDOOR_HOME_CONTEXT_PATTERN.test(context)) {
    return `seasonality "high_summer" is implausible for an indoor/home location ("${situation.visual_execution?.location}") — high_summer should read as outdoor daylight`;
  }
  return null;
}

export function validateGenerativeSituation(situation: GenerativeSituation, ctx: ValidationContext): ValidationResult {
  const errorChecks: Array<string | null> = [
    hasDesireOrDecision(situation),
    activityHasReason(situation),
    sexualEnergyWithinTierRange(situation, ctx),
    sexualEnergyIsMoreThanSkin(situation),
    noSecondSharpFace(situation),
    notPureModelingPose(situation),
    notPureTaskNoMagnetism(situation),
    magnetismReasonPresent(situation),
    rendersAsOneImage(situation),
    fanvueContinuationDerivedFromEvent(situation),
  ];

  if (ctx.requireSensualVisualLanguage) {
    errorChecks.push(
      sensualCueForWarm(situation),
      sensualCuesForPlayful(situation),
      sensualCuesForProvocative(situation),
      sensualCuesForIntimate(situation),
      bodyEmphasisRendersInShot(situation)
    );
  }

  if (ctx.requireSexAppealStyle) {
    errorChecks.push(
      noGenericOutfitArchetype(situation.sex_appeal_style?.outfit_archetype),
      silhouetteFocusRendersInShot(situation),
      facialEnergyRequiredForLevel(situation),
      intimateAestheticNotPureGymScene(situation),
      luxeCarNoHomewear(situation),
      facialEnergyMatchesContext(situation),
      outfitArchetypeContextuallyPlausible(situation)
    );
  }

  if (ctx.requireLuxurySeduction) {
    errorChecks.push(
      noGenericFashionDirection(situation.luxury_seduction?.fashion_direction),
      fashionDirectionFamilyNotOverused(situation, ctx),
      poseArchetypeFamilyNotOverused(situation, ctx),
      bodyGeometryRendersInShot(situation),
      poseArchetypeRendersInShot(situation),
      luxuryConceptCoherence(situation),
      socialStatusSignalIsVisuallyGrounded(situation),
      barefootOnlyInPrivateContext(situation),
      luxeCarRequiresNightlifeStyling(situation)
    );
  }

  if (ctx.requirePlayfulHotWorld) {
    errorChecks.push(
      playfulHotWorldMatchesDictated(situation, ctx),
      vitalityLevelCalmNotOverused(situation, ctx),
      quietIndoorBeigeNotOverused(situation, ctx),
      seasonalityLocationPlausible(situation)
    );
  }

  const warningChecks: Array<string | null> = [
    noRecentClicheRepeat(situation, ctx),
    respectsWeeklyBalance(situation, ctx),
  ];

  const errors = errorChecks.filter((e): e is string => !!e);
  const warnings = warningChecks.filter((w): w is string => !!w);

  return { ok: errors.length === 0, errors, warnings };
}
