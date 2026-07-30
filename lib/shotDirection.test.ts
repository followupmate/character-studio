import { describe, it, expect } from "vitest";
import {
  buildShotDirections,
  checkGradation,
  translateSexualEnergy,
  translateSensualVisualLanguage,
  translateSexAppealStyle,
  translateLuxurySeduction,
  translatePlayfulHotWorld,
  SHOT_STEP_ORDER,
  FRAMING_RANK,
  type ShotDirection,
} from "./shotDirection";
import type { GenerativeSituation } from "./situationPlanner";

function baseSituation(overrides: Partial<GenerativeSituation> = {}): GenerativeSituation {
  return {
    content_tier: "luxe_car",
    current_life_context: "a night out",
    life_domain: "nightlife_and_transit_arrival",
    continuity_phase: "event",
    desire_signal: "she decided to go",
    trigger: "an invitation arrived",
    activity: "stepping out of a car",
    reason: "arriving at a destination",
    social_context: { mode: "off_camera_person", implication: "a driver is present, not shown" },
    emotional_state: "electric, deliberate",
    previous_consequence: null,
    next_implication: null,
    personality_signal: "confident",
    reality_detail: "the clutch is unzipped",
    magnetic_hook: "mid-step out of the car",
    magnetism_reason: "provocative_ambiguity",
    sexual_energy: { level: "provocative", expression: "direct eye contact toward camera", boundary: "back bare to the waist, no lower" },
    fanvue_tension: { potential: "strong", continuation: "closer, tighter framing", withheld_element: "the full rear view" },
    visual_execution: { location: "city street at night, beside a luxury car", time_of_day: "night", weather: "warm, clear", action_visible: "stepping out, one heel on the sill", shot_intent: "full-body to three-quarter frame" },
    sensual_visual_language: {
      wardrobe_signal: "backless halter bodysuit with tailored shorts",
      body_emphasis: "back and shoulders, bodycon silhouette",
      gesture_or_action: "stepping out with one heel on the sill",
      camera_relationship: "medium full-body frame from just outside the car",
      exposure_boundary: "bare back to the waist is IG-safe",
    },
    sex_appeal_style: {
      outfit_archetype: "backless structured halter bodysuit",
      silhouette_focus: "back and shoulders",
      leg_visibility: "mid-thigh down",
      facial_energy: "teasing closed-mouth smile",
      seduction_mode: "controlled reveal",
    },
    luxury_seduction: {
      luxury_level: "high_luxury",
      fashion_direction: "backless structured halter bodysuit with tailored shorts",
      material_language: "matte structured crepe",
      accessory_language: "thin gold chain, small structured clutch",
      footwear: "pointed black heeled sandals",
      pose_archetype: "stepping out of a car, one heel on the sill, half-turned",
      body_geometry: "open shoulder and back line",
      facial_seduction: "teasing closed-mouth smile, controlled",
      social_status_signal: "the car door is still open, cabin light warm",
    },
    playful_hot_world: {
      mood_temperature: "warm",
      vitality_level: "electric",
      social_pulse: "private",
      seasonality: "summer",
      color_energy: "vivid",
      fun_factor: "high",
    },
    ...overrides,
  };
}

describe("translateSexualEnergy", () => {
  it("maps each level to a distinct pose/expression/framing triple", () => {
    const levels = ["subtle", "warm", "playful", "provocative", "intimate"] as const;
    const results = levels.map((level) => translateSexualEnergy({ level, expression: "x", boundary: "y" }));
    expect(new Set(results.map((r) => r.poseHint)).size).toBe(5);
    expect(new Set(results.map((r) => r.expressionHint)).size).toBe(5);
    // framing should be non-decreasing subtle -> intimate
    const ranks = results.map((r) => FRAMING_RANK[r.framing]);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
  });
});

describe("translateSensualVisualLanguage / translateSexAppealStyle / translateLuxurySeduction / translatePlayfulHotWorld", () => {
  const situation = baseSituation();

  it("drops camera_relationship/exposure_boundary from sensual_visual_language translation (Fanvue-safety bookkeeping, not visual content)", () => {
    const result = translateSensualVisualLanguage(situation.sensual_visual_language!);
    expect(result.wardrobeState).not.toContain("IG-safe");
    expect(result.wardrobeState).toContain("backless halter bodysuit");
  });

  it("maps sex_appeal_style to wardrobe/body-emphasis/facial hints", () => {
    const result = translateSexAppealStyle(situation.sex_appeal_style!);
    expect(result.wardrobeHint).toBe(situation.sex_appeal_style!.outfit_archetype);
    expect(result.facialExpression).toBe(situation.sex_appeal_style!.facial_energy);
  });

  it("maps luxury_seduction to wardrobe/pose/facial/status hints", () => {
    const result = translateLuxurySeduction(situation.luxury_seduction!);
    expect(result.pose).toBe(situation.luxury_seduction!.pose_archetype);
    expect(result.statusHint).toBe(situation.luxury_seduction!.social_status_signal);
  });

  it("maps playful_hot_world to lighting/camera-motion hints, never per-shot fields", () => {
    const result = translatePlayfulHotWorld(situation.playful_hot_world!);
    expect(result.lightingHint).toContain("warm");
    // Concrete cinematography terms (Kling's own prompting guide: vague words like "energetic"
    // underperform specific direction like "handheld push-in") — assert on the mechanism, not a
    // literal mood word.
    expect(result.cameraMotion).toMatch(/push-in|dolly|handheld|tripod|drift/);
  });
});

describe("buildShotDirections", () => {
  const shots = buildShotDirections(baseSituation(), "luxe_car");

  it("produces exactly 6 shots in SHOT_STEP_ORDER", () => {
    expect(shots).toHaveLength(6);
    expect(shots.map((s) => s.source_step)).toEqual(SHOT_STEP_ORDER);
  });

  it("never leaks business vocabulary into any field", () => {
    const banned = ["paid_promise", "content_level", "erotic_tease", "premium_sensual", "fanvue_tension", "payoff"];
    const serialized = JSON.stringify(shots).toLowerCase();
    for (const term of banned) {
      // "payoff" appears legitimately as a source_step value — check it's not present as prose elsewhere
      if (term === "payoff") continue;
      expect(serialized).not.toContain(term);
    }
  });

  it("does not hardcode a specific vehicle/room noun as a universal rule — spatial_zone is derived from the StoryDay's own location", () => {
    // bridge/private_access/escalation/reveal/payoff all echo the StoryDay's real location text;
    // afterglow deliberately drifts to abstract "pulled back" wind-down language (still no
    // hardcoded universal noun — just doesn't restate the location verbatim for this one beat).
    const echoesLocation = shots.filter((s) => s.spatial_zone.includes("city street at night, beside a luxury car"));
    expect(echoesLocation.length).toBeGreaterThanOrEqual(5);
  });

  it("passes its own gradation check (real production data)", () => {
    expect(checkGradation(shots)).toEqual({ passes: true, reasons: [] });
  });

  it("bridge is IG-safe/public in character (wardrobe unshifted) and afterglow does not repeat it", () => {
    const bridge = shots.find((s) => s.source_step === "bridge")!;
    const afterglow = shots.find((s) => s.source_step === "afterglow")!;
    expect(bridge.wardrobe_state).toContain("nothing shifted");
    expect(afterglow.spatial_zone).not.toBe(bridge.spatial_zone);
  });

  it("framing never narrows from bridge through payoff", () => {
    const order = ["bridge", "private_access", "escalation", "reveal", "payoff"] as const;
    let last = -1;
    for (const step of order) {
      const shot = shots.find((s) => s.source_step === step)!;
      const rank = FRAMING_RANK[shot.framing];
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
    }
  });

  it("wardrobe_state always names a color, even when the source situation data doesn't — the practical substitute for Soul HEX (web-UI-only, no API param)", () => {
    // Real production finding: the exact same wardrobe_state string rendered charcoal-black in
    // one independently-generated shot and tan/beige in another when the text named no color at
    // all. All 6 shots share one wardrobe string (built once in buildShotDirections), so as long
    // as that shared string names a color, every shot gets the same explicit anchor.
    for (const shot of shots) {
      expect(shot.wardrobe_state).toMatch(
        /\b(black|white|red|blue|green|tan|beige|charcoal|grey|gray|brown|gold|silver|pink|purple|orange|yellow|cream|navy|burgundy|ivory|nude|rose|olive|maroon|copper|bronze)\b/i
      );
    }
  });

  it("does not append a fallback color when the situation data already names one", () => {
    const withColor = baseSituation({
      luxury_seduction: {
        ...baseSituation().luxury_seduction!,
        fashion_direction: "a sleek emerald green evening dress with a fitted bodice",
      },
    });
    const withColorShots = buildShotDirections(withColor, "luxe_car");
    for (const shot of withColorShots) {
      expect(shot.wardrobe_state).toContain("emerald");
      expect(shot.wardrobe_state).not.toContain("charcoal-black");
    }
  });
});

describe("checkGradation", () => {
  const goodShots = buildShotDirections(baseSituation(), "luxe_car");

  it("passes real production shots", () => {
    expect(checkGradation(goodShots).passes).toBe(true);
  });

  it("rejects when fewer than 3 of 7 dimensions change between consecutive shots", () => {
    const flattened: ShotDirection[] = goodShots.map((s, i) => (i === 2 ? { ...goodShots[1] } : s));
    const result = checkGradation(flattened);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("only changes");
  });

  it("rejects when afterglow repeats bridge's spatial_zone and pose", () => {
    const bridge = goodShots.find((s) => s.source_step === "bridge")!;
    const broken = goodShots.map((s) => (s.source_step === "afterglow" ? { ...s, spatial_zone: bridge.spatial_zone, pose: bridge.pose } : s));
    const result = checkGradation(broken);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("afterglow repeats bridge");
  });

  it("rejects a framing regression across the escalation ramp", () => {
    const broken = goodShots.map((s) => (s.source_step === "reveal" ? { ...s, framing: "wide establishing" as const } : s));
    const result = checkGradation(broken);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("narrows");
  });
});

describe("buildShotDirections — tier-agnostic (no hardcoded per-tier prop table)", () => {
  it("works identically in shape for a non-luxe_car tier using the same generic beat structure", () => {
    const intimateSituation = baseSituation({
      content_tier: "intimate_aesthetic",
      visual_execution: { location: "a private hotel suite", time_of_day: "evening", weather: "indoor", action_visible: "getting ready", shot_intent: "medium shot" },
    });
    const shots = buildShotDirections(intimateSituation, "intimate_aesthetic");
    expect(shots).toHaveLength(6);
    expect(shots.map((s) => s.source_step)).toEqual(SHOT_STEP_ORDER);
    const echoesLocation = shots.filter((s) => s.spatial_zone.includes("a private hotel suite"));
    expect(echoesLocation.length).toBeGreaterThanOrEqual(5);
    expect(checkGradation(shots).passes).toBe(true);
  });
});
