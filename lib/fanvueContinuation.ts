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
  contentLevel: ContentLevel;
  intensity: ShotIntensity;
  situationTension?: SituationFanvueTension;
  sensualVisualLanguage?: SensualVisualLanguage;
  sexAppealStyle?: SexAppealStyle;
  luxurySeduction?: LuxurySeduction;
  playfulHotWorld?: PlayfulHotWorldProfile;
}): string {
  const { step, series, storyDay, wardrobe, contentLevel, intensity } = args;
  const directive = STEP_DIRECTIVES[step][contentLevel === "premium_sensual" ? "soft" : "hot"];
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
