import type { StoryTier } from "@/lib/storyTier";
import type {
  GenerativeSituation,
  SexualEnergySpec,
  SensualVisualLanguage,
  SexAppealStyle,
  LuxurySeduction,
} from "@/lib/situationPlanner";
import type { PlayfulHotWorldProfile } from "@/lib/playfulHotWorldConfig";
import type { ShotStep } from "@/lib/fanvueContinuation";

// PRODUCTION PROMPTING FRAMEWORK — shared shot-direction layer used by BOTH
// lib/imagePromptCompiler.ts (Soul stills) and lib/seedancePromptCompiler.ts (Seedance video).
// This is the "translation" boundary: internal StoryDay/Fanvue data (rich, business-flavored)
// comes in; a short, concrete, provider-agnostic visual direction comes out. Neither compiler
// ever sees the raw situation object or Fanvue business vocabulary (paid_promise, content_level,
// erotic_tease, payoff, etc.) — only what's already been translated into this struct.
//
// Deliberately does NOT hardcode a specific location/prop/vehicle as a universal rule (a real
// finding this session: a luxe_car-only blueprint doesn't generalize). The 6-beat narrative
// STRUCTURE (bridge -> private_access -> escalation -> reveal -> payoff -> afterglow) is
// tier-agnostic; the CONCRETE content per beat comes from whatever the StoryDay's own
// GenerativeSituation actually says (location, wardrobe, pose, lighting) via the translators
// below, not from a per-tier prop table.

export type ShotFraming = "wide establishing" | "medium" | "medium-close" | "close" | "closest / intimate";

export const FRAMING_RANK: Record<ShotFraming, number> = {
  "wide establishing": 0,
  medium: 1,
  "medium-close": 2,
  close: 3,
  "closest / intimate": 4,
};

export interface ShotDirection {
  source_step?: ShotStep;

  subject: string;
  continuity: string;

  location: string;
  spatial_zone: string;

  visible_action: string;
  pose: string;
  wardrobe_state: string;
  body_emphasis: string;
  facial_expression: string;

  framing: ShotFraming;
  camera_angle: string;
  camera_motion?: string;

  lighting: string;
  atmosphere: string;
}

// ── Per-layer translators (§2a doctrine: translate to ONE concrete phrase, never concatenate
// the source object's full text). Each returns short fragments meant to be composed by the
// beat builder below, not full sentences with terminal punctuation. ──

const SEXUAL_ENERGY_POSE_HINT: Record<SexualEnergySpec["level"], string> = {
  subtle: "relaxed, natural stance",
  warm: "open, comfortable posture, slight lean toward camera",
  playful: "playful weight shift, one hand in motion",
  provocative: "confident, deliberate pose, weight held with intent",
  intimate: "close, unguarded, body angled toward camera",
};
const SEXUAL_ENERGY_EXPRESSION_HINT: Record<SexualEnergySpec["level"], string> = {
  subtle: "soft, unposed gaze",
  warm: "warm, easy eye contact",
  playful: "teasing glance toward camera",
  provocative: "direct, held eye contact",
  intimate: "steady, intimate eye contact",
};
const SEXUAL_ENERGY_FRAMING: Record<SexualEnergySpec["level"], ShotFraming> = {
  subtle: "medium",
  warm: "medium",
  playful: "medium-close",
  provocative: "close",
  intimate: "closest / intimate",
};

export function translateSexualEnergy(spec: SexualEnergySpec): { poseHint: string; expressionHint: string; framing: ShotFraming } {
  return {
    poseHint: SEXUAL_ENERGY_POSE_HINT[spec.level],
    expressionHint: SEXUAL_ENERGY_EXPRESSION_HINT[spec.level],
    framing: SEXUAL_ENERGY_FRAMING[spec.level],
  };
}

// camera_relationship / exposure_boundary deliberately dropped — Fanvue-safety bookkeeping, not
// renderable visual content. Restating an IG-safe "boundary" clause in a provider prompt is
// exactly the kind of meta/negated language that produced multi-panel output this session.
export function translateSensualVisualLanguage(svl: SensualVisualLanguage): { wardrobeState: string; bodyEmphasis: string } {
  return {
    wardrobeState: `${svl.wardrobe_signal}, ${svl.gesture_or_action}`,
    bodyEmphasis: svl.body_emphasis,
  };
}

export function translateSexAppealStyle(sas: SexAppealStyle): { wardrobeHint: string; bodyEmphasisHint: string; facialExpression: string } {
  return {
    wardrobeHint: sas.outfit_archetype,
    bodyEmphasisHint: `${sas.silhouette_focus}, legs ${sas.leg_visibility}`,
    facialExpression: sas.facial_energy,
  };
}

export function translateLuxurySeduction(ls: LuxurySeduction): { wardrobeHint: string; pose: string; facialExpression: string; statusHint: string } {
  return {
    wardrobeHint: `${ls.material_language}, ${ls.accessory_language}, ${ls.footwear}`,
    pose: ls.pose_archetype,
    facialExpression: ls.facial_seduction,
    statusHint: ls.social_status_signal,
  };
}

// Specific cinematography terms, not vague mood words — Kling's own prompting guide is explicit
// that "cinematic movement"/"dynamic"/"add motion" underperform concrete camera direction like
// "slow dolly-in" or "handheld push-in with subtle shake" (verified via kling.ai's prompt guide,
// mirrored by atlascloud.ai's summary of it). Named so the direction still varies by the day's
// vitality level, just phrased the way the video model actually responds to.
const VITALITY_CAMERA_MOTION: Record<PlayfulHotWorldProfile["vitality_level"], string> = {
  calm: "static tripod hold, minimal drift",
  alive: "slow handheld drift, subtle natural sway",
  playful: "gentle handheld push-in, natural sway",
  electric: "handheld push-in, quick natural sway",
};

export function translatePlayfulHotWorld(phw: PlayfulHotWorldProfile): { lightingHint: string; cameraMotion: string } {
  return {
    lightingHint: `${phw.mood_temperature} tone, ${phw.color_energy} color`,
    cameraMotion: VITALITY_CAMERA_MOTION[phw.vitality_level],
  };
}

// ── Field-priority resolution (§3 doctrine: "when internal layers conflict, pick the more
// concrete, visually executable value" — never merge two sources into one field). ──
function pickPose(situation: GenerativeSituation): string {
  // luxury_seduction.pose_archetype is the most concrete/StoryDay-specific source when present;
  // sexual_energy's level-derived hint is the generic fallback.
  return situation.luxury_seduction?.pose_archetype ?? translateSexualEnergy(situation.sexual_energy).poseHint;
}
function pickFacialExpression(situation: GenerativeSituation): string {
  // facial_seduction refines, never contradicts, facial_energy (documented precedence elsewhere
  // in this codebase) — reuse that same rule here.
  return (
    situation.luxury_seduction?.facial_seduction ??
    situation.sex_appeal_style?.facial_energy ??
    translateSexualEnergy(situation.sexual_energy).expressionHint
  );
}
// Higgsfield's Soul HEX color-lock (verified this session) is a web-UI-only feature — no
// documented REST parameter exists for platform.higgsfield.ai, so it can't be called from our
// direct API integration. This is the practical substitute: when the wardrobe text names no
// color at all, independent per-shot generations pick their own — confirmed on a real production
// set where the exact same wardrobe_state string rendered charcoal-black in one shot and
// tan/beige in another. Only appends a color when none is already present; never overrides a
// color the situation data actually specified.
const COLOR_WORD_PATTERN = /\b(black|white|red|blue|green|tan|beige|charcoal|grey|gray|brown|gold|silver|pink|purple|orange|yellow|cream|navy|burgundy|ivory|nude|rose|olive|maroon|copper|bronze)\b/i;
const FALLBACK_COLOR_ANCHOR = "deep charcoal-black";

function ensureColorAnchored(wardrobeText: string): string {
  return COLOR_WORD_PATTERN.test(wardrobeText) ? wardrobeText : `${wardrobeText}, ${FALLBACK_COLOR_ANCHOR}`;
}

function pickWardrobeState(situation: GenerativeSituation): string {
  // Single most concrete source only — never concatenate multiple layers into one run-on
  // description (§3/§5 doctrine: translate, don't merge; a real production draft showed this
  // field previously joining wardrobe_signal + gesture_or_action + material/accessory/footwear
  // into one 500+ char sentence with no internal period, which blew the image-prompt budget and
  // silently truncated away facial_expression/framing/lighting entirely). luxury_seduction's
  // fashion_direction is the richest single "what she's wearing" concept when present.
  const raw =
    situation.luxury_seduction?.fashion_direction ??
    situation.sensual_visual_language?.wardrobe_signal ??
    situation.sex_appeal_style?.outfit_archetype ??
    "fitted outfit consistent with the scene";
  return ensureColorAnchored(raw);
}
function pickBodyEmphasis(situation: GenerativeSituation): string {
  return (
    situation.sensual_visual_language?.body_emphasis ??
    (situation.sex_appeal_style ? translateSexAppealStyle(situation.sex_appeal_style).bodyEmphasisHint : "overall silhouette")
  );
}
function pickFraming(situation: GenerativeSituation): ShotFraming {
  return translateSexualEnergy(situation.sexual_energy).framing;
}
function pickLighting(situation: GenerativeSituation): string {
  const timeWeather = `${situation.visual_execution.time_of_day}, ${situation.visual_execution.weather}`;
  if (situation.playful_hot_world) return `${timeWeather}, ${translatePlayfulHotWorld(situation.playful_hot_world).lightingHint}`;
  return timeWeather;
}
function pickCameraMotion(situation: GenerativeSituation): string {
  return situation.playful_hot_world ? translatePlayfulHotWorld(situation.playful_hot_world).cameraMotion : "static, natural movement only";
}

// ── Tier-agnostic 6-beat narrative structure (§7 doctrine). These are DELIBERATELY abstract —
// no vehicle, room, or prop named — so the same table works for luxe_car, intimate_aesthetic,
// lived_moments, wellness_fitness, everyday_life. The StoryDay's own location/pose/wardrobe fill
// in what's concrete; these beats only describe the NARRATIVE ROLE and how spatial privacy/
// framing/wardrobe displacement should drift beat to beat. ──
const BEAT_SPATIAL_DRIFT: Record<ShotStep, (baseLocation: string) => string> = {
  bridge: (loc) => loc,
  private_access: (loc) => `a more enclosed, private part of the same setting as ${loc}`,
  escalation: (loc) => `fully inside the private continuation of ${loc}, no longer visible from outside`,
  reveal: (loc) => `a quieter, more secluded extension of the same setting, still connected to ${loc}`,
  payoff: (loc) => `the most private point of the same continuous setting as ${loc}`,
  afterglow: () => `pulled back slightly within the same private setting, winding down`,
};
const BEAT_WARDROBE_DISPLACEMENT: Record<ShotStep, string> = {
  bridge: "exactly as worn, nothing shifted",
  private_access: "beginning to shift, one small detail loosened",
  escalation: "visibly more displaced than the opening moment",
  reveal: "at a point of displacement Instagram never showed",
  payoff: "at its most displaced point of the whole set",
  afterglow: "relaxed back toward settled, the peak has passed",
};
const BEAT_FACIAL_ROLE: Record<ShotStep, string> = {
  bridge: "aware of being seen, not yet addressing camera",
  private_access: "first direct, private acknowledgment of camera",
  escalation: "engaged, holding eye contact",
  reveal: "direct, unguarded eye contact",
  payoff: "the most direct, most inviting gaze of the set",
  afterglow: "soft, no longer performing for camera",
};
const BEAT_VISIBLE_ACTION_VERB: Record<ShotStep, string> = {
  bridge: "arrives into the moment",
  private_access: "moves into the more private part of the space",
  escalation: "settles further in, the action or space shifting",
  reveal: "turns to reveal what wasn't shown before",
  payoff: "reaches the visual peak of the moment",
  afterglow: "eases out of it, relaxed",
};

const BEAT_FRAMING: Record<ShotStep, ShotFraming> = {
  bridge: "wide establishing",
  private_access: "medium",
  escalation: "medium-close",
  reveal: "close",
  payoff: "closest / intimate",
  afterglow: "medium",
};

// GRADATION_STEPS mirrors lib/fanvueContinuation.ts's own GRADATION_SHOT_STEPS precedent —
// afterglow is a deliberate wind-down, excluded from the monotonic framing requirement.
const GRADATION_STEPS: ShotStep[] = ["bridge", "private_access", "escalation", "reveal", "payoff"];
export const SHOT_STEP_ORDER: ShotStep[] = ["bridge", "private_access", "escalation", "reveal", "payoff", "afterglow"];

// tier is accepted (not read) to keep the call signature tier-explicit at every call site, even
// though the beat structure below is deliberately tier-agnostic (§7 doctrine) — the StoryDay's own
// situation data is what varies, not the tier.
export function buildShotDirections(situation: GenerativeSituation, tier: StoryTier): ShotDirection[] {
  void tier;
  const subject = "Vivienne, mid-20s, dark hair, slim athletic build";
  const continuity = "same woman, same outfit and setting throughout, continuous night";
  const baseLocation = situation.visual_execution.location;
  const pose = pickPose(situation);
  const facial = pickFacialExpression(situation);
  const wardrobe = pickWardrobeState(situation);
  const bodyEmphasis = pickBodyEmphasis(situation);
  const lighting = pickLighting(situation);
  const cameraMotion = pickCameraMotion(situation);
  const baseFraming = pickFraming(situation);

  return SHOT_STEP_ORDER.map((step) => ({
    source_step: step,
    subject,
    continuity,
    location: baseLocation,
    spatial_zone: BEAT_SPATIAL_DRIFT[step](baseLocation),
    visible_action: `she ${BEAT_VISIBLE_ACTION_VERB[step]}`,
    pose,
    wardrobe_state: `${wardrobe} — ${BEAT_WARDROBE_DISPLACEMENT[step]}`,
    body_emphasis: bodyEmphasis,
    facial_expression: `${facial} — ${BEAT_FACIAL_ROLE[step]}`,
    // BEAT_FRAMING sets the narrative floor; sexual_energy's framing never narrows it (only
    // widens if the situation's own energy level implies something closer than the beat default).
    framing: FRAMING_RANK[baseFraming] > FRAMING_RANK[BEAT_FRAMING[step]] ? baseFraming : BEAT_FRAMING[step],
    camera_angle: "eye-level",
    camera_motion: cameraMotion,
    lighting,
    atmosphere: situation.emotional_state,
  }));
}

export interface GradationCheck {
  passes: boolean;
  reasons: string[];
}

// §7 doctrine: each shot must change at least 3 of {spatial_zone, pose, framing, wardrobe_state,
// body_emphasis, visible_action, facial_expression(as viewer-relationship proxy)} from the
// previous one. Tier-agnostic — works on any ShotDirection[], not just the builder's own output,
// so it also catches a regression if someone hand-edits shots later.
const GRADATION_DIMENSIONS: Array<keyof ShotDirection> = [
  "spatial_zone",
  "pose",
  "framing",
  "wardrobe_state",
  "body_emphasis",
  "visible_action",
  "facial_expression",
];

export function checkGradation(shots: ShotDirection[]): GradationCheck {
  const reasons: string[] = [];
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const cur = shots[i];
    const changed = GRADATION_DIMENSIONS.filter((dim) => prev[dim] !== cur[dim]).length;
    if (changed < 3) {
      reasons.push(`shot ${i + 1} (${cur.source_step ?? i}) only changes ${changed}/7 dimensions from the previous shot — need >= 3`);
    }
  }
  // Framing (camera proximity) must not decrease across the escalation ramp (afterglow excluded,
  // same wind-down exception as lib/fanvueContinuation.ts's GRADATION_SHOT_STEPS).
  let lastRank = -1;
  for (const step of GRADATION_STEPS) {
    const shot = shots.find((s) => s.source_step === step);
    if (!shot) continue;
    const rank = FRAMING_RANK[shot.framing];
    if (rank < lastRank) {
      reasons.push(`framing narrows at "${step}" — camera proximity must not decrease from bridge through payoff`);
      break;
    }
    lastRank = rank;
  }
  // afterglow must not repeat bridge (spatial_zone/pose/wardrobe_state identical == repeat).
  const bridge = shots.find((s) => s.source_step === "bridge");
  const afterglow = shots.find((s) => s.source_step === "afterglow");
  if (bridge && afterglow && bridge.spatial_zone === afterglow.spatial_zone && bridge.pose === afterglow.pose) {
    reasons.push("afterglow repeats bridge's spatial_zone and pose — must be visually distinct from the opening");
  }
  return { passes: reasons.length === 0, reasons };
}
