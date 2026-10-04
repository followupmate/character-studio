import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  REEL_RECIPES,
  REEL_RECIPE_IDS,
  REEL_RECIPE_LIST,
  compileRecipeReel,
  getReelRecipe,
  isReelRecipeId,
  pickHookText,
  readReelRecipeMarker,
  recipeSupportsActionClass,
  reelRecipesEnabled,
} from "./reelRecipes";
import { compileSimpleReel, DEFAULT_REEL_NEGATIVES } from "./simpleReelCompiler";
import { REEL_ARCHETYPE_ACTION } from "@/lib/reelArchetypeAction";
import { FORMAT_REQUIRED_ACTIONS } from "@/lib/promptDirector/semanticValidator";
import { validateHookText } from "@/lib/video/hookTextValidator";
import { ACTION_CLASSES, resolveSceneSemantics, type ActionClass } from "@/lib/sceneSemantics";
import type { SceneBriefJson } from "@/lib/sceneBrief";

function brief(spatial: string): SceneBriefJson {
  return {
    camera_language: "static 50mm",
    color_palette: ["warm cream"],
    visual_rules: [],
    location_constraints: [],
    spatial_setup: spatial,
    wardrobe_lock: "cream linen shirt, thin gold chain at her collarbone",
    allowed_props: [],
    lighting_state: "window light from the left",
    time_of_day: "morning",
    weather_implied: "clear",
  };
}

const SCENES: Record<string, { brief: SceneBriefJson; location: string; cls: ActionClass }> = {
  locomotion: { brief: brief("She walks down a cobblestone street, old stone walls on both sides."), location: "street", cls: "locomotion" },
  standing: { brief: brief("She stands on the terrace by the railing, city behind her."), location: "terrace", cls: "standing_still" },
  mirror: { brief: brief("She stands in front of a full-length mirror in the dressing area, linen wardrobe behind her."), location: "dressing room", cls: "standing_still" },
  grooming: { brief: brief("She stands at the bathroom vanity mirror brushing her hair, marble counter."), location: "bathroom", cls: "grooming" },
  seated: { brief: brief("She sits at the window desk."), location: "office", cls: "seated_still" },
};

describe("recipe definitions", () => {
  it("has exactly ootd_stop and grwm_loading, id === key === archetype id", () => {
    expect([...REEL_RECIPE_IDS]).toEqual(["ootd_stop", "grwm_loading"]);
    for (const id of REEL_RECIPE_IDS) expect(REEL_RECIPES[id].id).toBe(id);
    expect(REEL_RECIPE_LIST).toHaveLength(2);
    expect(getReelRecipe("ootd_stop")?.label).toBe("OOTD stop");
    expect(getReelRecipe("walking_motion")).toBeUndefined();
    expect(isReelRecipeId("grwm_loading")).toBe(true);
    expect(isReelRecipeId(null)).toBe(false);
  });

  it("static copies in reelArchetypeAction / semanticValidator stay in sync with the recipes", () => {
    for (const r of REEL_RECIPE_LIST) {
      expect(REEL_ARCHETYPE_ACTION[r.id], `${r.id} action`).toBe(r.archetypeAction);
      expect([...FORMAT_REQUIRED_ACTIONS[r.id].actions].sort(), `${r.id} actions`).toEqual([...r.requiredActionClasses].sort());
    }
  });

  it("every hook text passes the full hook validator (spelling, glyphs, allowlist, layout, ban list)", async () => {
    for (const r of REEL_RECIPE_LIST) {
      expect(r.hookTextPool.length).toBeGreaterThanOrEqual(5);
      for (const t of r.hookTextPool) {
        const v = await validateHookText(t);
        expect(v.issues, `"${t}" (${r.id})`).toEqual([]);
        expect(v.ok).toBe(true);
      }
    }
  });

  it("hook texts are lowercase, <= 6 words, unique within a pool", () => {
    for (const r of REEL_RECIPE_LIST) {
      expect(new Set(r.hookTextPool).size).toBe(r.hookTextPool.length);
      for (const t of r.hookTextPool) {
        expect(t, t).toBe(t.toLowerCase());
        expect(t.split(/\s+/).length).toBeLessThanOrEqual(6);
      }
    }
  });

  it("pickHookText is deterministic and walks the whole pool across a recipe's own days", () => {
    for (const r of REEL_RECIPE_LIST) {
      expect(pickHookText(r, 10)).toBe(pickHookText(r, 10));
      // a recipe runs on every 2nd day (rotation of 2) -> its days are all even or all odd
      const parity = REEL_RECIPE_IDS.indexOf(r.id);
      const seen = new Set<string>();
      for (let k = 0; k < r.hookTextPool.length; k++) seen.add(pickHookText(r, parity + 2 * k));
      expect(seen.size).toBe(r.hookTextPool.length);
    }
    expect(pickHookText(REEL_RECIPES.ootd_stop, NaN)).toBe(REEL_RECIPES.ootd_stop.hookTextPool[0]);
  });
});

describe("negative prompt override", () => {
  it("compileSimpleReel without an override is byte-identical to the legacy list", () => {
    const out = compileSimpleReel({ sceneBrief: SCENES.seated.brief, sceneLocation: "office", dayNumber: 3 });
    expect(out.negativePrompt).toBe(DEFAULT_REEL_NEGATIVES.join(", "));
    expect(out.negativePrompt).toBe(
      "no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing"
    );
  });

  it("ootd_stop forbids cuts but never forbids walking or subject movement", () => {
    const n = REEL_RECIPES.ootd_stop.negativePrompt;
    expect(n).toMatch(/no cuts/);
    expect(n).not.toMatch(/no (walking|movement|motion|camera movement)/);
  });

  it("compileSimpleReel uses the override verbatim", () => {
    const out = compileSimpleReel({ sceneBrief: SCENES.locomotion.brief, sceneLocation: "street", negativePrompt: "foo, bar" });
    expect(out.negativePrompt).toBe("foo, bar");
  });
});

describe("compileRecipeReel", () => {
  it("scene fixtures resolve to the action classes the tests assume", () => {
    for (const [name, s] of Object.entries(SCENES)) {
      expect(resolveSceneSemantics(s.brief, { sceneLocation: s.location }).actionClass, name).toBe(s.cls);
    }
  });

  it("ootd_stop compiles cleanly on locomotion and standing scenes (no locomotion_coherence trip)", () => {
    for (const k of ["locomotion", "standing", "mirror"]) {
      const out = compileRecipeReel(REEL_RECIPES.ootd_stop, { sceneBrief: SCENES[k].brief, sceneLocation: SCENES[k].location, dayNumber: 4 });
      expect(out.validation.errors, k).toEqual([]);
      expect(out.prompt).toMatch(/mid-stride/);
      expect(out.prompt).toMatch(/Medium shot/);
      expect(out.prompt).toMatch(/\b8s, vertical 9:16\.$/);
      expect(out.negativePrompt).toBe(REEL_RECIPES.ootd_stop.negativePrompt);
      expect(out.marker).toEqual({
        id: "ootd_stop",
        hook_text: out.hookText,
        negative_prompt: REEL_RECIPES.ootd_stop.negativePrompt,
        target_duration_sec: 8,
      });
    }
  });

  it("grwm_loading compiles cleanly on grooming / standing / seated scenes", () => {
    for (const k of ["grooming", "mirror", "seated"]) {
      const out = compileRecipeReel(REEL_RECIPES.grwm_loading, { sceneBrief: SCENES[k].brief, sceneLocation: SCENES[k].location, dayNumber: 5 });
      expect(out.validation.errors, k).toEqual([]);
      expect(out.prompt).toMatch(/Close-medium/);
    }
  });

  it("refuses scenes the recipe cannot carry, with a Semantic-validation message the retry logic recognises", () => {
    expect(() => compileRecipeReel(REEL_RECIPES.ootd_stop, { sceneBrief: SCENES.seated.brief, sceneLocation: "office", dayNumber: 2 })).toThrow(
      /Semantic validation failed.*format_coherence/
    );
    expect(() => compileRecipeReel(REEL_RECIPES.grwm_loading, { sceneBrief: SCENES.locomotion.brief, sceneLocation: "street", dayNumber: 3 })).toThrow(
      /Semantic validation failed/
    );
  });

  it("requiredActionClasses agree with recipeSupportsActionClass", () => {
    for (const r of REEL_RECIPE_LIST) {
      for (const c of ACTION_CLASSES) expect(recipeSupportsActionClass(r, c)).toBe(r.requiredActionClasses.includes(c));
    }
  });

  it("never lets an LLM-looking or banned string into the prompt/hook path", () => {
    const out = compileRecipeReel(REEL_RECIPES.ootd_stop, { sceneBrief: SCENES.locomotion.brief, sceneLocation: "street", dayNumber: 6 });
    expect(REEL_RECIPES.ootd_stop.hookTextPool).toContain(out.hookText);
  });
});

describe("flags and marker", () => {
  it("reelRecipesEnabled: env true/false beats the character flag; default off", () => {
    expect(reelRecipesEnabled(false, {})).toBe(false);
    expect(reelRecipesEnabled(true, {})).toBe(true);
    expect(reelRecipesEnabled(false, { REEL_RECIPES_ENABLED: "true" } as never)).toBe(true);
    expect(reelRecipesEnabled(true, { REEL_RECIPES_ENABLED: "false" } as never)).toBe(false);
  });

  it("readReelRecipeMarker accepts a valid marker and rejects junk", () => {
    const m = { id: "ootd_stop", hook_text: "how’s the fit", negative_prompt: "no cuts", target_duration_sec: 8 };
    expect(readReelRecipeMarker({ reel_recipe: m })).toEqual(m);
    expect(readReelRecipeMarker(null)).toBeNull();
    expect(readReelRecipeMarker({})).toBeNull();
    expect(readReelRecipeMarker({ reel_recipe: { ...m, id: "pov" } })).toBeNull();
    expect(readReelRecipeMarker({ reel_recipe: { ...m, hook_text: "  " } })).toBeNull();
  });
});

describe("Phase 2 SQL migration", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261004_reel_recipes.sql", import.meta.url), "utf8");

  it("is idempotent (ON CONFLICT) and has no destructive statement outside comments", () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    const live = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(live).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/i);
    expect(sql).toMatch(/--\s*DELETE FROM chs_shot_archetypes WHERE id IN \('ootd_stop', 'grwm_loading'\)/);
  });

  it("inserts both recipe ids as motion family with guidance identical to the recipe", () => {
    for (const r of REEL_RECIPE_LIST) {
      const m = sql.match(new RegExp(`\\('${r.id}',\\s*'motion',\\s*'((?:[^']|'')*)'\\)`));
      expect(m, r.id).toBeTruthy();
      expect(m![1].replace(/''/g, "'")).toBe(r.archetypeGuidance);
    }
  });
});
