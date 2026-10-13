import { describe, it, expect } from "vitest";
import {
  REEL_FORMATS,
  LEGACY_REEL_FORMATS,
  activeReelFormats,
  pickReelFormat,
  pickReelFormatForScene,
} from "./reelFormats";
import { FORMAT_REQUIRED_ACTIONS } from "@/lib/promptDirector/semanticValidator";

const CLASSIC = { REEL_MOMENT_RECIPES: "false" } as never;

describe("pickReelFormat", () => {
  it("rotates deterministically by seed (phase 8: 10-day M/C pattern)", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => pickReelFormat(d, {}).id)).toEqual([
      "reveal_object", "outfit_reveal", "ootd_stop", "surprise_reaction", "playful_camera",
      "reveal_object", "grwm_loading", "outfit_reveal", "surprise_reaction", "ootd_stop", "playful_camera",
    ]);
  });

  it("is stable for the same seed (a retried day keeps its format)", () => {
    expect(pickReelFormat(42, {}).id).toBe(pickReelFormat(42, {}).id);
  });

  it("cycles through every format within 20 consecutive days", () => {
    const seen = new Set(Array.from({ length: 20 }, (_, d) => pickReelFormat(d, {}).id));
    expect(seen.size).toBe(REEL_FORMATS.length);
  });

  it("handles negative/garbage seeds without crashing", () => {
    expect(pickReelFormat(-1, {}).id).toBeTruthy();
    expect(pickReelFormat(NaN, {}).id).toBe(pickReelFormat(0, {}).id);
  });

  it("every format ships a cover cue and a video directive", () => {
    for (const f of REEL_FORMATS) {
      expect(f.coverCue.length).toBeGreaterThan(20);
      expect(f.videoDirective.length).toBeGreaterThan(20);
    }
  });
});

describe("Phase 2 default rotation = the two reel recipes", () => {
  it("REEL_FORMATS = all six recipes; with REEL_MOMENT_RECIPES=false the classic pair alternates by day", () => {
    expect(REEL_FORMATS.map((f) => f.id)).toEqual(["ootd_stop", "grwm_loading", "reveal_object", "outfit_reveal", "surprise_reaction", "playful_camera"]);
    expect(pickReelFormat(0, CLASSIC).id).toBe("ootd_stop");
    expect(pickReelFormat(1, CLASSIC).id).toBe("grwm_loading");
    expect(pickReelFormat(2, CLASSIC).id).toBe("ootd_stop");
  });

  it("the legacy seven are still available, verbatim, behind REEL_FORMATS_LEGACY=true", () => {
    expect(LEGACY_REEL_FORMATS.map((f) => f.id)).toEqual([
      "pov", "wait_for_it", "grwm", "romanticize", "reveal_transition", "relatable_confession", "asmr_satisfying",
    ]);
    const env = { REEL_FORMATS_LEGACY: "true" } as never;
    expect(activeReelFormats(env)).toBe(LEGACY_REEL_FORMATS);
    expect(pickReelFormat(3, env).id).toBe("romanticize");
    expect(activeReelFormats({} as never)).toBe(REEL_FORMATS);
  });

  it("every legacy format that has a scene rule still has its FORMAT_REQUIRED_ACTIONS entry", () => {
    for (const id of ["asmr_satisfying", "grwm", "reveal_transition"]) expect(FORMAT_REQUIRED_ACTIONS[id]).toBeDefined();
    for (const f of REEL_FORMATS) expect(FORMAT_REQUIRED_ACTIONS[f.id]).toBeDefined();
  });
});

describe("pickReelFormatForScene", () => {
  it("classic mode keeps the old behaviour", () => {
    expect(pickReelFormatForScene(0, "locomotion", CLASSIC)?.id).toBe("ootd_stop");
    expect(pickReelFormatForScene(1, "grooming", CLASSIC)?.id).toBe("grwm_loading");
    expect(pickReelFormatForScene(0, "grooming", CLASSIC)?.id).toBe("grwm_loading");
    expect(pickReelFormatForScene(1, "locomotion", CLASSIC)?.id).toBe("ootd_stop");
    for (const c of ["swimming", "exercise", "reclining", "eating_drinking", "other"] as const) {
      expect(pickReelFormatForScene(0, c, CLASSIC), c).toBeUndefined();
    }
  });

  it("keeps the calendar pick when the scene can carry it", () => {
    expect(pickReelFormatForScene(0, "seated_still", {})?.id).toBe("reveal_object");
    expect(pickReelFormatForScene(2, "locomotion", {})?.id).toBe("ootd_stop");
  });

  it("falls back to another moment recipe first, skipping yesterday's pick", () => {
    // day 3 = surprise_reaction (cannot walk); yesterday (day 2) = ootd_stop -> outfit_reveal
    expect(pickReelFormatForScene(3, "locomotion", {})?.id).toBe("outfit_reveal");
    // day 0 = reveal_object (cannot recline) -> surprise_reaction
    expect(pickReelFormatForScene(0, "reclining", {})?.id).toBe("surprise_reaction");
  });

  it("returns undefined when no recipe fits (swim, exercise)", () => {
    for (const c of ["swimming", "exercise"] as const) {
      for (let d = 0; d < 10; d++) expect(pickReelFormatForScene(d, c, {}), c).toBeUndefined();
    }
  });

  it("unknown scene class falls back to the calendar pick", () => {
    expect(pickReelFormatForScene(1, undefined, {})?.id).toBe("outfit_reveal");
  });

  it("legacy mode ignores the scene filter (pre-Phase-2 behaviour)", () => {
    expect(pickReelFormatForScene(0, "swimming", { REEL_FORMATS_LEGACY: "true" } as never)?.id).toBe("pov");
  });
});
