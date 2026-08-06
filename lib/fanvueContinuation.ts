import type { StoryTier, MagnetismLevel } from "@/lib/storyTier";
import {
  FANVUE_RULES,
  situationTensionClause,
  sensualVisualLanguageClause,
  sexAppealStyleClause,
  luxurySeductionClause,
  playfulHotWorldClause,
} from "@/lib/fanvuePrimitives";
import type { StoryDayLike, SituationFanvueTension } from "@/lib/fanvuePrimitives";
import type { SensualVisualLanguage, SexAppealStyle, LuxurySeduction, GenerativeSituation } from "@/lib/situationPlanner";
import type { PlayfulHotWorldProfile } from "@/lib/playfulHotWorldConfig";

// FANVUE PAID CONTINUATION (v1, flag: fanvue_paid_continuation_v1) — replaces the single flat
// fanvue_prompt with a structured, gradated 6-shot arc (bridge -> afterglow) plus a transparent
// commercial setup. Pure, deterministic template building — no new LLM call (see plan doc).
//
// PRODUCT DOCTRINE: Fanvue paid generation must maximize erotic value within the currently
// supported provider safety envelope. The objective is not to be conservative; the objective is
// to create a clearly paid-worthy erotic payoff while staying just below provider NSFW rejection.
// premium_sensual = softer paid continuation. erotic_tease = strongest provider-safe erotic tier,
// pushed deliberately close to the Higgsfield NSFW line, never over it. explicit_adult = manual/
// future-provider path only, never auto-generated in v1 (see lib/fanvueMediaProvider.ts).

export type ContentLevel = "premium_sensual" | "erotic_tease" | "explicit_adult";
export type ShotStep = "bridge" | "private_access" | "escalation" | "reveal" | "payoff" | "afterglow";
export type ShotIntensity = "soft" | "medium" | "strong";
export type ShotStatus = "pending" | "generated" | "approved" | "failed";

export const SHOT_STEPS: ShotStep[] = ["bridge", "private_access", "escalation", "reveal", "payoff", "afterglow"];

export interface FanvueShot {
  step: ShotStep;
  prompt: string;
  intensity: ShotIntensity;
  media_url: string | null;
  status: ShotStatus;
}

export interface FanvueCommercialSetup {
  mode: "subscription" | "ppv" | "bundle";
  price_eur: number;
  price_rationale: string[];
}

export interface FanvueContinuationPlan {
  source_tease: string;
  paid_promise: string;
  same_event_continuity: string;
  content_level: ContentLevel;
  set_format: "photo" | "video" | "mixed";
  commercial: FanvueCommercialSetup;
  shots: FanvueShot[];
  // Source-eligibility gate (validateFanvueSource) — computed once at plan-build time and
  // persisted on the plan so the ready-transition route doesn't need to re-fetch the source
  // situation. Never blocks plan CREATION (a draft is always written); only gates the later
  // `ready` transition, mirroring the confirmWeakPaidValue 409 pattern below.
  source_validation: SourceValidationCheck;
}

// Per-content-level intensity curve for the 6 steps. premium_sensual never exceeds "medium" —
// erotic_tease is deliberately pushed to "strong" at reveal/payoff (the provider-safe ceiling).
// explicit_adult keeps the same shape as erotic_tease as a data contract for a future provider;
// it is never used to actually generate media in v1 (lib/fanvueMediaProvider.ts rejects it).
const INTENSITY_CURVE: Record<ContentLevel, Record<ShotStep, ShotIntensity>> = {
  premium_sensual: {
    bridge: "soft", private_access: "soft", escalation: "medium",
    reveal: "medium", payoff: "medium", afterglow: "soft",
  },
  erotic_tease: {
    bridge: "soft", private_access: "medium", escalation: "medium",
    reveal: "strong", payoff: "strong", afterglow: "medium",
  },
  explicit_adult: {
    bridge: "soft", private_access: "medium", escalation: "strong",
    reveal: "strong", payoff: "strong", afterglow: "medium",
  },
};

// Step-directive clauses. "soft" variant is used for premium_sensual (and as the base for
// explicit_adult's data contract). "hot" variant is the erotic_tease wording — this is where the
// "maximize erotic value within the provider-safe envelope" doctrine actually lives: escalation/
// reveal/payoff lean on the erotic-cue vocabulary (2.3a) — lingerie-adjacent styling, implied
// undress progression, robe/open-shirt reveal logic, semi-sheer/clinging fabric, bed/bath/private
// room context, stronger body emphasis, intimate seated/lying/kneeling poses, direct buyer-facing
// eye contact — while staying short of nudity/explicit-act wording, which Higgsfield rejects as
// NSFW outright (lib/higgsfieldSoul.ts).
// Explicit, monotonic camera-framing-distance ladder (item 8) — anchors each of the 6 steps to a
// distinct, renderable camera setup INDEPENDENT of the shared clause suffix (situation/sensual/
// sex-appeal/luxury/playful clauses dominate prompt length otherwise, diluting the step-specific
// directive and making the arc read as repetitive). Distance narrows step by step, then pulls
// back for afterglow — pairs with validatePaidValue()'s monotonic-intensity check (item 5),
// which now enforces the same ramp structurally rather than relying on wording alone.
const STEP_DIRECTIVES: Record<ShotStep, { soft: string; hot: string }> = {
  bridge: {
    soft: "She steps away from the public moment into a quieter, more private version of the same space. Camera framing: wide, doorway/entryway establishing shot.",
    hot: "She steps away from the public moment into a private space — the transition itself already charged: a doorway, a low light switch, a look back over the shoulder toward the camera. Camera framing: wide, doorway/entryway establishing shot.",
  },
  private_access: {
    soft: "Alone now, comfortable and unguarded, still within the same setting. Camera framing: medium, full-room establishing shot.",
    hot: "Alone now, she starts shedding the public version of herself — a robe loosened, a shirt half-unbuttoned, a strap slipping — comfortable knowing only the buyer sees this. Camera framing: medium, full-room establishing shot.",
  },
  escalation: {
    soft: "A slightly bolder pose within the same tasteful range, more relaxed and confiding. Camera framing: medium-close, waist-up.",
    hot: "Escalating: fabric clinging or slipping, more skin implied through sheer or open layers, stronger body emphasis, the private-room context (bed, bath, mirror) doing more of the work. Camera framing: medium-close, waist-up.",
  },
  reveal: {
    soft: "The clearest, most intimate framing of the set, still soft and tasteful. Camera framing: close, upper-body.",
    hot: "The reveal moment — the element withheld from Instagram is finally shown, in the strongest silhouette and exposure the set allows, with direct eye contact toward the buyer. Camera framing: close, upper-body.",
  },
  payoff: {
    soft: "The peak moment of the set: warm, confident, unmistakably intimate. Camera framing: closest, most intimate framing the set allows.",
    hot: "The payoff shot — the single most erotic, provider-safe frame in the entire set: maximum implied undress, closest and most intimate framing (seated, lying, or kneeling), most direct and inviting gaze — the clear reason this was worth paying for. Camera framing: closest, most intimate framing the set allows.",
  },
  afterglow: {
    soft: "Winding down, soft and relaxed, the moment settling. Camera framing: medium, pulling back out.",
    hot: "Afterglow: intensity easing back toward soft, satisfied and unhurried, still within the same private space. Camera framing: medium, pulling back out.",
  },
};

// Substrings that only appear in the "hot" (erotic_tease) directive text above — used by
// validatePaidValue() to check a shot's prompt actually carries an erotic cue distinct from the
// IG-safe wording, rather than just reusing the soft/premium_sensual phrasing.
const EROTIC_CUE_MARKERS = [
  "loosened", "unbuttoned", "slipping", "clinging", "sheer", "implied undress",
  "most erotic", "reveal moment", "maximum implied undress", "kneeling",
];

function containsEroticCue(prompt: string): boolean {
  return EROTIC_CUE_MARKERS.some((m) => prompt.includes(m));
}

// ── luxe_car shot blueprint (hard shot-role separation) ──
// Found via a real live draft: the generic STEP_DIRECTIVES above are tier-agnostic template text
// ("Alone now, she starts shedding..." / "Camera framing: medium, full-room establishing shot")
// that doesn't fit a car scene at all, and only varies wording/intensity — not pose, camera
// distance, spatial zone, garment state, body emphasis, or viewer relationship. The result reads
// as 6 angle variations of one standing/stepping-out-of-car pose, not a narrative progression.
// This blueprint gives luxe_car sets a genuinely distinct pose/spatial/garment arc per step,
// scoped to this one tier for now (extending to others is future work — see visualDiversityCheck's
// no-op-when-unrecognized guard below, which keeps this from silently penalizing other tiers).
type CameraDistanceLabel = "wide" | "medium" | "medium-close" | "close" | "closest";
interface LuxeCarShotBlueprint {
  pose_family: string;
  pose_archetype: string;
  camera_distance: CameraDistanceLabel;
  spatial_zone: string;
  garment_state: { soft: string; hot: string };
  body_emphasis: { soft: string; hot: string };
  viewer_relationship: { soft: string; hot: string };
}

// Hard, verbatim locks appended to EVERY luxe_car shot prompt — not per-step content, deliberately
// invariant text. Two real-draft failures drove this: (1) escalation rendered two instances of
// Vivienne in one frame — a rendering failure the prompt itself has to actively guard against, not
// just avoid triggering; (2) nothing pinned the scene to "still night" once shots moved beyond the
// literal open car door, risking a drift to daylight/dusk framing across the set.
const LUXE_CAR_SINGLE_PERSON_LOCK =
  "Exactly one adult woman in the entire image. Show only one temporal moment and one body position. Do not depict sequential movement phases, reflections resembling another person, duplicates, clones, repeated bodies or another instance of Vivienne.";
const LUXE_CAR_TEMPORAL_LIGHTING_LOCK =
  "Continuous late-night setting from the source scene. Dark city street, warm artificial street and vehicle lighting, dark sky, no daylight, no sunrise, no sunset, no blue-hour transition. Preserve the same weather, street surface and overall color temperature throughout the entire set.";
// Only for escalation/reveal/payoff/afterglow — bridge/private_access ARE the arrival/doorway
// moment these exclusions forbid repeating, so applying them there would be self-contradictory.
const LUXE_CAR_LATER_SHOT_EXCLUSIONS =
  "Do not show the bridge pose. Do not show her standing outside beside the open car door. Do not use the same exposed-back over-the-shoulder composition. Do not merely change her head angle.";

// Spatial progression (real-draft finding #2): six shots at the same open car door read as static
// angle variation no matter how the pose text differs. The event stays continuous (same car, same
// outfit, same night) but the LOCATION now genuinely moves — curbside -> fully inside the car ->
// the car arriving at a private underground garage -> deepest moment there -> stepping back out.
// Camera distance still only tightens (never resets to a wide establishing shot at the garage) so
// the monotonic camera-proximity requirement holds even though the environment changes.
const LUXE_CAR_SHOT_BLUEPRINT: Record<ShotStep, LuxeCarShotBlueprint> = {
  bridge: {
    pose_family: "car_exterior_arrival",
    pose_archetype: "standing just outside the open car door, one hand still resting on the door frame, arriving into the moment, full figure visible against the car and street",
    camera_distance: "wide",
    spatial_zone: "exterior, beside the car at the curb, full figure with the car and dark street behind her",
    garment_state: {
      soft: "outfit fully closed and settled, exactly as worn on Instagram",
      hot: "outfit fully closed and settled, exactly as worn on Instagram — nothing shifted yet",
    },
    body_emphasis: { soft: "overall silhouette and the line of the outfit", hot: "overall silhouette and the line of the outfit" },
    viewer_relationship: {
      soft: "a passerby's glance — aware of being seen, not yet addressing the camera directly",
      hot: "a passerby's glance — aware of being seen, not yet addressing the camera directly",
    },
  },
  private_access: {
    pose_family: "car_rear_seat_edge",
    pose_archetype: "seated on the edge of the rear seat, one leg still outside the car resting on the curb, the other drawn in, door still open beside her",
    camera_distance: "medium",
    spatial_zone: "car doorway threshold, half in frame, the interior visible behind her, still curbside",
    garment_state: {
      soft: "outfit unchanged but the open back now catching the warm cabin light as she settles onto the seat",
      hot: "the open back now fully caught in the cabin light as she settles onto the seat — the halter tie at the neck loosened a fraction",
    },
    body_emphasis: {
      soft: "waist and the beginning of the thigh line as she sits at the seat's edge",
      hot: "waist, hip line and the open back as she settles onto the seat edge, thigh line beginning to show below the shorts hem",
    },
    viewer_relationship: {
      soft: "the first direct acknowledgment of the camera — a private aside",
      hot: "the first direct acknowledgment of the camera — a private aside, a small deliberate pause",
    },
  },
  escalation: {
    pose_family: "car_interior_full",
    pose_archetype: "fully inside the car now, door closed, seated properly in the back seat with both legs drawn in, torso turned to face the camera",
    camera_distance: "medium-close",
    spatial_zone: "car interior, fully enclosed now, door closed, street light passing softly through the window",
    garment_state: {
      soft: "shorts settled at mid-thigh now that she's fully seated, halter neckline unchanged",
      hot: "shorts riding higher on the thigh now that she's fully seated, halter tie visibly loosened at the neck",
    },
    body_emphasis: {
      soft: "thigh line and seated waist curve, now fully visible with both legs in frame",
      hot: "thigh line and seated waist curve, now fully visible with both legs in frame, the loosened halter drawing the eye to the collarbone",
    },
    viewer_relationship: {
      soft: "engaged, holding eye contact as if inviting the camera closer",
      hot: "engaged, holding eye contact as if inviting the camera closer — the privacy of the closed door changing the mood",
    },
  },
  reveal: {
    pose_family: "car_garage_continuation",
    pose_archetype: "the car has pulled into a private underground garage and parked, engine off — she has shifted position inside, half-turned toward the camera with the garage's dim overhead light replacing the street glow",
    camera_distance: "close",
    spatial_zone: "car interior, now parked in a private underground garage — a genuinely new location, only the garage's dim overhead light and the car's cabin glow, same car, same outfit",
    garment_state: {
      soft: "the open back fully visible in the garage light, shorts hem at its highest point so far",
      hot: "the open back fully visible in the garage light, halter tie loosened further, shorts hem at its highest point of the set so far",
    },
    body_emphasis: {
      soft: "the open back and thigh together, now the two clear focal points",
      hot: "the open back and thigh together, now the two clear focal points, more of the leg visible than any prior shot",
    },
    viewer_relationship: {
      soft: "direct, unguarded eye contact — the moment turns toward the buyer specifically now that they're truly alone",
      hot: "direct, unguarded eye contact — the moment turns toward the buyer specifically now that they're truly alone, nothing held back",
    },
  },
  payoff: {
    pose_family: "car_garage_peak",
    pose_archetype: "still inside the car in the private garage, reclined across the back seat, one hand braced on the seat behind her, body arched slightly toward the camera — the closest and most intimate framing of the entire set",
    camera_distance: "closest",
    spatial_zone: "car interior, parked in the private garage, the tightest frame of the set, garage and cabin light the only source",
    garment_state: {
      soft: "the outfit at its most settled and revealing point within the provider-safe boundary",
      hot: "maximum implied undress within the provider-safe boundary — the open back fully caught in the light, the halter and shorts at their most displaced point of the entire set",
    },
    body_emphasis: {
      soft: "back, waist and thigh together, the clear focal point of the set",
      hot: "maximum emphasis on back, waist and thigh together — visibly more leg shown than any prior shot — the clear reason this was worth paying for",
    },
    viewer_relationship: {
      soft: "the closest, most private moment of the set, held for the buyer alone",
      hot: "the closest, most private moment of the set — a direct invitation held for the buyer alone",
    },
  },
  afterglow: {
    pose_family: "car_garage_settled",
    pose_archetype: "stepped halfway out of the car in the quiet garage, leaning against the open door, a soft and relaxed private closing moment",
    camera_distance: "medium",
    spatial_zone: "the private underground garage, pulled back slightly, only ambient garage light, the car beside her",
    garment_state: {
      soft: "outfit relaxed back to settled, no longer at its most displaced point",
      hot: "outfit relaxed back to settled, no longer at its most displaced point — the peak has passed",
    },
    body_emphasis: { soft: "a softened overall line, no single focal point", hot: "a softened overall line, no single focal point" },
    viewer_relationship: {
      soft: "quiet and private, no longer performing for the camera — the buyer is simply there",
      hot: "quiet and private, no longer performing for the camera — the buyer is simply there",
    },
  },
};

function buildLuxeCarDirective(step: ShotStep, contentLevel: ContentLevel): string {
  const bp = LUXE_CAR_SHOT_BLUEPRINT[step];
  const variant = contentLevel === "premium_sensual" ? "soft" : "hot";
  const exclusions = step === "bridge" || step === "private_access" ? "" : ` ${LUXE_CAR_LATER_SHOT_EXCLUSIONS}`;
  return `${bp.pose_archetype}. Spatial zone: ${bp.spatial_zone}. Garment state: ${bp.garment_state[variant]}. Body emphasis: ${bp.body_emphasis[variant]}. Viewer relationship: ${bp.viewer_relationship[variant]}. Camera framing: ${bp.camera_distance}. ${LUXE_CAR_SINGLE_PERSON_LOCK} ${LUXE_CAR_TEMPORAL_LIGHTING_LOCK}${exclusions}`;
}

// Pose-family classifier — recognizes both the new luxe_car blueprint's distinct per-step poses
// AND the generic/duplicative stances that caused the original complaint (standing beside the
// car door / torso turned back / looking over shoulder), so the near-duplicate guard below can
// catch a regression back to that failure mode, not just validate the new blueprint's own output.
const POSE_FAMILY_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: "car_exterior_arrival", pattern: /\bstanding just outside the open car door\b/i },
  { family: "car_rear_seat_edge", pattern: /\bseated on the edge of the rear seat\b/i },
  { family: "car_interior_full", pattern: /\bfully inside the car now, door closed\b/i },
  { family: "car_garage_continuation", pattern: /\bthe car has pulled into a private underground garage\b/i },
  { family: "car_garage_peak", pattern: /\bstill inside the car in the private garage, reclined\b/i },
  { family: "car_garage_settled", pattern: /\bstepped halfway out of the car in the quiet garage\b/i },
  { family: "standing_beside_car_door", pattern: /\bstanding\b[^.]{0,40}\b(beside|next to)\b[^.]{0,20}\bopen car door\b/i },
  { family: "torso_turned_back", pattern: /\btorso\b[^.]{0,10}\bturned back\b/i },
  { family: "looking_over_shoulder", pattern: /\blooking\b[^.]{0,10}\bover (her |the )?shoulder\b/i },
];

export function classifyPoseFamily(prompt: string): string | null {
  for (const { family, pattern } of POSE_FAMILY_PATTERNS) {
    if (pattern.test(prompt)) return family;
  }
  return null;
}

// Extracts the camera-distance rank from the "Camera framing: X." sentence every shot prompt
// carries (item 8's original ladder + the luxe_car blueprint's camera_distance both use this same
// convention). Order matters: "closest"/"medium-close" must be checked before the shorter
// substrings ("close"/"medium") they contain, or they'd never be reached.
const CAMERA_DISTANCE_LABEL_ORDER: Array<{ label: string; rank: number }> = [
  { label: "closest", rank: 4 },
  { label: "medium-close", rank: 2 },
  { label: "close", rank: 3 },
  { label: "wide", rank: 0 },
  { label: "medium", rank: 1 },
];

export function extractCameraDistanceRank(prompt: string): number | null {
  const m = prompt.match(/Camera framing:\s*([^.]*)\./i);
  if (!m) return null;
  const seg = m[1].toLowerCase();
  for (const { label, rank } of CAMERA_DISTANCE_LABEL_ORDER) {
    if (seg.includes(label)) return rank;
  }
  return null;
}

export interface VisualDiversityCheck {
  passes: boolean;
  reasons: string[];
}

const STANCE_REPEAT_LIMIT = 2; // reject a pose family appearing in MORE than 2 (i.e. 3+) shots
const CAMERA_REPEAT_LIMIT = 2; // reject a camera distance appearing in MORE than 2 (i.e. 3+) shots
const MIN_UNIQUE_POSE_FAMILIES = 4; // "reads as angle variation, not narrative progression" guard

// Hard separation between shot roles + near-duplicate stance guard + visible-progression
// enforcement, all in one deterministic (no LLM judge) check. Scoped to whichever tier(s) have a
// shot blueprint the classifier recognizes — currently luxe_car only: if NO shot's pose is
// recognized at all, this plan predates/doesn't use a blueprint and the check is a clean no-op,
// never a false failure for a tier this guard doesn't cover yet. Folded into validatePaidValue()
// below rather than kept as a parallel gate, since "does this read as a real paid escalation, not
// angle variation" is squarely the same question validatePaidValue already owns.
export function visualDiversityCheck(plan: FanvueContinuationPlan): VisualDiversityCheck {
  const families = plan.shots.map((s) => classifyPoseFamily(s.prompt));
  if (families.every((f) => f === null)) return { passes: true, reasons: [] };

  const reasons: string[] = [];

  const familyCounts = new Map<string, number>();
  for (const family of families) {
    if (family) familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  for (const [family, count] of familyCounts) {
    if (count > STANCE_REPEAT_LIMIT) {
      reasons.push(`pose family "${family}" repeats across ${count} shots (max ${STANCE_REPEAT_LIMIT}) — each shot needs a distinct pose archetype`);
    }
  }

  const frameCounts = new Map<number, number>();
  for (const shot of plan.shots) {
    const rank = extractCameraDistanceRank(shot.prompt);
    if (rank !== null) frameCounts.set(rank, (frameCounts.get(rank) ?? 0) + 1);
  }
  for (const [, count] of frameCounts) {
    if (count > CAMERA_REPEAT_LIMIT) {
      reasons.push(`camera framing repeats across ${count} shots (max ${CAMERA_REPEAT_LIMIT}) — camera distance must vary across the set`);
    }
  }

  const reveal = plan.shots.find((s) => s.step === "reveal");
  const payoff = plan.shots.find((s) => s.step === "payoff");
  if (reveal && payoff) {
    const revealRank = extractCameraDistanceRank(reveal.prompt);
    const payoffRank = extractCameraDistanceRank(payoff.prompt);
    if (revealRank !== null && payoffRank !== null && payoffRank <= revealRank) {
      reasons.push("payoff is not clearly more intimate (closer) than reveal");
    }
  }

  const bridgeFamily = classifyPoseFamily(plan.shots.find((s) => s.step === "bridge")?.prompt ?? "");
  const afterglowFamily = classifyPoseFamily(plan.shots.find((s) => s.step === "afterglow")?.prompt ?? "");
  if (bridgeFamily && afterglowFamily && bridgeFamily === afterglowFamily) {
    reasons.push("afterglow repeats bridge's pose family — must be visually distinct from the arrival stance");
  }

  const uniqueFamilies = new Set(families.filter((f): f is string => !!f));
  if (uniqueFamilies.size < MIN_UNIQUE_POSE_FAMILIES) {
    reasons.push(`only ${uniqueFamilies.size} distinct pose families recognized across the set (need >= ${MIN_UNIQUE_POSE_FAMILIES}) — set reads as angle variation, not narrative progression`);
  }

  return { passes: reasons.length === 0, reasons };
}

// Default content_level per tier/magnetism/tension — deliberately more aggressive than a plain
// intensity->content_level remap: intimate_aesthetic and luxe_car default straight to
// erotic_tease (they're already the two highest-probability, highest-price tiers today), and any
// tier with a "strong" Fanvue tension promise on Instagram escalates too, since the payoff must
// match what was promised. explicit_adult is never returned here — always a manual override.
export function defaultContentLevel(
  tier: StoryTier,
  magnetism: MagnetismLevel | null,
  tensionPotential?: SituationFanvueTension["potential"]
): Exclude<ContentLevel, "explicit_adult"> {
  if (tier === "intimate_aesthetic" || tier === "luxe_car") return "erotic_tease";
  if (tier === "lived_moments") {
    if (magnetism === "sensual") return "erotic_tease";
    if (tensionPotential === "strong") return "erotic_tease";
    return "premium_sensual";
  }
  if (tensionPotential === "strong") return "erotic_tease";
  return "premium_sensual";
}

export interface SourceValidationCheck {
  ok: boolean;
  reasons: string[];
}

// Source-eligibility gate for intimate_aesthetic (the tier already closest to "identical to IG",
// per the private-source-guard finding at buildShotPrompt() below). Never runs for other tiers —
// this iteration is scoped to the one tier the user flagged; extending it is a future call, not
// a silent default. A draft is ALWAYS created regardless of this result (see maybeCreateFanvueUnlock
// in lib/fanvueUnlock.ts) — this only gates the later `ready` status transition (see
// app/api/characters/fanvue-unlocks/route.ts), same non-silent-skip philosophy as validatePaidValue.
const CROWD_OR_OTHER_PEOPLE_PATTERN = /\b(crowd|other people|bystanders?|strangers?|friends?\s+(in\s+frame|nearby)|group\s+of)\b/i;
const PRIVATE_SECLUDED_PATTERN = /\b(private|secluded|exclusive|members[- ]only|access[- ]only)\b/i;
const ROOFTOP_POOL_PATTERN = /\b(rooftop|pool)\b/i;

export function validateFanvueSource(
  tier: StoryTier,
  situation: GenerativeSituation | null,
  situationValidated: boolean
): SourceValidationCheck {
  if (tier !== "intimate_aesthetic") return { ok: true, reasons: [] };

  const reasons: string[] = [];
  if (!situationValidated) reasons.push("source situation did not pass validation (situationValidated=false)");
  if (!situation) reasons.push("no source situation is available for this day");
  if (situation) {
    if (situation.social_context?.mode === "ambient_public") {
      reasons.push("source situation's social context is ambient_public — not private enough for a paid continuation");
    }
    const sceneText = [situation.reality_detail, situation.visual_execution?.location, situation.activity, situation.social_context?.implication]
      .filter(Boolean)
      .join(" ");
    if (CROWD_OR_OTHER_PEOPLE_PATTERN.test(sceneText)) {
      reasons.push("source scene text implies a crowd or other recognizable people");
    }
    if (ROOFTOP_POOL_PATTERN.test(sceneText) && !PRIVATE_SECLUDED_PATTERN.test(sceneText)) {
      reasons.push("source scene is a rooftop/pool without an explicit private/secluded qualifier");
    }
  }
  return { ok: reasons.length === 0, reasons };
}

// Strips the trailing "Boundary: ..." sentence sensualVisualLanguageClause() always appends —
// see the private-source-guard finding: reveal/payoff prompts otherwise simultaneously claim
// "the element withheld from Instagram is finally shown" (STEP_DIRECTIVES) AND restate the exact
// IG-safe boundary that supposedly still applies, undermining the entire paid-escalation premise.
// Local to this file (not lib/fanvuePrimitives.ts, which the legacy pipeline also uses) — only
// the paid-continuation shot prompts get this treatment, never the legacy fanvue_prompt.
function stripExposureBoundary(clause: string): string {
  return clause.replace(/\s*Boundary:\s*[^.]*\.\s*$/, "");
}

function buildShotPrompt(args: {
  step: ShotStep;
  series: string;
  storyDay: StoryDayLike;
  wardrobe: string;
  tier: StoryTier;
  contentLevel: ContentLevel;
  intensity: ShotIntensity;
  situationTension?: SituationFanvueTension;
  sensualVisualLanguage?: SensualVisualLanguage;
  sexAppealStyle?: SexAppealStyle;
  luxurySeduction?: LuxurySeduction;
  playfulHotWorld?: PlayfulHotWorldProfile;
}): string {
  const { step, series, storyDay, wardrobe, tier, contentLevel, intensity } = args;
  const directive = tier === "luxe_car"
    ? buildLuxeCarDirective(step, contentLevel)
    : STEP_DIRECTIVES[step][contentLevel === "premium_sensual" ? "soft" : "hot"];
  const situationClause = situationTensionClause(args.situationTension);
  const rawSensualClause = sensualVisualLanguageClause(args.sensualVisualLanguage);
  // Private-source guard (item 6) — the reveal/payoff steps' own directive text already claims
  // the IG-safe boundary is being crossed; restating that same boundary sentence verbatim
  // contradicts it. bridge/private_access/afterglow keep it (continuity anchor, nothing being
  // "revealed" yet), and premium_sensual never claims to cross the boundary at all.
  const stripsBoundary = (step === "escalation" || step === "reveal" || step === "payoff") && contentLevel !== "premium_sensual";
  const sensualClause = stripsBoundary ? stripExposureBoundary(rawSensualClause) : rawSensualClause;
  const sexAppealClause = sexAppealStyleClause(args.sexAppealStyle);
  const luxuryClause = luxurySeductionClause(args.luxurySeduction);
  const playfulClause = playfulHotWorldClause(args.playfulHotWorld);
  // Deliberately avoids spelling out anatomy/explicit-act terms even in negated form — a
  // keyword-based provider classifier can flag a prompt for containing the word at all,
  // negation or not (provider-safe guard, plan doc 2.3c). "Suggestive maximum, nothing explicit"
  // carries the same instruction without the risk.
  const rangeLabel = contentLevel === "premium_sensual"
    ? "tasteful paid-intimate range"
    : "strongest provider-safe erotic range — suggestive maximum, nothing explicit";
  return `Soul set for "${series}", shot "${step}". Continue the SAME real moment as today (${storyDay.location ?? "scene"}${storyDay.moment_family ? `, ${storyDay.moment_family}` : ""}). ${directive}${situationClause}${sensualClause}${sexAppealClause}${luxuryClause}${playfulClause} ${wardrobe ? `Wardrobe: ${wardrobe}. ` : ""}Intensity ${intensity} — ${rangeLabel}. Keep faithful Vivienne identity.`;
}

// Transparent, additive price proposal — no auto-optimization by performance (see plan doc 2.6).
// Base price/unlock-type still comes from the existing FANVUE_RULES tier baseline (tier weights
// are unchanged), then content_level/format/tension add clearly-labelled deltas the user can see
// and override before publish.
export function buildCommercialSetup(args: {
  tier: StoryTier;
  contentLevel: ContentLevel;
  shotCount: number;
  setFormat: "photo" | "video" | "mixed";
  tensionPotential?: SituationFanvueTension["potential"];
}): FanvueCommercialSetup {
  const rule = FANVUE_RULES[args.tier] ?? FANVUE_RULES.everyday_life!;
  const rationale: string[] = [
    `base ${args.tier.replace(/_/g, " ")} tier price $${rule.price.toFixed(2)}`,
    `${args.shotCount}-shot set`,
  ];
  let price = rule.price;
  if (args.contentLevel === "erotic_tease") {
    price += 3;
    rationale.push("erotic_tease content level (+$3 vs premium_sensual)");
  } else if (args.contentLevel === "explicit_adult") {
    price += 6;
    rationale.push("explicit_adult content level (+$6, manual/future path only)");
  }
  if (args.setFormat === "video" || args.setFormat === "mixed") {
    price += 4;
    rationale.push("includes video (+$4)");
  }
  if (args.tensionPotential === "strong") {
    price += 1;
    rationale.push("strong Fanvue tension already promised on Instagram (+$1)");
  }
  return {
    mode: rule.unlock,
    price_eur: Math.round(price * 100) / 100,
    price_rationale: rationale,
  };
}

export function buildFanvueContinuationPlan(args: {
  tier: StoryTier;
  series: string;
  storyDay: StoryDayLike;
  wardrobe: string;
  magnetism: MagnetismLevel | null;
  situationTension?: SituationFanvueTension;
  sensualVisualLanguage?: SensualVisualLanguage;
  sexAppealStyle?: SexAppealStyle;
  luxurySeduction?: LuxurySeduction;
  playfulHotWorld?: PlayfulHotWorldProfile;
  // Manual override only — e.g. a human re-planning a legacy draft, or explicitly picking
  // explicit_adult in the UI (still gated server-side by adult_content_verified before it can be
  // saved). defaultContentLevel() itself can never produce "explicit_adult".
  contentLevelOverride?: ContentLevel;
  // validateFanvueSource() inputs (item 0) — the raw source situation and whether it passed
  // validation. Optional/undefined-safe: a caller that doesn't have this context (e.g. an old
  // rebuild path) gets source_validation computed as if situation were unavailable, which is the
  // conservative (blocks-for-intimate_aesthetic) direction, not a silent bypass.
  situation?: GenerativeSituation | null;
  situationValidated?: boolean;
}): FanvueContinuationPlan {
  const contentLevel = args.contentLevelOverride ?? defaultContentLevel(args.tier, args.magnetism, args.situationTension?.potential);
  const curve = INTENSITY_CURVE[contentLevel];

  const shots: FanvueShot[] = SHOT_STEPS.map((step) => ({
    step,
    intensity: curve[step],
    prompt: buildShotPrompt({
      step,
      series: args.series,
      storyDay: args.storyDay,
      wardrobe: args.wardrobe,
      tier: args.tier,
      contentLevel,
      intensity: curve[step],
      situationTension: args.situationTension,
      sensualVisualLanguage: args.sensualVisualLanguage,
      sexAppealStyle: args.sexAppealStyle,
      luxurySeduction: args.luxurySeduction,
      playfulHotWorld: args.playfulHotWorld,
    }),
    media_url: null,
    status: "pending",
  }));

  const descriptor = (args.storyDay.hook_text || args.storyDay.location || args.storyDay.mood || "the full set").toString();
  const sourceTease = args.storyDay.hook_text || (args.storyDay.ig_caption ?? "").slice(0, 140) || descriptor;
  const withheld = args.situationTension?.withheld_element;
  const paidPromise = contentLevel === "premium_sensual"
    ? `A softer, more private continuation of "${descriptor}" — the intimate version Instagram doesn't show.`
    : `The strongest version of "${descriptor}" Instagram will never show${withheld ? ` — including ${withheld}` : ""}.`;
  const sameEventContinuity = `Same event as today: ${args.storyDay.location ?? "the same scene"}${args.storyDay.moment_family ? `, ${args.storyDay.moment_family}` : ""}.`;

  return {
    source_tease: sourceTease,
    paid_promise: paidPromise,
    same_event_continuity: sameEventContinuity,
    content_level: contentLevel,
    set_format: "photo",
    commercial: buildCommercialSetup({
      tier: args.tier,
      contentLevel,
      shotCount: shots.length,
      setFormat: "photo",
      tensionPotential: args.situationTension?.potential,
    }),
    shots,
    source_validation: validateFanvueSource(args.tier, args.situation ?? null, args.situationValidated ?? false),
  };
}

export interface PaidValueCheck {
  passes: boolean;
  reasons: string[];
}

// Intensity ranking for the monotonic-gradation check below — bridge->payoff must never step
// down. afterglow is intentionally excluded (it's a deliberate wind-down, not part of the ramp).
const INTENSITY_RANK: Record<ShotIntensity, number> = { soft: 0, medium: 1, strong: 2 };
const GRADATION_SHOT_STEPS: ShotStep[] = ["bridge", "private_access", "escalation", "reveal", "payoff"];

// Paid-value validation (plan doc 2.3b) — the controlling question is "would a paying buyer
// clearly receive a stronger erotic reward than on Instagram?". premium_sensual sets always pass
// (they're not claiming to be the maximal tier). For erotic_tease/explicit_adult sets (item 5,
// strengthened from the original single-marker check, which was close to tautological against
// template-generated prompts — STEP_DIRECTIVES' own "hot" text always injects a marker unless a
// user hand-edits every one of the three shots):
//   1. payoff shot must reach "strong" intensity (unchanged, legitimate original check),
//   2. at least 2 of the 3 escalation/reveal/payoff shots (not just 1) must carry a distinct
//      erotic-cue marker — harder for one edited shot alone to carry the whole check,
//   3. intensity must ramp up monotonically bridge->private_access->escalation->reveal->payoff —
//      operationalizes the gradation doctrine (item 8) as an enforced invariant, not just wording,
//   4. no two of escalation/reveal/payoff may have byte-identical prompts — catches copy-paste
//      edit mistakes (deliberately not a fuzzy-similarity check: the shared clause suffixes make
//      near-duplication expected and noisy to flag).
// This is a deterministic check (no LLM judge in v1, see plan doc) backed by a manual
// "reviewed: clearly stronger than IG?" checklist item in the UI.
export function validatePaidValue(plan: FanvueContinuationPlan): PaidValueCheck {
  if (plan.content_level === "premium_sensual") return { passes: true, reasons: [] };

  const reasons: string[] = [];
  const payoff = plan.shots.find((s) => s.step === "payoff");
  if (!payoff || payoff.intensity !== "strong") {
    reasons.push("payoff shot must reach strong intensity to be worth paying for");
  }

  const corroboratingShots = plan.shots.filter((s) => s.step === "escalation" || s.step === "reveal" || s.step === "payoff");
  const eroticCueHits = corroboratingShots.filter((s) => containsEroticCue(s.prompt)).length;
  if (eroticCueHits < 2) {
    reasons.push(`only ${eroticCueHits}/3 of escalation/reveal/payoff shots read as clearly stronger than the Instagram-safe wording — need at least 2`);
  }

  let lastRank = -1;
  let monotonic = true;
  for (const step of GRADATION_SHOT_STEPS) {
    const shot = plan.shots.find((s) => s.step === step);
    if (!shot) continue;
    const rank = INTENSITY_RANK[shot.intensity];
    if (rank < lastRank) {
      monotonic = false;
      break;
    }
    lastRank = rank;
  }
  if (!monotonic) {
    reasons.push("intensity does not ramp up monotonically from bridge through payoff");
  }

  const corroboratingPrompts = corroboratingShots.map((s) => s.prompt);
  if (new Set(corroboratingPrompts).size < corroboratingPrompts.length) {
    reasons.push("two or more of escalation/reveal/payoff have byte-identical prompts");
  }

  // Hard shot-role separation + near-duplicate stance guard + visible-progression enforcement
  // (currently meaningful for luxe_car via its shot blueprint; a clean no-op for tiers without
  // one yet — see visualDiversityCheck's doc comment).
  reasons.push(...visualDiversityCheck(plan).reasons);

  return { passes: reasons.length === 0, reasons };
}

// Duplicate-person / single-frame guard (item 7) — adapted from lib/situationValidation.ts's
// noSecondSharpFace, including its negation-aware pre-check (a real false-positive was found
// there on "no second face in frame" being rejected for containing the literal substring). The
// risk vector here is different from the IG side: STEP_DIRECTIVES' template text never contains
// risky duplicate-person phrasing — the actual risk is a user hand-editing a shot's prompt via
// shotPatch.prompt (see app/api/characters/fanvue-unlocks/route.ts). Non-blocking by design (see
// call site) — this is live human-edited free text, not a generated-then-validated situation.
const DUPLICATE_PERSON_PATTERN = /\b(mirror reflection[^.]*\bbehind her\b|her reflection walks|split[- ]screen|before\s*(and|\/)\s*after\b[^.]*side[- ]by[- ]side|two of her\b|both versions of her\b)/i;
const DUPLICATE_PERSON_NEGATION_PATTERN = /\b(no|never|without|not\s+a)\s+(second|duplicate|split[- ]screen)\b/i;

export function duplicatePersonRisk(prompt: string): string | null {
  if (DUPLICATE_PERSON_NEGATION_PATTERN.test(prompt)) return null;
  if (DUPLICATE_PERSON_PATTERN.test(prompt)) {
    return `prompt text risks rendering two instances of the character in one frame: "${prompt.slice(0, 160)}${prompt.length > 160 ? "..." : ""}"`;
  }
  return null;
}
