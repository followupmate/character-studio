import { describe, it, expect } from "vitest";
import { REEL_RECIPES, compileRecipeReel, withOverridePose } from "./reelRecipes";
import type { SceneBriefJson } from "@/lib/sceneBrief";

const DECK: SceneBriefJson = {
  camera_language: "static 50mm",
  color_palette: ["warm cream"],
  visual_rules: [],
  location_constraints: [],
  spatial_setup: "she sits on a cushioned lounger on a garden deck with banana leaves behind her",
  wardrobe_lock: "brown velvet bodysuit, small lion ears",
  allowed_props: [],
  lighting_state: "soft daylight",
  time_of_day: "afternoon",
} as unknown as SceneBriefJson;

const ACTION = "she leans in toward the lens, blows a kiss and smiles";

describe("series override action beats the moment recipe", () => {
  it("surprise_reaction video uses the override pose, not the surprise beat", () => {
    const out = compileRecipeReel(REEL_RECIPES.surprise_reaction, { sceneBrief: DECK, sceneLocation: "garden deck", dayNumber: 2, activity: ACTION });
    expect(out.prompt).toContain("blows a kiss");
    expect(out.prompt.toLowerCase()).not.toMatch(/catches her attention|startled|surprised/);
    expect(out.variant).toBeUndefined();
  });
  it("without an action the recipe is unchanged", () => {
    const out = compileRecipeReel(REEL_RECIPES.surprise_reaction, { sceneBrief: DECK, sceneLocation: "garden deck", dayNumber: 2 });
    expect(out.prompt).not.toContain("blows a kiss");
  });
  it("withOverridePose rewrites cover cue and directive; tries_episode untouched", () => {
    const r = withOverridePose(REEL_RECIPES.surprise_reaction, ACTION);
    expect(r.coverCue).toContain("blows a kiss");
    expect(r.videoDirective).toContain("blows a kiss");
    expect(r.archetypeAction).toContain("blows a kiss");
    expect(withOverridePose(REEL_RECIPES.surprise_reaction, null)).toBe(REEL_RECIPES.surprise_reaction);
    expect(withOverridePose(REEL_RECIPES.tries_episode, ACTION)).toBe(REEL_RECIPES.tries_episode);
  });
});
