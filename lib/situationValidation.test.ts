import { describe, it, expect } from "vitest";
import {
  hasDesireOrDecision,
  activityHasReason,
  sexualEnergyWithinTierRange,
  sexualEnergyIsMoreThanSkin,
  noSecondSharpFace,
  notPureModelingPose,
  notPureTaskNoMagnetism,
  magnetismReasonPresent,
  rendersAsOneImage,
  fanvueContinuationDerivedFromEvent,
  noRecentClicheRepeat,
  respectsWeeklyBalance,
  validateGenerativeSituation,
  SITUATION_MAX_ATTEMPTS,
  ValidationContext,
  noGenericWardrobeSignal,
  sensualCueForWarm,
  sensualCuesForPlayful,
  sensualCuesForProvocative,
  sensualCuesForIntimate,
  bodyEmphasisRendersInShot,
  noGenericOutfitArchetype,
  silhouetteFocusRendersInShot,
  facialEnergyRequiredForLevel,
  intimateAestheticNotPureGymScene,
  luxeCarNoHomewear,
  facialEnergyMatchesContext,
  outfitArchetypeContextuallyPlausible,
  noGenericFashionDirection,
  fashionDirectionFamilyNotOverused,
  poseArchetypeFamilyNotOverused,
  bodyGeometryRendersInShot,
  poseArchetypeRendersInShot,
  luxuryConceptCoherence,
  socialStatusSignalIsVisuallyGrounded,
  barefootOnlyInPrivateContext,
  luxeCarRequiresNightlifeStyling,
  playfulHotWorldMatchesDictated,
  vitalityLevelCalmNotOverused,
  quietIndoorBeigeNotOverused,
  seasonalityLocationPlausible,
} from "./situationValidation";
import type { GenerativeSituation, SensualVisualLanguage, SexAppealStyle, LuxurySeduction } from "./situationPlanner";
import type { PlayfulHotWorldProfile } from "./playfulHotWorldConfig";

function baseSituation(overrides: Partial<GenerativeSituation> = {}): GenerativeSituation {
  return {
    content_tier: "lived_moments",
    current_life_context: "she just got back from a weekend trip",
    life_domain: "hotels_and_travel",
    continuity_phase: "aftermath",
    desire_signal: "she wants one more quiet morning before real life resumes",
    trigger: "the taxi dropped her off early",
    activity: "unpacking her suitcase by the window",
    reason: "she wants everything put away before she loses the motivation",
    social_context: { mode: "alone", implication: "she is alone in her apartment" },
    emotional_state: "unhurried",
    previous_consequence: null,
    next_implication: null,
    personality_signal: "she likes closing a loop before starting the next one",
    reality_detail: "one suitcase still half-open on the floor",
    magnetic_hook: "the quiet, private ordinariness of a morning after a trip",
    magnetism_reason: "private_access",
    sexual_energy: { level: "warm", expression: "an oversized shirt slipping off one shoulder as she leans over the case", boundary: "nothing below the waist visible" },
    fanvue_tension: { potential: "soft", continuation: "the rest of the suitcase unpacking, still in yesterday's underwear", withheld_element: null },
    visual_execution: { location: "her bedroom by the window", time_of_day: "morning", weather: "indoor", action_visible: "leaning over an open suitcase", shot_intent: "candid, caught mid-task" },
    ...overrides,
  };
}

const CTX: ValidationContext = {
  allowedSexualEnergyLevels: ["subtle", "warm", "playful", "provocative"],
  recentCliches: [],
  hadSufficientHistory: false,
};

describe("hasDesireOrDecision", () => {
  it("passes a situation with a real desire_signal", () => {
    expect(hasDesireOrDecision(baseSituation())).toBeNull();
  });
  it("fails when desire_signal is empty", () => {
    expect(hasDesireOrDecision(baseSituation({ desire_signal: "" }))).not.toBeNull();
  });
  it("fails when desire_signal describes only being observed (passive object)", () => {
    expect(hasDesireOrDecision(baseSituation({ desire_signal: "she is photographed" }))).not.toBeNull();
  });
});

describe("activityHasReason", () => {
  it("passes when reason is distinct from activity", () => {
    expect(activityHasReason(baseSituation())).toBeNull();
  });
  it("fails when reason is empty", () => {
    expect(activityHasReason(baseSituation({ reason: "" }))).not.toBeNull();
  });
  it("fails when reason merely repeats the activity", () => {
    expect(activityHasReason(baseSituation({ activity: "making coffee", reason: "making coffee" }))).not.toBeNull();
  });
});

describe("sexualEnergyWithinTierRange", () => {
  it("passes when the level is in the allowed set", () => {
    expect(sexualEnergyWithinTierRange(baseSituation(), CTX)).toBeNull();
  });
  it("fails when the level is outside the allowed set (e.g. everyday_life never allows intimate)", () => {
    const situation = baseSituation({ sexual_energy: { level: "intimate", expression: "x".repeat(20), boundary: "b" } });
    const ctx: ValidationContext = { ...CTX, allowedSexualEnergyLevels: ["subtle", "warm"] };
    expect(sexualEnergyWithinTierRange(situation, ctx)).not.toBeNull();
  });
});

describe("sexualEnergyIsMoreThanSkin", () => {
  it("passes a situational, non-skin-only expression", () => {
    expect(sexualEnergyIsMoreThanSkin(baseSituation())).toBeNull();
  });
  it("fails a bare skin-amount claim", () => {
    expect(sexualEnergyIsMoreThanSkin(baseSituation({ sexual_energy: { level: "warm", expression: "more skin showing", boundary: "b" } }))).not.toBeNull();
  });
  it("fails an empty expression", () => {
    expect(sexualEnergyIsMoreThanSkin(baseSituation({ sexual_energy: { level: "warm", expression: "", boundary: "b" } }))).not.toBeNull();
  });
});

describe("noSecondSharpFace", () => {
  it("passes a social_context implication with no second face", () => {
    expect(noSecondSharpFace(baseSituation())).toBeNull();
  });
  it("fails when implication describes a second recognizable face", () => {
    const situation = baseSituation({ social_context: { mode: "partial_companion", implication: "her friend's face is clearly visible next to hers" } });
    expect(noSecondSharpFace(situation)).not.toBeNull();
  });
  // iteration 4 regression — a live run false-flagged a sentence that explicitly DENIES a
  // second face because it contains the literal substring "second face".
  it("passes an implication that explicitly denies a second face (iteration 4 regression)", () => {
    const situation = baseSituation({
      social_context: { mode: "alone", implication: "she is the only subject — the cat is a warm shape across her legs, no second face in frame, animal body only partially visible" },
    });
    expect(noSecondSharpFace(situation)).toBeNull();
  });
  it("still fails an implication with 'second face' that is NOT negated", () => {
    const situation = baseSituation({ social_context: { mode: "partial_companion", implication: "a second face is clearly visible in the frame" } });
    expect(noSecondSharpFace(situation)).not.toBeNull();
  });
});

describe("notPureModelingPose", () => {
  it("passes a life-grounded reason", () => {
    expect(notPureModelingPose(baseSituation())).toBeNull();
  });
  it("fails a reason that exists only for the camera", () => {
    expect(notPureModelingPose(baseSituation({ reason: "for the photoshoot" }))).not.toBeNull();
  });
});

describe("notPureTaskNoMagnetism", () => {
  it("passes when magnetic_hook adds something beyond the bare activity", () => {
    expect(notPureTaskNoMagnetism(baseSituation())).toBeNull();
  });
  it("fails when magnetic_hook is missing", () => {
    expect(notPureTaskNoMagnetism(baseSituation({ magnetic_hook: "" }))).not.toBeNull();
  });
  it("fails when magnetic_hook merely restates the activity", () => {
    expect(notPureTaskNoMagnetism(baseSituation({ activity: "folding laundry", magnetic_hook: "folding laundry" }))).not.toBeNull();
  });
});

describe("magnetismReasonPresent", () => {
  it("passes a recognized reason with a concrete hook", () => {
    expect(magnetismReasonPresent(baseSituation())).toBeNull();
  });
  it("fails when magnetic_hook reduces to 'she is attractive'", () => {
    expect(magnetismReasonPresent(baseSituation({ magnetic_hook: "she is attractive" }))).not.toBeNull();
  });
});

describe("rendersAsOneImage", () => {
  it("passes a single-beat action", () => {
    expect(rendersAsOneImage(baseSituation())).toBeNull();
  });
  it("fails an action describing a sequence of moments", () => {
    const situation = baseSituation({ visual_execution: { ...baseSituation().visual_execution, action_visible: "she unpacks, then later that evening changes for dinner" } });
    expect(rendersAsOneImage(situation)).not.toBeNull();
  });
});

describe("fanvueContinuationDerivedFromEvent", () => {
  it("passes potential none with no continuation", () => {
    const situation = baseSituation({ fanvue_tension: { potential: "none", continuation: null, withheld_element: null } });
    expect(fanvueContinuationDerivedFromEvent(situation)).toBeNull();
  });
  it("fails potential none WITH a continuation set", () => {
    const situation = baseSituation({ fanvue_tension: { potential: "none", continuation: "something", withheld_element: null } });
    expect(fanvueContinuationDerivedFromEvent(situation)).not.toBeNull();
  });
  it("fails a non-none potential with a continuation unrelated to today's activity/location/domain", () => {
    const situation = baseSituation({ fanvue_tension: { potential: "soft", continuation: "a completely unrelated lingerie shoot on a yacht in Monaco", withheld_element: null } });
    expect(fanvueContinuationDerivedFromEvent(situation)).not.toBeNull();
  });
  it("fails strong potential without a withheld_element", () => {
    const situation = baseSituation({ fanvue_tension: { potential: "strong", continuation: "the rest of the suitcase unpacking", withheld_element: null } });
    expect(fanvueContinuationDerivedFromEvent(situation)).not.toBeNull();
  });
  it("passes strong potential with a withheld_element and a related continuation", () => {
    const situation = baseSituation({ fanvue_tension: { potential: "strong", continuation: "the rest of the suitcase unpacking", withheld_element: "what she was wearing underneath" } });
    expect(fanvueContinuationDerivedFromEvent(situation)).toBeNull();
  });
});

describe("noRecentClicheRepeat (warning, non-blocking)", () => {
  it("returns null when history is insufficient — anti-repeat only triggers with available data", () => {
    const situation = baseSituation({ sexual_cliches: ["mirror_selfie"] });
    expect(noRecentClicheRepeat(situation, { ...CTX, hadSufficientHistory: false, recentCliches: ["mirror_selfie"] })).toBeNull();
  });
  it("returns a warning (not an error) when a recent cliché repeats, with sufficient history", () => {
    const situation = baseSituation({ sexual_cliches: ["mirror_selfie"] });
    const warning = noRecentClicheRepeat(situation, { ...CTX, hadSufficientHistory: true, recentCliches: ["mirror_selfie"] });
    expect(warning).not.toBeNull();
  });
});

describe("respectsWeeklyBalance (warning, non-blocking)", () => {
  it("returns null without weeklyBalanceNudges context", () => {
    expect(respectsWeeklyBalance(baseSituation(), { ...CTX, hadSufficientHistory: true })).toBeNull();
  });
  it("flags a miss when a social day is still due but today is alone", () => {
    const situation = baseSituation({ social_context: { mode: "alone", implication: "alone" } });
    const warning = respectsWeeklyBalance(situation, {
      ...CTX,
      hadSufficientHistory: true,
      weeklyBalanceNudges: {
        needsSocialDay: true,
        needsMovementOrNewEnvironmentDay: false,
        needsProvocativeOrIntimateDay: false,
        needsIntimateHighlight: false,
        locationFamilyCapHit: false,
        consecutiveNightCapHit: false,
        needsCalmerContrastDay: false,
        needsSpontaneousDay: false,
      },
    });
    expect(warning).not.toBeNull();
  });
});

describe("validateGenerativeSituation", () => {
  it("a fully valid situation passes with no errors", () => {
    const result = validateGenerativeSituation(baseSituation(), CTX);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a situation whose magnetism_reason reduces to 'she is attractive' — as an ERROR, not a warning", () => {
    const result = validateGenerativeSituation(baseSituation({ magnetic_hook: "she is attractive" }), CTX);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a situation where Vivien is a passive object with no desire/decision", () => {
    const result = validateGenerativeSituation(baseSituation({ desire_signal: "" }), CTX);
    expect(result.ok).toBe(false);
  });

  it("rejects an unrelated Fanvue continuation", () => {
    const result = validateGenerativeSituation(
      baseSituation({ fanvue_tension: { potential: "clear", continuation: "a completely different rooftop pool scene in another city", withheld_element: null } }),
      CTX
    );
    expect(result.ok).toBe(false);
  });

  it("a cliché repeat alone (with sufficient history) produces a warning but does NOT fail validation", () => {
    const situation = baseSituation({ sexual_cliches: ["mirror_selfie"] });
    const ctx: ValidationContext = { ...CTX, hadSufficientHistory: true, recentCliches: ["mirror_selfie"] };
    const result = validateGenerativeSituation(situation, ctx);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("does not require a second consistent sharp face for a passing situation", () => {
    const result = validateGenerativeSituation(baseSituation(), CTX);
    expect(result.errors.some((e) => /second sharp/i.test(e))).toBe(false);
  });
});

describe("SITUATION_MAX_ATTEMPTS", () => {
  it("is bounded at 4 (1 initial + 3 retries, bumped from 3 in iteration 4 as a safety margin against the growing number of blocking checks) so the retry loop cannot hang", () => {
    expect(SITUATION_MAX_ATTEMPTS).toBe(4);
  });
});

// sensual_visual_language_v1 (iteration 2) — a production dry-run showed sexual_energy validated
// as "provocative"/"confident eye contact" but rendered as a neutral sweater-and-wine scene.
// These checks require the CONCRETE fields that actually reach the image prompt.
function sensualFixture(overrides: Partial<SensualVisualLanguage> = {}): SensualVisualLanguage {
  return {
    wardrobe_signal: "a fitted mini dress with thin straps, hem sitting mid-thigh",
    body_emphasis: "legs",
    gesture_or_action: "crossing her legs as she leans back against the counter",
    camera_relationship: "close private-camera distance, direct knowing eye contact",
    exposure_boundary: "nothing above mid-thigh, no cleavage in frame",
    ...overrides,
  };
}

const SENSUAL_CTX: ValidationContext = { allowedSexualEnergyLevels: ["subtle", "warm", "playful", "provocative", "intimate"], requireSensualVisualLanguage: true };

describe("noGenericWardrobeSignal", () => {
  it("passes a concrete garment description", () => {
    expect(noGenericWardrobeSignal("a fitted mini dress with thin straps")).toBeNull();
  });
  it("fails a denylisted generic label", () => {
    expect(noGenericWardrobeSignal("an attractive outfit")).not.toBeNull();
  });
  it("fails a long but purely abstract phrase with no garment word", () => {
    expect(noGenericWardrobeSignal("a beautifully considered and deliberately alluring ensemble that flatters her")).not.toBeNull();
  });
  it("fails when missing or too short", () => {
    expect(noGenericWardrobeSignal("")).not.toBeNull();
    expect(noGenericWardrobeSignal("a top")).not.toBeNull();
  });
});

describe("sensualCueForWarm", () => {
  it("is a no-op for non-warm levels", () => {
    expect(sensualCueForWarm(baseSituation({ sexual_energy: { level: "subtle", expression: "x".repeat(20), boundary: "b" } }))).toBeNull();
  });
  it("passes with ONLY a camera_relationship cue — no bolder outfit required, especially in an aftermath/recovery moment", () => {
    const situation = baseSituation({
      continuity_phase: "aftermath",
      sexual_energy: { level: "warm", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ wardrobe_signal: "", body_emphasis: "", gesture_or_action: "", camera_relationship: "close private-camera distance" }),
    });
    expect(sensualCueForWarm(situation)).toBeNull();
  });
  it("fails when sensual_visual_language is entirely missing", () => {
    const situation = baseSituation({ sexual_energy: { level: "warm", expression: "x".repeat(20), boundary: "b" } });
    expect(sensualCueForWarm(situation)).not.toBeNull();
  });
});

describe("sensualCuesForPlayful", () => {
  it("fails with only one cue present", () => {
    const situation = baseSituation({
      sexual_energy: { level: "playful", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ body_emphasis: "", gesture_or_action: "", camera_relationship: "" }),
    });
    expect(sensualCuesForPlayful(situation)).not.toBeNull();
  });
  it("passes with 2+ cues including wardrobe or body", () => {
    const situation = baseSituation({
      sexual_energy: { level: "playful", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
    });
    expect(sensualCuesForPlayful(situation)).toBeNull();
  });
});

describe("sensualCuesForProvocative", () => {
  it("fails when exposure_boundary is missing", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ exposure_boundary: "" }),
    });
    expect(sensualCuesForProvocative(situation)).not.toBeNull();
  });
  it("passes with all 4 concrete fields present", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
    });
    expect(sensualCuesForProvocative(situation)).toBeNull();
  });
});

describe("sensualCuesForIntimate", () => {
  it("fails when camera_relationship doesn't convey closeness", () => {
    const situation = baseSituation({
      sexual_energy: { level: "intimate", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ camera_relationship: "full-body framing from across the room" }),
      fanvue_tension: { potential: "strong", continuation: "the rest of the evening", withheld_element: "what happens after" },
    });
    expect(sensualCuesForIntimate(situation)).not.toBeNull();
  });
  it("fails when fanvue_tension.withheld_element is missing", () => {
    const situation = baseSituation({
      sexual_energy: { level: "intimate", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
      fanvue_tension: { potential: "soft", continuation: null, withheld_element: null },
    });
    expect(sensualCuesForIntimate(situation)).not.toBeNull();
  });
  it("passes with close camera_relationship + withheld_element + all provocative-tier fields", () => {
    const situation = baseSituation({
      sexual_energy: { level: "intimate", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
      fanvue_tension: { potential: "strong", continuation: "the rest of the evening", withheld_element: "what happens after" },
    });
    expect(sensualCuesForIntimate(situation)).toBeNull();
  });
});

describe("bodyEmphasisRendersInShot", () => {
  it("fails when body_emphasis is legs/thighs/waist/hips but shot_intent is a face-only close-up", () => {
    const situation = baseSituation({
      sensual_visual_language: sensualFixture({ body_emphasis: "legs" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "close-up on her face" },
    });
    expect(bodyEmphasisRendersInShot(situation)).not.toBeNull();
  });
  it("passes when body_emphasis is legs and shot_intent explicitly shows the body", () => {
    const situation = baseSituation({
      sensual_visual_language: sensualFixture({ body_emphasis: "legs" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs crossed" },
    });
    expect(bodyEmphasisRendersInShot(situation)).toBeNull();
  });
  it("passes when body_emphasis is collarbone/neckline with a close-up shot_intent (compatible)", () => {
    const situation = baseSituation({
      sensual_visual_language: sensualFixture({ body_emphasis: "collarbone and neckline" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "close-up on her face and neckline" },
    });
    expect(bodyEmphasisRendersInShot(situation)).toBeNull();
  });
  it("is a no-op when body_emphasis is not set", () => {
    const situation = baseSituation({ sensual_visual_language: undefined });
    expect(bodyEmphasisRendersInShot(situation)).toBeNull();
  });
});

describe("validateGenerativeSituation — requireSensualVisualLanguage", () => {
  it("without the flag, none of the sensual checks run even if sensual_visual_language is missing", () => {
    const situation = baseSituation({ sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" } });
    const result = validateGenerativeSituation(situation, CTX);
    expect(result.ok).toBe(true);
  });
  it("with the flag, a provocative situation with no sensual_visual_language fails", () => {
    const situation = baseSituation({ sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" } });
    const result = validateGenerativeSituation(situation, SENSUAL_CTX);
    expect(result.ok).toBe(false);
  });
  it("with the flag, a fully-specified provocative situation passes", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, SENSUAL_CTX);
    expect(result.ok).toBe(true);
  });
});

// ── sex_appeal_style_v1 (iteration 3) — explicit outfit archetype, silhouette/shot-intent
// compatibility, mandatory facial energy, hard tier bans. A live run still read as "attractive
// lifestyle profile" rather than sexually magnetic — these checks require the ARCHETYPE-level
// concreteness sensual_visual_language alone didn't force.
function sexAppealFixture(overrides: Partial<SexAppealStyle> = {}): SexAppealStyle {
  return {
    outfit_archetype: "a fitted bodycon mini dress, hem mid-thigh",
    silhouette_focus: "legs",
    leg_visibility: "fully visible, bare",
    facial_energy: "a teasing half-smile, direct eye contact",
    seduction_mode: "playful tease",
    ...overrides,
  };
}

const SEX_APPEAL_CTX: ValidationContext = {
  allowedSexualEnergyLevels: ["subtle", "warm", "playful", "provocative", "intimate"],
  requireSensualVisualLanguage: true,
  requireSexAppealStyle: true,
};

describe("noGenericOutfitArchetype", () => {
  it("passes a concrete archetype", () => {
    expect(noGenericOutfitArchetype("a fitted bodycon mini dress")).toBeNull();
  });
  it("fails a denylisted generic label", () => {
    expect(noGenericOutfitArchetype("an elegant look")).not.toBeNull();
  });
  it("fails a long but purely abstract phrase with no garment word", () => {
    expect(noGenericOutfitArchetype("a beautifully considered and deliberately alluring silhouette that flatters her")).not.toBeNull();
  });
  it("fails when missing or too short", () => {
    expect(noGenericOutfitArchetype("")).not.toBeNull();
    expect(noGenericOutfitArchetype("a top")).not.toBeNull();
  });
});

describe("silhouetteFocusRendersInShot", () => {
  it("fails when silhouette_focus is legs but shot_intent is a face-only close-up", () => {
    const situation = baseSituation({
      sex_appeal_style: sexAppealFixture({ silhouette_focus: "legs" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "close-up on her face" },
    });
    expect(silhouetteFocusRendersInShot(situation)).not.toBeNull();
  });
  it("passes when silhouette_focus is legs and shot_intent is full-body", () => {
    const situation = baseSituation({
      sex_appeal_style: sexAppealFixture({ silhouette_focus: "legs" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    expect(silhouetteFocusRendersInShot(situation)).toBeNull();
  });
  it("passes when silhouette_focus is waist/hips with a medium shot", () => {
    const situation = baseSituation({
      sex_appeal_style: sexAppealFixture({ silhouette_focus: "waist and hips" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "medium shot at the waist" },
    });
    expect(silhouetteFocusRendersInShot(situation)).toBeNull();
  });
  it("passes when silhouette_focus is neckline/collarbone with a close-up (face-adjacent, always compatible)", () => {
    const situation = baseSituation({
      sex_appeal_style: sexAppealFixture({ silhouette_focus: "neckline and collarbone" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "close-up on her face and neckline" },
    });
    expect(silhouetteFocusRendersInShot(situation)).toBeNull();
  });
  it("fails when silhouette_focus is shoulders/back with a frontal shot", () => {
    const situation = baseSituation({
      sex_appeal_style: sexAppealFixture({ silhouette_focus: "back and shoulders" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "frontal shot" },
    });
    expect(silhouetteFocusRendersInShot(situation)).not.toBeNull();
  });
  it("passes when silhouette_focus is shoulders/back with an over-shoulder shot", () => {
    const situation = baseSituation({
      sex_appeal_style: sexAppealFixture({ silhouette_focus: "back and shoulders" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "over-shoulder shot from behind" },
    });
    expect(silhouetteFocusRendersInShot(situation)).toBeNull();
  });
  it("is a no-op when silhouette_focus is not set", () => {
    const situation = baseSituation({ sex_appeal_style: undefined });
    expect(silhouetteFocusRendersInShot(situation)).toBeNull();
  });
});

describe("facialEnergyRequiredForLevel", () => {
  it("is a no-op for subtle/warm levels", () => {
    const situation = baseSituation({ sexual_energy: { level: "warm", expression: "x".repeat(20), boundary: "b" }, sex_appeal_style: undefined });
    expect(facialEnergyRequiredForLevel(situation)).toBeNull();
  });
  it("fails for playful/provocative/intimate when facial_energy is missing", () => {
    const situation = baseSituation({ sexual_energy: { level: "playful", expression: "x".repeat(20), boundary: "b" }, sex_appeal_style: sexAppealFixture({ facial_energy: "" }) });
    expect(facialEnergyRequiredForLevel(situation)).not.toBeNull();
  });
  it("fails a denylisted generic facial_energy", () => {
    const situation = baseSituation({ sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" }, sex_appeal_style: sexAppealFixture({ facial_energy: "neutral expression" }) });
    expect(facialEnergyRequiredForLevel(situation)).not.toBeNull();
  });
  it("passes a concrete facial_energy at provocative", () => {
    const situation = baseSituation({ sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" }, sex_appeal_style: sexAppealFixture() });
    expect(facialEnergyRequiredForLevel(situation)).toBeNull();
  });
});

describe("intimateAestheticNotPureGymScene", () => {
  it("is a no-op for a non-intimate_aesthetic tier", () => {
    const situation = baseSituation({ content_tier: "wellness_fitness", activity: "a gym session lifting weights" });
    expect(intimateAestheticNotPureGymScene(situation)).toBeNull();
  });
  it("fails a pure gym/workout scene in intimate_aesthetic with no transition context", () => {
    const situation = baseSituation({ content_tier: "intimate_aesthetic", continuity_phase: "standalone", activity: "lifting weights at the gym" });
    expect(intimateAestheticNotPureGymScene(situation)).not.toBeNull();
  });
  it("passes a gym reference with an explicit post-workout transition context", () => {
    const situation = baseSituation({ content_tier: "intimate_aesthetic", continuity_phase: "standalone", activity: "post-workout, catching her breath after the gym" });
    expect(intimateAestheticNotPureGymScene(situation)).toBeNull();
  });
  it("passes a gym reference when continuity_phase is aftermath", () => {
    const situation = baseSituation({ content_tier: "intimate_aesthetic", continuity_phase: "aftermath", activity: "still in her gym clothes" });
    expect(intimateAestheticNotPureGymScene(situation)).toBeNull();
  });
});

describe("luxeCarNoHomewear", () => {
  it("is a no-op for a non-luxe_car tier", () => {
    const situation = baseSituation({ content_tier: "everyday_life", sex_appeal_style: sexAppealFixture({ outfit_archetype: "a cozy oversized robe" }) });
    expect(luxeCarNoHomewear(situation)).toBeNull();
  });
  it("fails a robe/pyjama outfit_archetype in luxe_car", () => {
    const situation = baseSituation({ content_tier: "luxe_car", sex_appeal_style: sexAppealFixture({ outfit_archetype: "a silk robe over pyjamas" }) });
    expect(luxeCarNoHomewear(situation)).not.toBeNull();
  });
  it("passes a non-homewear outfit_archetype in luxe_car", () => {
    const situation = baseSituation({ content_tier: "luxe_car", sex_appeal_style: sexAppealFixture() });
    expect(luxeCarNoHomewear(situation)).toBeNull();
  });
});

describe("facialEnergyMatchesContext", () => {
  it("fails a teasing/seductive facial_energy paired with an incompatible emotional_state", () => {
    const situation = baseSituation({ emotional_state: "exhausted", sex_appeal_style: sexAppealFixture({ facial_energy: "a teasing seductive smile" }) });
    expect(facialEnergyMatchesContext(situation)).not.toBeNull();
  });
  it("passes a teasing facial_energy paired with a compatible emotional_state", () => {
    const situation = baseSituation({ emotional_state: "unhurried", sex_appeal_style: sexAppealFixture({ facial_energy: "a teasing seductive smile" }) });
    expect(facialEnergyMatchesContext(situation)).toBeNull();
  });
  it("is a no-op when facial_energy is not required/missing", () => {
    const situation = baseSituation({ emotional_state: "exhausted", sex_appeal_style: undefined });
    expect(facialEnergyMatchesContext(situation)).toBeNull();
  });
});

describe("outfitArchetypeContextuallyPlausible", () => {
  it("fails stockings paired with a beach/pool activity", () => {
    const situation = baseSituation({
      activity: "lounging by the pool",
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "sheer black thigh-high stockings" }),
    });
    expect(outfitArchetypeContextuallyPlausible(situation)).not.toBeNull();
  });
  it("passes stockings paired with a hotel/evening context", () => {
    const situation = baseSituation({
      life_domain: "hotels_and_travel",
      activity: "getting ready in the hotel room before dinner",
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "sheer black thigh-high stockings" }),
    });
    expect(outfitArchetypeContextuallyPlausible(situation)).toBeNull();
  });
  it("fails blazer-bare-legs paired with an active-gym context", () => {
    const situation = baseSituation({
      activity: "an active gym workout session",
      continuity_phase: "standalone",
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a fitted blazer with bare legs" }),
    });
    expect(outfitArchetypeContextuallyPlausible(situation)).not.toBeNull();
  });
  it("is a no-op for an outfit_archetype with no context-sensitive pattern", () => {
    const situation = baseSituation({ life_domain: "beach_pool_water", sex_appeal_style: sexAppealFixture() });
    expect(outfitArchetypeContextuallyPlausible(situation)).toBeNull();
  });
});

describe("validateGenerativeSituation — requireSexAppealStyle", () => {
  it("without the flag, none of the sex-appeal checks run even if sex_appeal_style is missing", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
    });
    const result = validateGenerativeSituation(situation, SENSUAL_CTX);
    expect(result.ok).toBe(true);
  });
  it("with the flag, a provocative situation with no sex_appeal_style fails", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
    });
    const result = validateGenerativeSituation(situation, SEX_APPEAL_CTX);
    expect(result.ok).toBe(false);
  });
  it("with the flag, a fully-specified provocative situation passes", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
      sex_appeal_style: sexAppealFixture(),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, SEX_APPEAL_CTX);
    expect(result.ok).toBe(true);
  });
  it("0 failures for intimateAestheticNotPureGymScene/luxeCarNoHomewear on a compliant non-gym intimate_aesthetic day", () => {
    const situation = baseSituation({
      content_tier: "intimate_aesthetic",
      sexual_energy: { level: "intimate", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
      sex_appeal_style: sexAppealFixture(),
      fanvue_tension: { potential: "strong", continuation: "the rest of the evening", withheld_element: "what happens after" },
      visual_execution: { location: "x", time_of_day: "evening", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, SEX_APPEAL_CTX);
    expect(result.errors.some((e) => /pure gym/i.test(e))).toBe(false);
    expect(result.errors.some((e) => /homewear/i.test(e))).toBe(false);
  });
});

// ── luxury_seduction_v1 (iteration 4) — wider fashion/pose/material/status vocabulary, hard
// (blocking, not soft) outfit/pose anti-repeat, luxe_car positive styling requirement, and
// cross-field coherence between fashion_direction/outfit_archetype/wardrobe_signal.
function luxuryFixture(overrides: Partial<LuxurySeduction> = {}): LuxurySeduction {
  return {
    luxury_level: "premium",
    fashion_direction: "a fitted bodycon mini dress in a metallic knit",
    material_language: "metallic knit, structured crepe lining",
    accessory_language: "statement earrings, a structured clutch",
    footwear: "pointed heels",
    pose_archetype: "seated sideways with crossed legs",
    body_geometry: "elongated leg line, waist-to-hip curve",
    facial_seduction: "a confident half-smile",
    social_status_signal: "a reserved table with a place card and a waiting glass of champagne",
    ...overrides,
  };
}

const LUXURY_CTX: ValidationContext = {
  allowedSexualEnergyLevels: ["subtle", "warm", "playful", "provocative", "intimate"],
  requireSensualVisualLanguage: true,
  requireSexAppealStyle: true,
  requireLuxurySeduction: true,
};

describe("noGenericFashionDirection", () => {
  it("passes a concrete archetype", () => {
    expect(noGenericFashionDirection("a fitted bodycon mini dress in a metallic knit")).toBeNull();
  });
  it("fails a denylisted generic label", () => {
    expect(noGenericFashionDirection("a generic mini dress")).not.toBeNull();
    expect(noGenericFashionDirection("an elegant outfit")).not.toBeNull();
  });
  it("fails when missing or too short", () => {
    expect(noGenericFashionDirection("")).not.toBeNull();
    expect(noGenericFashionDirection("a top")).not.toBeNull();
  });
});

describe("fashionDirectionFamilyNotOverused", () => {
  it("is a no-op when recentFashionDirectionFamilies is not provided", () => {
    const situation = baseSituation({ luxury_seduction: luxuryFixture() });
    expect(fashionDirectionFamilyNotOverused(situation, CTX)).toBeNull();
  });
  it("passes when the family has appeared fewer than 2 times recently", () => {
    const situation = baseSituation({ luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress" }) });
    const ctx: ValidationContext = { ...CTX, recentFashionDirectionFamilies: ["bodycon_dress"] };
    expect(fashionDirectionFamilyNotOverused(situation, ctx)).toBeNull();
  });
  it("blocks the 3rd occurrence of the same family within the window", () => {
    const situation = baseSituation({ luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress" }) });
    const ctx: ValidationContext = { ...CTX, recentFashionDirectionFamilies: ["bodycon_dress", "bodycon_dress"] };
    expect(fashionDirectionFamilyNotOverused(situation, ctx)).not.toBeNull();
  });
  it("falls back to sex_appeal_style.outfit_archetype when fashion_direction doesn't normalize", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ fashion_direction: "genuine hotel loungewear in a soft knit" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a fitted bodycon mini dress" }),
    });
    const ctx: ValidationContext = { ...CTX, recentFashionDirectionFamilies: ["bodycon_dress", "bodycon_dress"] };
    expect(fashionDirectionFamilyNotOverused(situation, ctx)).not.toBeNull();
  });
});

describe("poseArchetypeFamilyNotOverused", () => {
  it("passes when the pose family has appeared fewer than 2 times recently", () => {
    const situation = baseSituation({ luxury_seduction: luxuryFixture({ pose_archetype: "seated sideways with crossed legs" }) });
    const ctx: ValidationContext = { ...CTX, recentPoseArchetypeFamilies: ["seated_crossed_legs"] };
    expect(poseArchetypeFamilyNotOverused(situation, ctx)).toBeNull();
  });
  it("blocks the 3rd occurrence of the same pose family within the window", () => {
    const situation = baseSituation({ luxury_seduction: luxuryFixture({ pose_archetype: "seated sideways with crossed legs" }) });
    const ctx: ValidationContext = { ...CTX, recentPoseArchetypeFamilies: ["seated_crossed_legs", "seated_crossed_legs"] };
    expect(poseArchetypeFamilyNotOverused(situation, ctx)).not.toBeNull();
  });
});

describe("bodyGeometryRendersInShot", () => {
  it("fails when body_geometry is a leg line but shot_intent is a face-only close-up", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ body_geometry: "elongated leg line" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "close-up on her face" },
    });
    expect(bodyGeometryRendersInShot(situation)).not.toBeNull();
  });
  it("passes when body_geometry is a leg line and shot_intent is full-body", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ body_geometry: "elongated leg line" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    expect(bodyGeometryRendersInShot(situation)).toBeNull();
  });
  it("is a no-op when body_geometry is not set", () => {
    const situation = baseSituation({ luxury_seduction: undefined });
    expect(bodyGeometryRendersInShot(situation)).toBeNull();
  });
});

describe("poseArchetypeRendersInShot", () => {
  it("fails a lower-body pose (seated crossed legs) paired with a face-only close-up", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ pose_archetype: "seated sideways with crossed legs" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "close-up on her face" },
    });
    expect(poseArchetypeRendersInShot(situation)).not.toBeNull();
  });
  it("passes a lower-body pose with a full-body shot_intent", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ pose_archetype: "seated sideways with crossed legs" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body seated shot" },
    });
    expect(poseArchetypeRendersInShot(situation)).toBeNull();
  });
  it("is a no-op for a pose family with no shot-compatibility category (e.g. adjusting an earring)", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ pose_archetype: "adjusting an earring while looking at the photographer" }),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "close-up on her face" },
    });
    expect(poseArchetypeRendersInShot(situation)).toBeNull();
  });
});

describe("luxuryConceptCoherence", () => {
  it("passes when fashion_direction and outfit_archetype normalize to the same family", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress in a metallic knit" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a fitted bodycon mini dress" }),
    });
    expect(luxuryConceptCoherence(situation)).toBeNull();
  });
  it("fails when fashion_direction and outfit_archetype normalize to DIFFERENT families", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a satin slip dress" }),
    });
    expect(luxuryConceptCoherence(situation)).not.toBeNull();
  });
  it("fails when fashion_direction and wardrobe_signal normalize to DIFFERENT families", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress" }),
      sensual_visual_language: sensualFixture({ wardrobe_signal: "a satin slip dress with thin straps" }),
    });
    expect(luxuryConceptCoherence(situation)).not.toBeNull();
  });
  it("is a no-op when fashion_direction doesn't normalize to any known family", () => {
    const situation = baseSituation({
      luxury_seduction: luxuryFixture({ fashion_direction: "genuine hotel loungewear in a soft knit" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a satin slip dress" }),
    });
    expect(luxuryConceptCoherence(situation)).toBeNull();
  });
});

describe("socialStatusSignalIsVisuallyGrounded", () => {
  it("fails a bare declaration with no visual correlate", () => {
    expect(socialStatusSignalIsVisuallyGrounded(baseSituation({ luxury_seduction: luxuryFixture({ social_status_signal: "reserved table" }) }))).not.toBeNull();
    expect(socialStatusSignalIsVisuallyGrounded(baseSituation({ luxury_seduction: luxuryFixture({ social_status_signal: "private access" }) }))).not.toBeNull();
  });
  it("passes a status signal with a concrete visual correlate", () => {
    const situation = baseSituation({ luxury_seduction: luxuryFixture({ social_status_signal: "a reserved table with a place card and a waiting glass of champagne" }) });
    expect(socialStatusSignalIsVisuallyGrounded(situation)).toBeNull();
  });
  it("is a no-op when social_status_signal is missing", () => {
    expect(socialStatusSignalIsVisuallyGrounded(baseSituation({ luxury_seduction: undefined }))).toBeNull();
  });
});

describe("barefootOnlyInPrivateContext", () => {
  it("is a no-op when footwear doesn't mention barefoot", () => {
    expect(barefootOnlyInPrivateContext(baseSituation({ luxury_seduction: luxuryFixture({ footwear: "pointed heels" }) }))).toBeNull();
  });
  it("passes barefoot in a private/alone context", () => {
    const situation = baseSituation({ social_context: { mode: "alone", implication: "alone" }, luxury_seduction: luxuryFixture({ footwear: "barefoot" }) });
    expect(barefootOnlyInPrivateContext(situation)).toBeNull();
  });
  it("passes barefoot when continuity_phase is aftermath", () => {
    const situation = baseSituation({
      continuity_phase: "aftermath",
      social_context: { mode: "ambient_public", implication: "a public street" },
      activity: "walking to the car after the party",
      luxury_seduction: luxuryFixture({ footwear: "barefoot" }),
    });
    expect(barefootOnlyInPrivateContext(situation)).toBeNull();
  });
  it("fails barefoot in a non-private, non-aftermath, non-pool context", () => {
    const situation = baseSituation({
      continuity_phase: "standalone",
      social_context: { mode: "ambient_public", implication: "a busy street" },
      activity: "walking through the city center",
      life_domain: "movement_and_transit",
      visual_execution: { location: "a busy sidewalk", time_of_day: "midday", weather: "sunny", action_visible: "x", shot_intent: "x" },
      luxury_seduction: luxuryFixture({ footwear: "barefoot" }),
    });
    expect(barefootOnlyInPrivateContext(situation)).not.toBeNull();
  });
});

describe("luxeCarRequiresNightlifeStyling", () => {
  it("is a no-op for a non-luxe_car tier", () => {
    const situation = baseSituation({ content_tier: "everyday_life", luxury_seduction: luxuryFixture({ fashion_direction: "genuine hotel loungewear" }) });
    expect(luxeCarRequiresNightlifeStyling(situation)).toBeNull();
  });
  it("fails homewear in fashion_direction", () => {
    const situation = baseSituation({ content_tier: "luxe_car", luxury_seduction: luxuryFixture({ fashion_direction: "a silk robe over pyjamas" }) });
    expect(luxeCarRequiresNightlifeStyling(situation)).not.toBeNull();
  });
  it("fails when footwear is not elegant (and not aftermath barefoot)", () => {
    const situation = baseSituation({ content_tier: "luxe_car", continuity_phase: "standalone", luxury_seduction: luxuryFixture({ footwear: "flip-flops" }) });
    expect(luxeCarRequiresNightlifeStyling(situation)).not.toBeNull();
  });
  it("passes elegant flats (not excluded — legal footwear value per the field's own contrast allowance)", () => {
    const situation = baseSituation({ content_tier: "luxe_car", luxury_seduction: luxuryFixture({ footwear: "elegant flats", pose_archetype: "stepping out of a car" }) });
    expect(luxeCarRequiresNightlifeStyling(situation)).toBeNull();
  });
  it("passes barefoot only when continuity_phase is aftermath", () => {
    const situation = baseSituation({
      content_tier: "luxe_car",
      continuity_phase: "aftermath",
      luxury_seduction: luxuryFixture({ footwear: "barefoot, heels in hand", pose_archetype: "stepping out of a car" }),
    });
    expect(luxeCarRequiresNightlifeStyling(situation)).toBeNull();
  });
  it("fails when accessory_language has no clutch/evening bag", () => {
    const situation = baseSituation({ content_tier: "luxe_car", luxury_seduction: luxuryFixture({ accessory_language: "delicate gold jewellery only" }) });
    expect(luxeCarRequiresNightlifeStyling(situation)).not.toBeNull();
  });
  it("fails when pose_archetype is not an arrival/departure/transition pose", () => {
    const situation = baseSituation({ content_tier: "luxe_car", luxury_seduction: luxuryFixture({ pose_archetype: "hand at her waist" }) });
    expect(luxeCarRequiresNightlifeStyling(situation)).not.toBeNull();
  });
  it("passes a fully compliant luxe_car day", () => {
    const situation = baseSituation({
      content_tier: "luxe_car",
      luxury_seduction: luxuryFixture({ footwear: "pointed heels", accessory_language: "a structured clutch", pose_archetype: "stepping out of a car" }),
    });
    expect(luxeCarRequiresNightlifeStyling(situation)).toBeNull();
  });
});

describe("facialEnergyMatchesContext — luxury_seduction.facial_seduction", () => {
  it("fails a teasing facial_seduction paired with an incompatible emotional_state", () => {
    const situation = baseSituation({ emotional_state: "exhausted", luxury_seduction: luxuryFixture({ facial_seduction: "a teasing seductive smile" }) });
    expect(facialEnergyMatchesContext(situation)).not.toBeNull();
  });
  it("passes a teasing facial_seduction paired with a compatible emotional_state", () => {
    const situation = baseSituation({ emotional_state: "unhurried", luxury_seduction: luxuryFixture({ facial_seduction: "a teasing seductive smile" }) });
    expect(facialEnergyMatchesContext(situation)).toBeNull();
  });
});

describe("validateGenerativeSituation — requireLuxurySeduction", () => {
  it("without the flag, none of the luxury checks run even if luxury_seduction is missing", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
      sex_appeal_style: sexAppealFixture(),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, SEX_APPEAL_CTX);
    expect(result.ok).toBe(true);
  });
  it("with the flag, a provocative situation with no luxury_seduction fails", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture(),
      sex_appeal_style: sexAppealFixture(),
    });
    const result = validateGenerativeSituation(situation, LUXURY_CTX);
    expect(result.ok).toBe(false);
  });
  it("with the flag, a fully-specified, internally coherent situation passes", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ wardrobe_signal: "a fitted bodycon mini dress with thin straps" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a fitted bodycon mini dress" }),
      luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress in a metallic knit" }),
      visual_execution: { location: "x", time_of_day: "evening", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, LUXURY_CTX);
    expect(result.ok).toBe(true);
  });
  it("blocks on a hard repeat cap violation (3rd occurrence of the same fashion family)", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ wardrobe_signal: "a fitted bodycon mini dress with thin straps" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a fitted bodycon mini dress" }),
      luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress in a metallic knit" }),
      visual_execution: { location: "x", time_of_day: "evening", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const ctx: ValidationContext = { ...LUXURY_CTX, recentFashionDirectionFamilies: ["bodycon_dress", "bodycon_dress"] };
    const result = validateGenerativeSituation(situation, ctx);
    expect(result.ok).toBe(false);
  });
});

// ── playful_hot_world_v1 (iteration 5) — the world must be warmer/more playful/sunnier/more
// alive, not just more luxurious.
function playfulFixture(overrides: Partial<PlayfulHotWorldProfile> = {}): PlayfulHotWorldProfile {
  return {
    mood_temperature: "warm",
    vitality_level: "alive",
    social_pulse: "suggested_social",
    seasonality: "summer",
    color_energy: "fresh",
    fun_factor: "medium",
    ...overrides,
  };
}

const PLAYFUL_CTX: ValidationContext = {
  allowedSexualEnergyLevels: ["subtle", "warm", "playful", "provocative", "intimate"],
  requireSensualVisualLanguage: true,
  requireSexAppealStyle: true,
  requireLuxurySeduction: true,
  requirePlayfulHotWorld: true,
};

describe("playfulHotWorldMatchesDictated", () => {
  const dictated = playfulFixture();

  it("is a no-op when either dictated or actual is missing", () => {
    expect(playfulHotWorldMatchesDictated(baseSituation(), { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated })).toBeNull();
    expect(playfulHotWorldMatchesDictated(baseSituation({ playful_hot_world: dictated }), PLAYFUL_CTX)).toBeNull();
  });

  it("passes when vitality_level/social_pulse/seasonality all match the dictated values", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture() });
    expect(playfulHotWorldMatchesDictated(situation, { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated })).toBeNull();
  });

  it("fails when vitality_level does not match", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ vitality_level: "calm" }) });
    expect(playfulHotWorldMatchesDictated(situation, { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated })).not.toBeNull();
  });

  it("fails when social_pulse does not match", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ social_pulse: "private" }) });
    expect(playfulHotWorldMatchesDictated(situation, { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated })).not.toBeNull();
  });

  it("fails when seasonality does not match", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ seasonality: "neutral" }) });
    expect(playfulHotWorldMatchesDictated(situation, { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated })).not.toBeNull();
  });

  it("does not care about mood_temperature/color_energy/fun_factor mismatches (no equality-check stake)", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ mood_temperature: "hot", color_energy: "vivid", fun_factor: "high" }) });
    expect(playfulHotWorldMatchesDictated(situation, { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated })).toBeNull();
  });
});

describe("vitalityLevelCalmNotOverused", () => {
  it("is a no-op when recentVitalityLevels is not provided", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ vitality_level: "calm" }) });
    expect(vitalityLevelCalmNotOverused(situation, PLAYFUL_CTX)).toBeNull();
  });
  it("is a no-op for a non-calm vitality_level", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ vitality_level: "playful" }) });
    const ctx: ValidationContext = { ...PLAYFUL_CTX, recentVitalityLevels: ["calm", "calm"] };
    expect(vitalityLevelCalmNotOverused(situation, ctx)).toBeNull();
  });
  it("passes when calm has appeared fewer than 2 times recently", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ vitality_level: "calm" }) });
    const ctx: ValidationContext = { ...PLAYFUL_CTX, recentVitalityLevels: ["calm"] };
    expect(vitalityLevelCalmNotOverused(situation, ctx)).toBeNull();
  });
  it("blocks the 3rd occurrence of calm within the 14-day window", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ vitality_level: "calm" }) });
    const ctx: ValidationContext = { ...PLAYFUL_CTX, recentVitalityLevels: ["calm", "calm"] };
    expect(vitalityLevelCalmNotOverused(situation, ctx)).not.toBeNull();
  });
});

describe("quietIndoorBeigeNotOverused", () => {
  const quietSituation = baseSituation({
    social_context: { mode: "alone", implication: "alone" },
    activity: "reading quietly in her apartment",
    visual_execution: { location: "her bedroom", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "x" },
    playful_hot_world: playfulFixture({ vitality_level: "calm", social_pulse: "private", color_energy: "muted" }),
  });

  it("is a no-op when recentQuietIndoorBeigeFlags is not provided", () => {
    expect(quietIndoorBeigeNotOverused(quietSituation, PLAYFUL_CTX)).toBeNull();
  });
  it("is a no-op when today is not a quiet-indoor-beige day", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture() });
    const ctx: ValidationContext = { ...PLAYFUL_CTX, recentQuietIndoorBeigeFlags: [true, true, true] };
    expect(quietIndoorBeigeNotOverused(situation, ctx)).toBeNull();
  });
  it("passes when fewer than 3 quiet-indoor-beige days have appeared recently", () => {
    const ctx: ValidationContext = { ...PLAYFUL_CTX, recentQuietIndoorBeigeFlags: [true, true, false] };
    expect(quietIndoorBeigeNotOverused(quietSituation, ctx)).toBeNull();
  });
  it("blocks the 4th quiet-indoor-beige day within the 14-day window", () => {
    const ctx: ValidationContext = { ...PLAYFUL_CTX, recentQuietIndoorBeigeFlags: [true, true, true, false] };
    expect(quietIndoorBeigeNotOverused(quietSituation, ctx)).not.toBeNull();
  });
});

describe("seasonalityLocationPlausible", () => {
  it("is a no-op for a non-high_summer seasonality", () => {
    const situation = baseSituation({ playful_hot_world: playfulFixture({ seasonality: "summer" }) });
    expect(seasonalityLocationPlausible(situation)).toBeNull();
  });
  it("passes high_summer with an outdoor/social location", () => {
    const situation = baseSituation({
      activity: "lounging at the pool",
      visual_execution: { location: "a rooftop pool deck", time_of_day: "midday", weather: "sunny", action_visible: "x", shot_intent: "x" },
      playful_hot_world: playfulFixture({ seasonality: "high_summer" }),
    });
    expect(seasonalityLocationPlausible(situation)).toBeNull();
  });
  it("fails high_summer with an indoor/home location", () => {
    const situation = baseSituation({
      activity: "making coffee in her kitchen",
      visual_execution: { location: "her kitchen", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "x" },
      playful_hot_world: playfulFixture({ seasonality: "high_summer" }),
    });
    expect(seasonalityLocationPlausible(situation)).not.toBeNull();
  });
});

describe("validateGenerativeSituation — requirePlayfulHotWorld", () => {
  it("without the flag, none of the playful checks run even if playful_hot_world is missing", () => {
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ wardrobe_signal: "a fitted bodycon mini dress with thin straps" }),
      sex_appeal_style: sexAppealFixture(),
      luxury_seduction: luxuryFixture(),
      visual_execution: { location: "x", time_of_day: "morning", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, LUXURY_CTX);
    expect(result.ok).toBe(true);
  });

  it("with the flag, a fully coherent, dictation-matching situation passes", () => {
    const dictated = playfulFixture();
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ wardrobe_signal: "a fitted bodycon mini dress with thin straps" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a fitted bodycon mini dress" }),
      luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress in a metallic knit" }),
      playful_hot_world: dictated,
      visual_execution: { location: "x", time_of_day: "evening", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated });
    expect(result.ok).toBe(true);
  });

  it("blocks when playful_hot_world drifts from the dictated vitality_level", () => {
    const dictated = playfulFixture();
    const situation = baseSituation({
      sexual_energy: { level: "provocative", expression: "x".repeat(20), boundary: "b" },
      sensual_visual_language: sensualFixture({ wardrobe_signal: "a fitted bodycon mini dress with thin straps" }),
      sex_appeal_style: sexAppealFixture({ outfit_archetype: "a fitted bodycon mini dress" }),
      luxury_seduction: luxuryFixture({ fashion_direction: "a fitted bodycon mini dress in a metallic knit" }),
      playful_hot_world: playfulFixture({ vitality_level: "electric" }),
      visual_execution: { location: "x", time_of_day: "evening", weather: "indoor", action_visible: "x", shot_intent: "full-body shot showing her legs" },
    });
    const result = validateGenerativeSituation(situation, { ...PLAYFUL_CTX, dictatedPlayfulHotWorld: dictated });
    expect(result.ok).toBe(false);
  });
});
