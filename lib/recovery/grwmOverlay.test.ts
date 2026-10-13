import { describe, it, expect } from "vitest";
import {
  REEL_RECIPES,
  REEL_RECIPE_LIST,
  ROTATION_CLASSIC_IDS,
  isBannedHookText,
  pickHookText,
  recipeIdForDay,
} from "./reelRecipes";
import { pickReelFormatForScene } from "@/lib/reelFormats";
import { ACTION_CLASSES } from "@/lib/sceneSemantics";

const ON = {} as Record<string, string | undefined>;
const OFF = { REEL_MOMENT_RECIPES: "false" } as Record<string, string | undefined>;

describe("grwm / 'almost ready' overlay removed (13.10)", () => {
  it("no recipe pool or variant pool contains a grwm / almost-ready line", () => {
    for (const r of REEL_RECIPE_LIST) {
      for (const t of r.hookTextPool) expect(isBannedHookText(t), `${r.id}: ${t}`).toBe(false);
      for (const v of r.variants ?? []) for (const t of v.hookTextPool) expect(isBannedHookText(t), `${r.id}/${v.id}: ${t}`).toBe(false);
    }
  });

  it("grwm_loading is never in the rotation (moment on or off)", () => {
    expect(ROTATION_CLASSIC_IDS as readonly string[]).not.toContain("grwm_loading");
    for (let d = -20; d < 1000; d++) {
      expect(recipeIdForDay(d, ON)).not.toBe("grwm_loading");
      expect(recipeIdForDay(d, OFF)).not.toBe("grwm_loading");
    }
  });

  it("the scene fallback never lands on grwm_loading, for any action class", () => {
    for (const cls of ACTION_CLASSES) {
      for (let d = 0; d < 60; d++) {
        expect(pickReelFormatForScene(d, cls, ON)?.id).not.toBe("grwm_loading");
        expect(pickReelFormatForScene(d, cls, OFF)?.id).not.toBe("grwm_loading");
      }
    }
  });

  it("pickHookText filters banned lines even from a caller-supplied pool", () => {
    const t = pickHookText(REEL_RECIPES.ootd_stop, 1, ["grwm, almost ready", "how’s the fit"]);
    expect(t).toBe("how’s the fit");
  });
});

describe("overlay rotation never repeats day to day", () => {
  it("advances every day within one pool", () => {
    const r = REEL_RECIPES.ootd_stop;
    for (let d = 0; d < 100; d++) expect(pickHookText(r, d)).not.toBe(pickHookText(r, d + 1));
  });

  it("skips texts used on the previous reels (avoid list, case/quote-insensitive)", () => {
    const r = REEL_RECIPES.reveal_object;
    const pool = ["wait for it", "made you one", "okay, close your eyes"];
    expect(pickHookText(r, 0, pool, ["Wait for it…"])).toBe("made you one");
    expect(pickHookText(r, 0, pool, ["wait for it", "made you one"])).toBe("okay, close your eyes");
  });

  it("simulated 365 days with yesterday as the avoid list: no consecutive repeat", () => {
    let prev: string | null = null;
    for (let d = 0; d < 365; d++) {
      const r = REEL_RECIPES[recipeIdForDay(d, ON)];
      const t = pickHookText(r, d, r.hookTextPool, prev ? [prev] : []);
      if (prev) expect(t).not.toBe(prev);
      prev = t;
    }
  });
});
