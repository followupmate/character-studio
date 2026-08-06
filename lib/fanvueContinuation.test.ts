import { describe, it, expect } from "vitest";
import {
  buildFanvueContinuationPlan,
  defaultContentLevel,
  validatePaidValue,
  validateFanvueSource,
  duplicatePersonRisk,
  classifyPoseFamily,
  extractCameraDistanceRank,
  visualDiversityCheck,
  SHOT_STEPS,
  type FanvueContinuationPlan,
} from "./fanvueContinuation";
import type { StoryDayLike, SituationFanvueTension } from "./fanvueUnlock";
import type { GenerativeSituation } from "./situationPlanner";

const LUXE_CAR_STORY_DAY: StoryDayLike = {
  tier: "luxe_car",
  moment_family: null,
  magnetism_level: null,
  location: "city street at night, stepping out of a dark luxury grand-tourer",
  mood: "electric",
  ig_caption: null,
  hook_text: "wait till she steps out",
};

function baseSituation(overrides: Partial<GenerativeSituation> = {}): GenerativeSituation {
  return {
    content_tier: "intimate_aesthetic",
    current_life_context: "a quiet evening",
    life_domain: "home_and_private_life",
    continuity_phase: "standalone",
    desire_signal: "she wants a private moment",
    trigger: "the room is finally quiet",
    activity: "getting ready",
    reason: "before dinner",
    social_context: { mode: "alone", implication: "no one else is present" },
    emotional_state: "unhurried",
    previous_consequence: null,
    next_implication: null,
    personality_signal: "confident",
    reality_detail: "the light is warm",
    magnetic_hook: "a private moment",
    magnetism_reason: "private_access",
    sexual_energy: { level: "warm", expression: "confident eye contact", boundary: "nothing explicit" },
    fanvue_tension: { potential: "clear", continuation: "the rest of the evening", withheld_element: null },
    visual_execution: { location: "a hotel room", time_of_day: "evening", weather: "indoor", action_visible: "getting ready", shot_intent: "medium shot" },
    ...overrides,
  };
}

const STORY_DAY: StoryDayLike = {
  tier: "intimate_aesthetic",
  moment_family: null,
  magnetism_level: null,
  location: "a hotel room",
  mood: "unhurried",
  ig_caption: null,
  hook_text: "getting ready before dinner",
};

describe("defaultContentLevel", () => {
  it("intimate_aesthetic and luxe_car default to erotic_tease", () => {
    expect(defaultContentLevel("intimate_aesthetic", null)).toBe("erotic_tease");
    expect(defaultContentLevel("luxe_car", null)).toBe("erotic_tease");
  });

  it("lived_moments with sensual magnetism defaults to erotic_tease", () => {
    expect(defaultContentLevel("lived_moments", "sensual")).toBe("erotic_tease");
  });

  it("lived_moments with soft/flirty magnetism defaults to premium_sensual", () => {
    expect(defaultContentLevel("lived_moments", "soft")).toBe("premium_sensual");
    expect(defaultContentLevel("lived_moments", "flirty")).toBe("premium_sensual");
  });

  it("any tier escalates to erotic_tease when Fanvue tension is strong", () => {
    expect(defaultContentLevel("everyday_life", null, "strong")).toBe("erotic_tease");
    expect(defaultContentLevel("lived_moments", "soft", "strong")).toBe("erotic_tease");
  });

  it("everyday_life with no strong tension defaults to premium_sensual", () => {
    expect(defaultContentLevel("everyday_life", null)).toBe("premium_sensual");
  });

  it("never returns explicit_adult regardless of inputs", () => {
    const tiers = ["intimate_aesthetic", "luxe_car", "lived_moments", "wellness_fitness", "lifestyle_travel", "everyday_life"] as const;
    const magnetisms = [null, "soft", "playful", "flirty", "sensual"] as const;
    const tensions = [undefined, "none", "soft", "clear", "strong"] as const;
    for (const tier of tiers) {
      for (const magnetism of magnetisms) {
        for (const tension of tensions) {
          expect(defaultContentLevel(tier, magnetism, tension)).not.toBe("explicit_adult");
        }
      }
    }
  });
});

describe("buildFanvueContinuationPlan — structure", () => {
  it("produces exactly the 6 arc steps in order, each with its own prompt and status pending", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic",
      series: "Room 407",
      storyDay: STORY_DAY,
      wardrobe: "silk robe",
      magnetism: null,
    });
    expect(plan.shots.map((s) => s.step)).toEqual(SHOT_STEPS);
    expect(plan.shots).toHaveLength(6);
    for (const shot of plan.shots) {
      expect(shot.status).toBe("pending");
      expect(shot.media_url).toBeNull();
      expect(shot.prompt.length).toBeGreaterThan(0);
    }
    // no two shots share an identical prompt — this must not degrade into "3 similar angles"
    const uniquePrompts = new Set(plan.shots.map((s) => s.prompt));
    expect(uniquePrompts.size).toBe(plan.shots.length);
  });

  it("defaults content_level via defaultContentLevel when no override is given", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic",
      series: "Room 407",
      storyDay: STORY_DAY,
      wardrobe: "silk robe",
      magnetism: null,
    });
    expect(plan.content_level).toBe("erotic_tease");
  });

  it("honours an explicit contentLevelOverride, including explicit_adult (data contract only)", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "everyday_life",
      series: "Soft Home",
      storyDay: STORY_DAY,
      wardrobe: "",
      magnetism: null,
      contentLevelOverride: "explicit_adult",
    });
    expect(plan.content_level).toBe("explicit_adult");
  });
});

describe("buildFanvueContinuationPlan — premium_sensual intensity curve", () => {
  it("never exceeds medium intensity, even at payoff", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "everyday_life",
      series: "Soft Home",
      storyDay: STORY_DAY,
      wardrobe: "",
      magnetism: null,
    });
    expect(plan.content_level).toBe("premium_sensual");
    for (const shot of plan.shots) {
      expect(shot.intensity).not.toBe("strong");
    }
  });
});

describe("buildFanvueContinuationPlan — erotic_tease gradation", () => {
  const plan = buildFanvueContinuationPlan({
    tier: "intimate_aesthetic",
    series: "Room 407",
    storyDay: STORY_DAY,
    wardrobe: "silk robe",
    magnetism: null,
  });

  it("payoff is the single most erotic, provider-safe shot (strong intensity)", () => {
    const payoff = plan.shots.find((s) => s.step === "payoff")!;
    expect(payoff.intensity).toBe("strong");
  });

  it("bridge starts soft and afterglow winds back down — the set is gradated, not flat", () => {
    const bridge = plan.shots.find((s) => s.step === "bridge")!;
    const afterglow = plan.shots.find((s) => s.step === "afterglow")!;
    expect(bridge.intensity).toBe("soft");
    expect(afterglow.intensity).not.toBe("strong");
  });

  it("escalation/reveal/payoff prompts carry provider-safe erotic cues distinct from bridge/afterglow", () => {
    const hot = plan.shots.filter((s) => ["escalation", "reveal", "payoff"].includes(s.step));
    const cueWords = ["clinging", "sheer", "implied undress", "loosened", "unbuttoned", "slipping", "kneeling", "most erotic", "reveal moment", "maximum implied undress"];
    for (const shot of hot) {
      expect(cueWords.some((w) => shot.prompt.includes(w))).toBe(true);
    }
  });

  it("never uses explicit nudity/sexual-act wording (provider-safe guard)", () => {
    const forbidden = ["nude", "naked", "nipple", "genital", "penetrat", "explicit sex"];
    for (const shot of plan.shots) {
      for (const term of forbidden) {
        expect(shot.prompt.toLowerCase()).not.toContain(term);
      }
    }
  });
});

describe("buildFanvueContinuationPlan — same-event continuity", () => {
  it("threads the day's location/moment_family and fanvue_tension withheld_element through", () => {
    const tension: SituationFanvueTension = {
      potential: "strong",
      continuation: "the rest of the getting-ready sequence",
      withheld_element: "the moment she chose the dress",
    };
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic",
      series: "Room 407",
      storyDay: STORY_DAY,
      wardrobe: "silk robe",
      magnetism: null,
      situationTension: tension,
    });
    expect(plan.same_event_continuity).toContain("a hotel room");
    expect(plan.paid_promise).toContain("the moment she chose the dress");
    expect(plan.shots.some((s) => s.prompt.includes("the rest of the getting-ready sequence"))).toBe(true);
  });
});

describe("buildFanvueContinuationPlan — commercial setup", () => {
  it("erotic_tease is priced above premium_sensual for the same tier, with a transparent rationale", () => {
    const soft = buildFanvueContinuationPlan({
      tier: "everyday_life", series: "Soft Home", storyDay: STORY_DAY, wardrobe: "", magnetism: null,
      contentLevelOverride: "premium_sensual",
    });
    const hot = buildFanvueContinuationPlan({
      tier: "everyday_life", series: "Soft Home", storyDay: STORY_DAY, wardrobe: "", magnetism: null,
      contentLevelOverride: "erotic_tease",
    });
    expect(hot.commercial.price_eur).toBeGreaterThan(soft.commercial.price_eur);
    expect(hot.commercial.price_rationale.length).toBeGreaterThan(0);
    expect(hot.commercial.price_rationale.some((r) => r.includes("erotic_tease"))).toBe(true);
  });

  it("keeps the tier's existing unlock_type/mode as the baseline (tier weights unchanged)", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "lifestyle_travel", series: "Pool Heat", storyDay: STORY_DAY, wardrobe: "", magnetism: null,
    });
    expect(plan.commercial.mode).toBe("ppv");
  });
});

describe("validatePaidValue", () => {
  it("premium_sensual always passes", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "everyday_life", series: "Soft Home", storyDay: STORY_DAY, wardrobe: "", magnetism: null,
    });
    expect(validatePaidValue(plan).passes).toBe(true);
  });

  it("a real erotic_tease plan passes", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    expect(validatePaidValue(plan).passes).toBe(true);
  });

  it("rejects an erotic_tease plan whose payoff shot was manually softened below strong", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    const weakened: FanvueContinuationPlan = {
      ...plan,
      shots: plan.shots.map((s) => (s.step === "payoff" ? { ...s, intensity: "medium" } : s)),
    };
    const result = validatePaidValue(weakened);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("payoff shot must reach strong intensity");
  });

  it("rejects an erotic_tease plan whose shots carry no distinct erotic cue (reads as premium_sensual)", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    const flattened: FanvueContinuationPlan = {
      ...plan,
      shots: plan.shots.map((s) => ({ ...s, prompt: "a plain non-descriptive prompt" })),
    };
    const result = validatePaidValue(flattened);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("clearly stronger than the Instagram-safe wording");
  });

  // Item 5 — strengthened checks: 2-of-3 marker requirement, monotonic gradation, no
  // byte-identical escalation/reveal/payoff prompts.
  it("rejects when only 1 of 3 escalation/reveal/payoff shots carries a distinct erotic cue", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    const oneMarkerOnly: FanvueContinuationPlan = {
      ...plan,
      shots: plan.shots.map((s) => (s.step === "reveal" || s.step === "payoff" ? { ...s, prompt: "a plain non-descriptive prompt" } : s)),
    };
    const result = validatePaidValue(oneMarkerOnly);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/only 1\/3/);
  });

  it("passes when 2 of 3 escalation/reveal/payoff shots carry a distinct erotic cue", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    const twoMarkers: FanvueContinuationPlan = {
      ...plan,
      shots: plan.shots.map((s) => (s.step === "reveal" ? { ...s, prompt: "a plain non-descriptive prompt" } : s)),
    };
    const result = validatePaidValue(twoMarkers);
    expect(result.reasons.join(" ")).not.toMatch(/only \d\/3/);
  });

  it("rejects a broken (non-monotonic) intensity gradation, e.g. reveal stronger than payoff", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    const broken: FanvueContinuationPlan = {
      ...plan,
      shots: plan.shots.map((s) => (s.step === "escalation" ? { ...s, intensity: "strong" } : s.step === "reveal" ? { ...s, intensity: "soft" } : s)),
    };
    const result = validatePaidValue(broken);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("does not ramp up monotonically");
  });

  it("rejects two byte-identical prompts among escalation/reveal/payoff", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    const escalation = plan.shots.find((s) => s.step === "escalation")!;
    const duplicated: FanvueContinuationPlan = {
      ...plan,
      shots: plan.shots.map((s) => (s.step === "reveal" ? { ...s, prompt: escalation.prompt } : s)),
    };
    const result = validatePaidValue(duplicated);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("byte-identical prompts");
  });

  it("a real (unmodified) erotic_tease plan satisfies all 4 strengthened checks", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    expect(validatePaidValue(plan)).toEqual({ passes: true, reasons: [] });
  });
});

// Item 6 — private-source guard: the reveal/payoff steps' own directive text already claims the
// IG-safe boundary is being crossed, so restating it verbatim would contradict that.
describe("buildShotPrompt (via buildFanvueContinuationPlan) — exposure_boundary stripping", () => {
  const sensual = {
    wardrobe_signal: "a silk robe, loosely tied",
    body_emphasis: "shoulders, collarbone",
    gesture_or_action: "adjusting the tie of the robe",
    camera_relationship: "close private-camera distance",
    exposure_boundary: "nothing below the collarbone",
  };

  it("strips the Boundary sentence from escalation/reveal/payoff for a non-premium_sensual plan", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
      sensualVisualLanguage: sensual,
    });
    for (const step of ["escalation", "reveal", "payoff"] as const) {
      const shot = plan.shots.find((s) => s.step === step)!;
      expect(shot.prompt).not.toContain("Boundary:");
    }
  });

  it("keeps the Boundary sentence for bridge/private_access/afterglow", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
      sensualVisualLanguage: sensual,
    });
    for (const step of ["bridge", "private_access", "afterglow"] as const) {
      const shot = plan.shots.find((s) => s.step === step)!;
      expect(shot.prompt).toContain("Boundary:");
    }
  });

  it("keeps the Boundary sentence on every step for premium_sensual (never claims to cross it)", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "everyday_life", series: "Soft Home", storyDay: STORY_DAY, wardrobe: "", magnetism: null,
      contentLevelOverride: "premium_sensual",
      sensualVisualLanguage: sensual,
    });
    for (const shot of plan.shots) {
      expect(shot.prompt).toContain("Boundary:");
    }
  });
});

// Item 8 — explicit, monotonic camera-framing-distance ladder, independent of the shared clause
// suffix.
describe("STEP_DIRECTIVES (via buildFanvueContinuationPlan) — camera framing distance", () => {
  it("each of the 6 steps carries a distinct 'Camera framing:' cue", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    const framingByStep = new Map(plan.shots.map((s) => [s.step, s.prompt.match(/Camera framing: [^.]*\./)?.[0]]));
    for (const step of SHOT_STEPS) {
      expect(framingByStep.get(step)).toBeTruthy();
    }
    const uniqueFramings = new Set(framingByStep.values());
    expect(uniqueFramings.size).toBe(SHOT_STEPS.length);
  });
});

describe("validateFanvueSource", () => {
  it("is a no-op (always ok) for tiers other than intimate_aesthetic", () => {
    expect(validateFanvueSource("lived_moments", null, false)).toEqual({ ok: true, reasons: [] });
    expect(validateFanvueSource("luxe_car", baseSituation({ social_context: { mode: "ambient_public", implication: "x" } }), true)).toEqual({ ok: true, reasons: [] });
  });

  it("blocks intimate_aesthetic when situationValidated is false", () => {
    const result = validateFanvueSource("intimate_aesthetic", baseSituation(), false);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("situationValidated=false");
  });

  it("blocks intimate_aesthetic when situation is null", () => {
    const result = validateFanvueSource("intimate_aesthetic", null, true);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("no source situation");
  });

  it("blocks intimate_aesthetic when social_context.mode is ambient_public", () => {
    const situation = baseSituation({ social_context: { mode: "ambient_public", implication: "a crowded street" } });
    const result = validateFanvueSource("intimate_aesthetic", situation, true);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("ambient_public");
  });

  it("blocks intimate_aesthetic when the scene text implies a crowd or other people", () => {
    const situation = baseSituation({ reality_detail: "a crowd of friends nearby, laughing" });
    const result = validateFanvueSource("intimate_aesthetic", situation, true);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("crowd");
  });

  it("blocks intimate_aesthetic when a rooftop/pool location has no private/secluded qualifier", () => {
    const situation = baseSituation({ visual_execution: { ...baseSituation().visual_execution, location: "a hotel rooftop bar" } });
    const result = validateFanvueSource("intimate_aesthetic", situation, true);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("rooftop/pool");
  });

  it("passes intimate_aesthetic when the rooftop/pool location IS explicitly private/secluded", () => {
    const situation = baseSituation({ visual_execution: { ...baseSituation().visual_execution, location: "a private, secluded rooftop terrace" } });
    const result = validateFanvueSource("intimate_aesthetic", situation, true);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("passes a fully valid, private, alone intimate_aesthetic situation", () => {
    const result = validateFanvueSource("intimate_aesthetic", baseSituation(), true);
    expect(result).toEqual({ ok: true, reasons: [] });
  });
});

describe("buildFanvueContinuationPlan — source_validation field", () => {
  it("is present on every plan and reflects validateFanvueSource's result", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
      situation: baseSituation({ social_context: { mode: "ambient_public", implication: "x" } }),
      situationValidated: true,
    });
    expect(plan.source_validation.ok).toBe(false);
  });

  it("defaults to blocked-with-reasons for intimate_aesthetic when situation/situationValidated are omitted (conservative default, never a silent bypass)", () => {
    const plan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    expect(plan.source_validation.ok).toBe(false);
  });
});

describe("duplicatePersonRisk", () => {
  it("flags a prompt implying a mirror reflection showing a second full body", () => {
    const risk = duplicatePersonRisk("she stands before the mirror, her mirror reflection visible behind her");
    expect(risk).not.toBeNull();
  });

  it("flags split-screen / before-after side-by-side framing", () => {
    expect(duplicatePersonRisk("a split-screen composition of the same moment")).not.toBeNull();
    expect(duplicatePersonRisk("before and after, shown side by side")).not.toBeNull();
  });

  it("flags explicit 'two of her' / 'both versions of her' phrasing", () => {
    expect(duplicatePersonRisk("two of her stand in the frame")).not.toBeNull();
  });

  it("does not flag an ordinary single-subject prompt", () => {
    expect(duplicatePersonRisk("she leans against the doorway, warm evening light behind her")).toBeNull();
  });

  it("does not flag a prompt that explicitly negates a duplicate/split composition (negation-aware, same pattern as noSecondSharpFace)", () => {
    expect(duplicatePersonRisk("a single continuous frame, no split-screen, only one of her in view")).toBeNull();
  });
});

// luxe_car shot blueprint — hard shot-role separation (real-draft finding: the generic
// STEP_DIRECTIVES text produced 6 angle variations of one standing/stepping-out-of-car pose for
// this tier; a live "After Dark" set was rejected on exactly this basis).
describe("buildFanvueContinuationPlan — luxe_car shot blueprint", () => {
  const plan = buildFanvueContinuationPlan({
    tier: "luxe_car", series: "After Dark", storyDay: LUXE_CAR_STORY_DAY, wardrobe: "", magnetism: null,
  });

  it("gives every one of the 6 shots a distinct, recognized pose family", () => {
    const families = plan.shots.map((s) => classifyPoseFamily(s.prompt));
    for (const family of families) expect(family).not.toBeNull();
    expect(new Set(families).size).toBe(6);
  });

  it("carries a monotonically non-decreasing camera-distance rank from bridge through payoff", () => {
    const order: Array<typeof plan.shots[number]["step"]> = ["bridge", "private_access", "escalation", "reveal", "payoff"];
    let last = -1;
    for (const step of order) {
      const shot = plan.shots.find((s) => s.step === step)!;
      const rank = extractCameraDistanceRank(shot.prompt)!;
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
    }
  });

  it("payoff is strictly closer (higher camera-distance rank) than reveal", () => {
    const reveal = plan.shots.find((s) => s.step === "reveal")!;
    const payoff = plan.shots.find((s) => s.step === "payoff")!;
    expect(extractCameraDistanceRank(payoff.prompt)!).toBeGreaterThan(extractCameraDistanceRank(reveal.prompt)!);
  });

  it("afterglow does not repeat bridge's pose family", () => {
    const bridge = plan.shots.find((s) => s.step === "bridge")!;
    const afterglow = plan.shots.find((s) => s.step === "afterglow")!;
    expect(classifyPoseFamily(afterglow.prompt)).not.toBe(classifyPoseFamily(bridge.prompt));
  });

  it("passes visualDiversityCheck and validatePaidValue for a real, unmodified erotic_tease luxe_car set", () => {
    expect(visualDiversityCheck(plan)).toEqual({ passes: true, reasons: [] });
    expect(validatePaidValue(plan).passes).toBe(true);
  });

  it("does not apply the luxe_car blueprint to other tiers (byte-identical to pre-blueprint generic directive shape)", () => {
    const intimatePlan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: LUXE_CAR_STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    for (const shot of intimatePlan.shots) {
      expect(shot.prompt).not.toContain("Spatial zone:");
      expect(classifyPoseFamily(shot.prompt)).toBeNull();
    }
  });

  // Real-draft findings: escalation rendered two Vivienne instances, and nothing pinned the set
  // to a single continuous night once shots moved past the literal open car door.
  it("every one of the 6 shots carries the single-person lock, verbatim", () => {
    for (const shot of plan.shots) {
      expect(shot.prompt).toContain("Exactly one adult woman in the entire image.");
      expect(shot.prompt).toContain("another instance of Vivienne");
    }
  });

  it("every one of the 6 shots carries the temporal/lighting lock, verbatim", () => {
    for (const shot of plan.shots) {
      expect(shot.prompt).toContain("Continuous late-night setting from the source scene.");
      expect(shot.prompt).toContain("no daylight, no sunrise, no sunset, no blue-hour transition");
    }
  });

  it("only escalation/reveal/payoff/afterglow carry the bridge-repeat exclusions — not bridge/private_access", () => {
    for (const step of ["escalation", "reveal", "payoff", "afterglow"] as const) {
      const shot = plan.shots.find((s) => s.step === step)!;
      expect(shot.prompt).toContain("Do not show the bridge pose.");
      expect(shot.prompt).toContain("Do not merely change her head angle.");
    }
    for (const step of ["bridge", "private_access"] as const) {
      const shot = plan.shots.find((s) => s.step === step)!;
      expect(shot.prompt).not.toContain("Do not show the bridge pose.");
    }
  });

  it("reveal and payoff move to a genuinely new location (private garage) while keeping the same car and outfit", () => {
    const reveal = plan.shots.find((s) => s.step === "reveal")!;
    const payoff = plan.shots.find((s) => s.step === "payoff")!;
    expect(reveal.prompt).toContain("private underground garage");
    expect(payoff.prompt).toContain("private garage");
    // same car/outfit continuity, not a new scene from scratch
    expect(reveal.prompt).toContain("same car, same outfit");
  });
});

describe("classifyPoseFamily", () => {
  it("recognizes each of the 6 luxe_car blueprint pose archetypes", () => {
    expect(classifyPoseFamily("standing just outside the open car door, one hand still resting")).toBe("car_exterior_arrival");
    expect(classifyPoseFamily("seated on the edge of the rear seat, one leg still outside")).toBe("car_rear_seat_edge");
    expect(classifyPoseFamily("fully inside the car now, door closed, seated properly")).toBe("car_interior_full");
    expect(classifyPoseFamily("the car has pulled into a private underground garage and parked")).toBe("car_garage_continuation");
    expect(classifyPoseFamily("still inside the car in the private garage, reclined across the back seat")).toBe("car_garage_peak");
    expect(classifyPoseFamily("stepped halfway out of the car in the quiet garage, leaning against the open door")).toBe("car_garage_settled");
  });

  it("recognizes the generic/duplicative stances flagged as the original failure mode", () => {
    expect(classifyPoseFamily("standing beside the open car door, torso half turned")).toBe("standing_beside_car_door");
    expect(classifyPoseFamily("her torso is turned back toward the lens")).toBe("torso_turned_back");
    expect(classifyPoseFamily("looking back over her shoulder toward the camera")).toBe("looking_over_shoulder");
  });

  it("returns null for unrecognized text", () => {
    expect(classifyPoseFamily("a plain non-descriptive prompt with no pose cue")).toBeNull();
  });
});

describe("extractCameraDistanceRank", () => {
  it("ranks wide < medium < medium-close < close < closest", () => {
    expect(extractCameraDistanceRank("blah. Camera framing: wide.")).toBe(0);
    expect(extractCameraDistanceRank("blah. Camera framing: medium.")).toBe(1);
    expect(extractCameraDistanceRank("blah. Camera framing: medium-close.")).toBe(2);
    expect(extractCameraDistanceRank("blah. Camera framing: close.")).toBe(3);
    expect(extractCameraDistanceRank("blah. Camera framing: closest.")).toBe(4);
  });

  it("returns null when no Camera framing sentence is present", () => {
    expect(extractCameraDistanceRank("a prompt with no framing cue at all")).toBeNull();
  });
});

describe("visualDiversityCheck", () => {
  const basePlan = buildFanvueContinuationPlan({
    tier: "luxe_car", series: "After Dark", storyDay: LUXE_CAR_STORY_DAY, wardrobe: "", magnetism: null,
  });

  it("is a no-op for a set with no recognized pose families (tier without a blueprint yet)", () => {
    const genericPlan = buildFanvueContinuationPlan({
      tier: "intimate_aesthetic", series: "Room 407", storyDay: LUXE_CAR_STORY_DAY, wardrobe: "silk robe", magnetism: null,
    });
    expect(visualDiversityCheck(genericPlan)).toEqual({ passes: true, reasons: [] });
  });

  it("rejects when 3+ shots share the same pose family (the original 'standing beside car door' failure mode)", () => {
    const collapsed: FanvueContinuationPlan = {
      ...basePlan,
      shots: basePlan.shots.map((s, i) =>
        i < 3 ? { ...s, prompt: "standing beside the open car door, torso half turned. Camera framing: wide." } : s
      ),
    };
    const result = visualDiversityCheck(collapsed);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("repeats across 3 shots");
  });

  it("rejects when payoff is not more intimate (closer) than reveal", () => {
    const payoffIdx = basePlan.shots.findIndex((s) => s.step === "payoff");
    const flattened: FanvueContinuationPlan = {
      ...basePlan,
      shots: basePlan.shots.map((s, i) => (i === payoffIdx ? { ...s, prompt: s.prompt.replace(/Camera framing: closest\./, "Camera framing: close.") } : s)),
    };
    const result = visualDiversityCheck(flattened);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("not clearly more intimate");
  });

  it("rejects when afterglow repeats bridge's pose family", () => {
    const bridge = basePlan.shots.find((s) => s.step === "bridge")!;
    const withRepeat: FanvueContinuationPlan = {
      ...basePlan,
      shots: basePlan.shots.map((s) => (s.step === "afterglow" ? { ...s, prompt: bridge.prompt } : s)),
    };
    const result = visualDiversityCheck(withRepeat);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("afterglow repeats bridge");
  });

  it("rejects when fewer than 4 distinct pose families are recognized across the set", () => {
    const genericText = "standing beside the open car door, torso half turned. Camera framing: wide.";
    const collapsedToTwo: FanvueContinuationPlan = {
      ...basePlan,
      shots: basePlan.shots.map((s, i) => (i % 2 === 0 ? { ...s, prompt: genericText } : { ...s, prompt: "looking back over her shoulder. Camera framing: medium." })),
    };
    const result = visualDiversityCheck(collapsedToTwo);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("distinct pose families recognized");
  });

  it("validatePaidValue surfaces visualDiversityCheck's reasons for erotic_tease/explicit_adult, but not premium_sensual", () => {
    const collapsed: FanvueContinuationPlan = {
      ...basePlan,
      shots: basePlan.shots.map((s, i) =>
        i < 3 ? { ...s, prompt: "standing beside the open car door, torso half turned. Camera framing: wide." } : s
      ),
    };
    expect(validatePaidValue(collapsed).passes).toBe(false);

    const premiumCollapsed: FanvueContinuationPlan = { ...collapsed, content_level: "premium_sensual" };
    expect(validatePaidValue(premiumCollapsed)).toEqual({ passes: true, reasons: [] });
  });
});
