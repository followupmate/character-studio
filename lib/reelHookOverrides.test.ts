import { describe, it, expect } from "vitest";
import { reelHookOverrideFor, episodeContextBlock } from "./reelHookOverrides";
import { REEL_RECIPES, REEL_RECIPE_LIST, getReelRecipe, isReelRecipeId, recipeIdForDay, compileRecipeReel } from "./recovery/reelRecipes";
import { validateHookText } from "./video/hookTextValidator";
import type { SceneBriefJson } from "./sceneBrief";

const brief = (spatial: string): SceneBriefJson => ({
  camera_language: "static 50mm", color_palette: ["warm cream"], visual_rules: [], location_constraints: [],
  spatial_setup: spatial, wardrobe_lock: "fitted black riding jacket, cream knit, tan breeches", allowed_props: [],
  lighting_state: "soft overcast daylight", time_of_day: "morning", weather_implied: "clear",
});

describe("reel_hook_overrides", () => {
  const flags = {
    discovery_mode: true,
    reel_hook_overrides: {
      "2026-10-19": { hook_text: "day 1: horse riding. never done this", caption: "a\nwhat should i try next?", tag: "tries_v1", recipe: "tries_episode", tier: "wellness_fitness", location: "stable", episode_guidance: "horse riding" },
      "2026-10-20": { hook_text: "they say i'm not real. does it matter?", caption: "c", tag: "controversy_v1" },
      "2026-10-25": { tag: "tries_v1", episode_guidance: "sunday recap" },
      "2026-10-26": { hook_text: "grwm, almost ready" },
    },
  };
  it("parses full series entries and keeps the legacy controversy shape", () => {
    expect(reelHookOverrideFor(flags, "2026-10-19")).toMatchObject({ recipe: "tries_episode", tag: "tries_v1", tier: "wellness_fitness" });
    expect(reelHookOverrideFor(flags, "2026-10-20")).toMatchObject({ hook_text: "they say i'm not real. does it matter?", tag: "controversy_v1", recipe: null });
    expect(reelHookOverrideFor(flags, "2026-10-25")).toMatchObject({ hook_text: null, tag: "tries_v1" });
    expect(reelHookOverrideFor(flags, "2026-10-26")).toBeNull(); // banned hook and nothing else
    expect(reelHookOverrideFor(flags, "2026-10-21")).toBeNull();
    expect(episodeContextBlock(reelHookOverrideFor(flags, "2026-10-19"))).toMatch(/SERIES EPISODE TODAY[\s\S]*stable/);
    expect(episodeContextBlock(reelHookOverrideFor(flags, "2026-10-20"))).toBeUndefined();
  });
  it("tries_episode is a real recipe but never in the rotation / curated list", () => {
    expect(isReelRecipeId("tries_episode")).toBe(true);
    expect(getReelRecipe("tries_episode")).toBe(REEL_RECIPES.tries_episode);
    expect(REEL_RECIPE_LIST.map((r) => r.id)).not.toContain("tries_episode");
    for (let d = 0; d < 60; d++) expect(recipeIdForDay(d)).not.toBe("tries_episode");
  });
  it("tries_episode compiles on exercise / riding scenes", () => {
    for (const s of ["She is riding a chestnut horse at a slow trot in a sand arena, wooden stable behind her.", "She grips the pole in a bright dance studio, trying her first spin.", "She throws a jab at a heavy bag in a boxing gym."]) {
      const out = compileRecipeReel(REEL_RECIPES.tries_episode, { sceneBrief: brief(s), sceneLocation: "studio", dayNumber: 141 });
      expect(out.marker.id).toBe("tries_episode");
    }
  });
  it("approved override texts render with relaxed limits; normal hooks keep the strict limits", async () => {
    for (const t of ["they say i'm not real. does it matter?", "no text back in 2 days = he's gone. agree?", "day 1: horse riding. never done this", "day 6: construction site. never done this"]) {
      const v = await validateHookText(t, { relaxed: true });
      expect(v.issues).toEqual([]);
    }
    expect((await validateHookText("day 1: horse riding. never done this")).ok).toBe(false);
  });
});

describe("tries_episode fixes (18.10 preview)", () => {
  const ACTS = ["riding a calm chestnut horse at a walk", "spinning slowly around the pole", "trying a cartwheel on the floor mat", "shaping wet clay on the pottery wheel", "throwing punches at a heavy bag", "carrying a wooden plank across the site", "standing up on a surfboard in small waves", "drawing a bow and aiming at the target"];
  it("the reel prompt names the day's activity and the marker asks for the lower overlay", () => {
    for (const a of ACTS) {
      const out = compileRecipeReel(REEL_RECIPES.tries_episode, { sceneBrief: brief(`She is ${a}, her first time.`), sceneLocation: "studio", dayNumber: 141, activity: a });
      expect(out.prompt).toContain(a);
      expect(out.marker.overlay_position).toBe("lower");
    }
  });
  it("other recipes keep the top overlay and ignore activity", () => {
    const out = compileRecipeReel(REEL_RECIPES.surprise_reaction, { sceneBrief: brief("She sits at the café table by the window."), sceneLocation: "cafe", dayNumber: 3, activity: "riding a horse" });
    expect(out.prompt).not.toContain("riding a horse");
    expect(out.marker.overlay_position).toBeUndefined();
  });
  it("lower placement stays inside the IG safe zone for every series overlay", async () => {
    for (const t of ["day 1: horse riding. never done this", "day 6: construction site. never done this", "day 4: you picked ceramics"]) {
      const v = await validateHookText(t, { relaxed: true, position: "lower" });
      expect(v.issues).toEqual([]);
      if (v.layout?.ok) expect(v.layout.bbox.top).toBeGreaterThan(1000);
    }
  });
});
