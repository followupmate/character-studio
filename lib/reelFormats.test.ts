import { describe, it, expect } from "vitest";
import {
  REEL_FORMATS,
  LEGACY_REEL_FORMATS,
  activeReelFormats,
  pickReelFormat,
  pickReelFormatForScene,
} from "./reelFormats";
import { FORMAT_REQUIRED_ACTIONS } from "@/lib/promptDirector/semanticValidator";

describe("pickReelFormat", () => {
  it("rotates deterministically by seed", () => {
    expect(pickReelFormat(0, {}).id).toBe(REEL_FORMATS[0].id);
    expect(pickReelFormat(1, {}).id).toBe(REEL_FORMATS[1].id);
    expect(pickReelFormat(REEL_FORMATS.length, {}).id).toBe(REEL_FORMATS[0].id); // wraps
  });

  it("is stable for the same seed (a retried day keeps its format)", () => {
    expect(pickReelFormat(42, {}).id).toBe(pickReelFormat(42, {}).id);
  });

  it("cycles through every format across consecutive days", () => {
    const seen = new Set(Array.from({ length: REEL_FORMATS.length }, (_, d) => pickReelFormat(d, {}).id));
    expect(seen.size).toBe(REEL_FORMATS.length);
  });

  it("handles negative/garbage seeds without crashing", () => {
    expect(pickReelFormat(-1, {}).id).toBeTruthy();
    expect(pickReelFormat(NaN, {}).id).toBe(REEL_FORMATS[0].id);
  });

  it("every format ships a cover cue and a video directive", () => {
    for (const f of REEL_FORMATS) {
      expect(f.coverCue.length).toBeGreaterThan(20);
      expect(f.videoDirective.length).toBeGreaterThan(20);
    }
  });
});

describe("Phase 2 default rotation = the two reel recipes", () => {
  it("REEL_FORMATS is exactly ootd_stop + grwm_loading and alternates by day", () => {
    expect(REEL_FORMATS.map((f) => f.id)).toEqual(["ootd_stop", "grwm_loading"]);
    expect(pickReelFormat(0, {}).id).toBe("ootd_stop");
    expect(pickReelFormat(1, {}).id).toBe("grwm_loading");
    expect(pickReelFormat(2, {}).id).toBe("ootd_stop");
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
  it("keeps the calendar pick when the scene can carry it", () => {
    expect(pickReelFormatForScene(0, "locomotion", {})?.id).toBe("ootd_stop");
    expect(pickReelFormatForScene(1, "grooming", {})?.id).toBe("grwm_loading");
    expect(pickReelFormatForScene(0, "standing_still", {})?.id).toBe("ootd_stop");
  });

  it("swaps to the other recipe when the calendar pick does not fit", () => {
    expect(pickReelFormatForScene(0, "grooming", {})?.id).toBe("grwm_loading"); // ootd can't do grooming
    expect(pickReelFormatForScene(1, "locomotion", {})?.id).toBe("ootd_stop"); // grwm can't do locomotion
  });

  it("returns undefined when no recipe fits (swim, exercise, reclining...)", () => {
    for (const c of ["swimming", "exercise", "reclining", "eating_drinking", "other"] as const) {
      expect(pickReelFormatForScene(0, c, {}), c).toBeUndefined();
      expect(pickReelFormatForScene(1, c, {}), c).toBeUndefined();
    }
  });

  it("unknown scene class falls back to the calendar pick", () => {
    expect(pickReelFormatForScene(1, undefined, {})?.id).toBe("grwm_loading");
  });

  it("legacy mode ignores the scene filter (pre-Phase-2 behaviour)", () => {
    expect(pickReelFormatForScene(0, "swimming", { REEL_FORMATS_LEGACY: "true" } as never)?.id).toBe("pov");
  });
});
