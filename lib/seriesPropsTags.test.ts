import { describe, it, expect } from "vitest";
import { reelHookOverrideFor, seriesHashtags, episodeContextBlock } from "./reelHookOverrides";
import { REEL_RECIPES, compileRecipeReel } from "./recovery/reelRecipes";
import type { SceneBriefJson } from "@/lib/sceneBrief";

const B = { camera_language: "static 50mm", color_palette: [], visual_rules: [], location_constraints: [], spatial_setup: "she sits at the kitchen counter", wardrobe_lock: "bee costume", allowed_props: [], lighting_state: "daylight", time_of_day: "morning" } as unknown as SceneBriefJson;
const FF = { reel_hook_overrides: { "2026-11-07": { hook_text: "don't tempt me", tag: "bindi_v1", location: "kitchen", episode_guidance: "x", action: "holding a jar of honey, she dips a finger", allowed_props: ["a jar of honey"] }, "2026-11-06": { hook_text: "hi", tag: "bindi_v1", location: "kitchen", episode_guidance: "x", action: "she smiles" } } };

describe("series allowed_props + hashtags", () => {
  it("allowed_props lifts nothing-in-hands only for that day", () => {
    const o7 = reelHookOverrideFor(FF, "2026-11-07")!;
    const o6 = reelHookOverrideFor(FF, "2026-11-06")!;
    expect(o7.allowed_props).toEqual(["a jar of honey"]);
    const r7 = compileRecipeReel(REEL_RECIPES.surprise_reaction, { sceneBrief: B, sceneLocation: "kitchen", dayNumber: 7, activity: o7.action, allowedProps: o7.allowed_props });
    expect(r7.negativePrompt).toContain("nothing in hands except a jar of honey");
    expect(r7.negativePrompt).toContain("no objects pulled from sleeve");
    const r6 = compileRecipeReel(REEL_RECIPES.surprise_reaction, { sceneBrief: B, sceneLocation: "kitchen", dayNumber: 6, activity: o6.action, allowedProps: o6.allowed_props });
    expect(r6.negativePrompt).toContain("nothing in hands unless the scene requires it");
    expect(episodeContextBlock(o7)).toContain("a jar of honey");
  });
  it("scene days drop travel-arc tags; override hashtags win; non-scene days unchanged", () => {
    const o6 = reelHookOverrideFor(FF, "2026-11-06")!;
    expect(seriesHashtags(o6, ["lisbonhotel", "lioness", "travelgram"])).toEqual(["lioness"]);
    expect(seriesHashtags({ ...o6, hashtags: ["bee"] }, ["lisbonhotel"])).toEqual(["bee"]);
    expect(seriesHashtags(null, ["lisbonhotel"])).toEqual(["lisbonhotel"]);
  });
});
