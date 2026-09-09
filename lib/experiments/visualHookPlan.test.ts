import { describe, it, expect } from "vitest";
import {
  assertSceneUnchanged,
  buildVhdMarker,
  validateMotifAgainstBrief,
  validatePlan,
  VHD_PAYOFF_CEILING_SEC,
  VHD_TOTAL,
  type VisualHookPlan,
} from "@/lib/experiments/visualHookPlan";
import type { SceneBriefJson } from "@/lib/sceneBrief";

const brief = (over: Partial<SceneBriefJson> = {}): SceneBriefJson => ({
  camera_language: "static 50mm",
  color_palette: ["warm cream"],
  visual_rules: [],
  location_constraints: [],
  spatial_setup: "a plain room with a bed",
  wardrobe_lock: "cream camisole",
  allowed_props: [],
  lighting_state: "soft window light",
  time_of_day: "morning",
  weather_implied: "indoor",
  ...over,
});

const plan = (over: Partial<VisualHookPlan> = {}): VisualHookPlan => ({
  experimentIndex: 1,
  motifFamily: "intimate_face",
  framing: "close",
  faceDominance: "dominant",
  contrastLevel: "low",
  backgroundComplexity: "simple",
  socialPresence: "solo",
  hookType: "gaze_turn",
  hookStartSec: 0.4,
  payoffSec: 1.4,
  experimentRole: "control",
  ...over,
});

describe("the plan may not change the scene", () => {
  it("passes when nothing protected moved", () => {
    const before = brief();
    expect(() => assertSceneUnchanged(before, brief())).not.toThrow();
  });

  it("catches a repainted wall, a swapped wardrobe or an invented prop", () => {
    // This is the failure the whole type exists to prevent: an arm that "just adjusts" the scene
    // is no longer a different presentation of the same scene, it is a different scene.
    expect(() => assertSceneUnchanged(brief(), brief({ spatial_setup: "a plain room with a cobalt wall" }))).toThrow(
      /spatial_setup/
    );
    expect(() => assertSceneUnchanged(brief(), brief({ wardrobe_lock: "black dress" }))).toThrow(/wardrobe_lock/);
    expect(() => assertSceneUnchanged(brief(), brief({ allowed_props: ["a glass"] }))).toThrow(/allowed_props/);
  });

  it("allows presentation-only fields to differ", () => {
    // lighting_state and color_palette are the scene's own description; the plan does not write
    // them either, but they are not part of the protected identity set.
    expect(() => assertSceneUnchanged(brief(), brief({ camera_language: "static handheld 50mm" }))).not.toThrow();
  });
});

describe("a motif must already exist in the brief", () => {
  it("refuses bold_color when nothing in the scene is saturated", () => {
    expect(validateMotifAgainstBrief("bold_color", brief())).toMatch(/saturated/);
    expect(validateMotifAgainstBrief("bold_color", brief({ color_palette: ["cobalt blue"] }))).toBeNull();
  });

  it("refuses hard_light_shadow under soft light", () => {
    expect(validateMotifAgainstBrief("hard_light_shadow", brief())).toMatch(/hard/);
    expect(
      validateMotifAgainstBrief("hard_light_shadow", brief({ lighting_state: "hard raking sun through a slatted blind" }))
    ).toBeNull();
  });

  it("refuses social_depth in an empty room", () => {
    expect(validateMotifAgainstBrief("social_depth", brief())).toMatch(/people/);
    expect(validateMotifAgainstBrief("social_depth", brief({ spatial_setup: "a bar with blurred patrons behind" }))).toBeNull();
  });

  it("refuses graphic_environment with no repeating geometry", () => {
    expect(validateMotifAgainstBrief("graphic_environment", brief())).toMatch(/geometric/);
    expect(validateMotifAgainstBrief("graphic_environment", brief({ spatial_setup: "a wall of glazed tiles" }))).toBeNull();
  });

  it("asks nothing of the scene for intimate_face — the work is in the crop", () => {
    expect(validateMotifAgainstBrief("intimate_face", brief())).toBeNull();
  });
});

describe("plan validation", () => {
  it("accepts a well-formed plan", () => {
    expect(validatePlan(plan())).toEqual([]);
  });

  it("holds the payoff ceiling", () => {
    expect(validatePlan(plan({ payoffSec: VHD_PAYOFF_CEILING_SEC + 0.5 }))).toEqual([
      expect.stringContaining("exceeds"),
    ]);
  });

  it("requires the payoff to come after the first change", () => {
    expect(validatePlan(plan({ hookStartSec: 1.5, payoffSec: 1.0 }))).toEqual([expect.stringContaining("after")]);
  });

  it("keeps the wider crop tied to the one motif that earns it", () => {
    expect(validatePlan(plan({ framing: "medium_graphic" }))).toEqual([expect.stringContaining("graphic_environment")]);
    expect(
      validatePlan(
        plan({
          framing: "medium_graphic",
          motifFamily: "graphic_environment",
          backgroundComplexity: "textured",
          socialPresence: "implied",
        })
      )
    ).toEqual([]);
  });

  it("keeps social presence and background complexity consistent", () => {
    expect(validatePlan(plan({ socialPresence: "ambient", backgroundComplexity: "simple" }))).toContainEqual(
      expect.stringContaining("populated")
    );
  });

  it("bounds the index to the experiment size", () => {
    expect(validatePlan(plan({ experimentIndex: VHD_TOTAL + 1 }))).toEqual([expect.stringContaining("experimentIndex")]);
  });
});

describe("the persisted marker", () => {
  it("carries exactly the agreed experiment fields", () => {
    const m = buildVhdMarker(plan());
    expect(m.version).toBe("v1");
    expect(m.index).toBe(1);
    expect(m.motif_family).toBe("intimate_face");
    expect(m.hook_type).toBe("gaze_turn");
    expect(m.hook_start_sec).toBe(0.4);
    expect(m.payoff_sec).toBe(1.4);
    expect(m.experiment_role).toBe("control");
  });

  it("carries pipeline fields only when given them", () => {
    expect(buildVhdMarker(plan()).target_duration_sec).toBeUndefined();
    expect(buildVhdMarker(plan(), { target_duration_sec: 8 }).target_duration_sec).toBe(8);
  });
});
