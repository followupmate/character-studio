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

// Environment-continuity fix (real production finding): Higgsfield Soul has no reference-image
// mechanism for BACKGROUND/environment (verified this session — an explicit reference_image_urls
// field was accepted by the API without error but had no visible effect on the output; Soul ID
// itself is deliberately character-only). Generic location text like "her city apartment
// building" or "a private hotel suite" left every independently-generated shot free to invent its
// own environment — one outdoor shot rendered a Paris/NYC hybrid skyline, another a completely
// different European town; the same failure mode applies indoors (a "bedroom" or "kitchen" with
// no concrete detail gets reinvented per shot just as freely). Same fix shape as
// ensureColorAnchored above: classify the location into a small family of environment types (each
// with its own small set of concrete, renderable anchor phrases — an outdoor skyline needs a
// building/skyline detail, a bedroom needs furniture/window detail, a car needs upholstery/trim
// detail), pick one anchor per StoryDay (via a deterministic hash of the location text) so the
// SAME concrete detail repeats verbatim across all 6 independently-generated shots instead of
// each one re-imagining the environment. Applies to every location, not just outdoor/skyline ones
// — a real finding after the first fix only covered rooftop/terrace/balcony scenes.
const SPECIFIC_DETAIL_PATTERN = /\b(landmark|named|overlooking the|facing the|tower of)\b/i;

type EnvironmentFamily =
  | "outdoor_skyline"
  | "outdoor_water"
  | "vehicle"
  | "indoor_bathroom"
  | "indoor_bedroom"
  | "indoor_kitchen"
  | "indoor_gym"
  | "indoor_living"
  | "indoor_generic";

// Order matters — a location can match multiple families (e.g. "rooftop pool terrace" contains
// both a skyline and a water cue); the first match wins, and outdoor_skyline is listed first
// since it's the real-production case this fix was originally verified against.
const ENVIRONMENT_FAMILY_PATTERNS: Array<{ family: EnvironmentFamily; pattern: RegExp }> = [
  { family: "outdoor_skyline", pattern: /\b(rooftop|terrace|balcony|skyline|city street|penthouse)\b/i },
  { family: "outdoor_water", pattern: /\b(pool|beach|lake|ocean|poolside|dock|marina)\b/i },
  { family: "vehicle", pattern: /\b(car|backseat|vehicle|limo|passenger seat)\b/i },
  { family: "indoor_bathroom", pattern: /\b(bathroom|bath\b|shower)\b/i },
  { family: "indoor_bedroom", pattern: /\b(bedroom|\bbed\b|suite)\b/i },
  { family: "indoor_kitchen", pattern: /\bkitchen\b/i },
  { family: "indoor_gym", pattern: /\b(gym|locker room|workout)\b/i },
  { family: "indoor_living", pattern: /\b(living room|lounge|sofa|couch)\b/i },
];

function classifyEnvironmentFamily(locationText: string): EnvironmentFamily {
  for (const { family, pattern } of ENVIRONMENT_FAMILY_PATTERNS) {
    if (pattern.test(locationText)) return family;
  }
  return "indoor_generic";
}

const ENVIRONMENT_ANCHORS: Record<EnvironmentFamily, string[]> = {
  outdoor_skyline: [
    "a pale limestone high-rise with wrought-iron balconies directly behind her, low terracotta rooftops spreading to the horizon, no distant skyscrapers",
    "a row of cream-colored buildings with zinc mansard roofs directly behind her, a dense low-rise skyline beyond, no distant skyscrapers",
    "a glass-and-steel tower with a stepped crown directly behind her, a wide grid of mid-rise city blocks below",
    "a red-brick facade with black steel fire escapes directly behind her, a low industrial skyline beyond, no distant skyscrapers",
    "a white concrete high-rise with rounded balconies directly behind her, a sprawl of orange-tiled roofs below, no distant skyscrapers",
  ],
  outdoor_water: [
    "turquoise pool water directly beside her, pale limestone coping, a row of dark green cypress trees along the far edge",
    "a curved infinity-edge pool directly beside her, teak sun loungers with white cushions along the near edge",
    "pale sand and weathered driftwood directly beside her, a low wooden beach fence in the middle distance",
  ],
  vehicle: [
    "cream leather seats and dark wood trim on the door panel behind her, warm interior cabin light",
    "black quilted leather seats and brushed-steel trim behind her, cool blue ambient interior light",
  ],
  indoor_bathroom: [
    "a freestanding oval stone bathtub behind her, matte black fixtures, a tall arched window to one side",
    "a marble double vanity behind her, a round brass-framed mirror, warm recessed lighting",
  ],
  indoor_bedroom: [
    "a tufted grey upholstered headboard behind her, a pair of brass reading lamps on the nightstands",
    "a large arched window with sheer white curtains behind her, pale oak flooring, a low wooden bench at the foot of the bed",
  ],
  indoor_kitchen: [
    "matte black cabinetry with brass hardware behind her, a veined white marble island to one side",
    "pale oak cabinetry behind her, open shelving with white ceramic dishware, a large window over the sink",
  ],
  indoor_gym: [
    "a full mirrored wall behind her, black rubber flooring, a rack of dumbbells along the near edge",
    "matte black gym equipment behind her, exposed concrete pillars, large factory-style windows",
  ],
  indoor_living: [
    "a low camel-colored linen sofa behind her, a brass floor lamp in the corner, pale linen curtains",
    "a dark green velvet sofa behind her, a round marble coffee table, tall potted plants in the corner",
  ],
  indoor_generic: [
    "pale plaster walls behind her, warm wood floorboards, soft indirect light from an unseen window",
    "textured cream walls behind her, a large framed mirror leaning against the wall, warm afternoon light",
  ],
};

function hashString(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

// Exported so lib/sceneBrief.ts (the Instagram daily-batch pipeline) can apply the SAME
// deterministic anchor to its scene brief's spatial_setup/location_constraints — a real production
// finding: even though that pipeline already shares ONE Claude-authored brief across all 7-8
// slots (unlike the old Fanvue system this was originally built for), the brief's own background
// description stayed generic ("low-rise rooflines, 2 to 4 storeys of buildings") and still drifted
// between independently-generated slots (reel_start_frame vs story_bts) — the identical failure
// mode this function exists to fix, just one level removed (vague shared text, not vague per-shot
// text).
export function ensureEnvironmentAnchored(locationText: string): string {
  if (SPECIFIC_DETAIL_PATTERN.test(locationText)) return locationText;
  const family = classifyEnvironmentFamily(locationText);
  const anchors = ENVIRONMENT_ANCHORS[family];
  const anchor = anchors[Math.abs(hashString(locationText)) % anchors.length];
  return `${locationText} — ${anchor}`;
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
  // Still threads the anchored location through — afterglow deliberately drifts to abstract
  // "pulled back" wind-down language, but must keep the SAME architectural anchor as the other 5
  // shots, or this one beat alone re-opens the environment-drift failure the anchor exists to fix.
  afterglow: (loc) => `pulled back slightly within the same private setting as ${loc}, winding down`,
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
  const baseLocation = ensureEnvironmentAnchored(situation.visual_execution.location);
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
