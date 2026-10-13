import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLASSIC_RECIPE_IDS,
  MOMENT_RECIPE_IDS,
  REEL_RECIPES,
  ROTATION_PATTERN,
  compileRecipeReel,
  eligibleVariants,
  pickVariant,
  readReelRecipeMarker,
  recipeIdForDay,
  type ReelRecipeId,
} from "./reelRecipes";
import { pickReelFormat, pickReelFormatForScene } from "@/lib/reelFormats";
import { stripTiltPhrasing } from "@/lib/orientationGuard";
import { ACTION_CLASSES, resolveSceneSemantics } from "@/lib/sceneSemantics";
import type { SceneBriefJson } from "@/lib/sceneBrief";

function brief(spatial: string, wardrobe: string, props: string[] = []): SceneBriefJson {
  return {
    camera_language: "static 50mm",
    color_palette: ["warm cream"],
    visual_rules: [],
    location_constraints: [],
    spatial_setup: spatial,
    wardrobe_lock: wardrobe,
    allowed_props: props,
    lighting_state: "lamp light from the right",
    time_of_day: "evening",
    weather_implied: "clear",
  };
}

const SWEATER_MUG = brief(
  "She sits on the living room floor with her back against the cream sofa, a ceramic mug beside her.",
  "oversized cream knit sweater, thin gold chain at her collarbone",
  ["ceramic coffee mug"]
);
const PLAIN = brief("She stands on the terrace by the railing, city behind her.", "white slip dress, thin gold chain at her collarbone");
const COAT_SUN = brief(
  "She stands on the terrace by the railing, city behind her.",
  "camel wool coat over a black top, tortoiseshell sunglasses, thin gold chain at her collarbone"
);
const WALK = brief("She walks down a cobblestone street, old stone walls on both sides.", "black blazer, thin gold chain");
const ENV = {} as Record<string, string | undefined>;

describe("moment recipes — definitions", () => {
  it("are moment-kind, close-medium, 8s, with no-full-body negatives and no tilt language anywhere", () => {
    for (const id of MOMENT_RECIPE_IDS) {
      const r = REEL_RECIPES[id];
      expect(r.kind).toBe("moment");
      expect(r.framing).toBe("close_medium");
      expect(r.durationSec).toBe(8);
      expect(r.negativePrompt).toMatch(/no camera roll/);
      for (const v of r.variants!) {
        for (const t of [v.openingState, v.hookBeat, v.action, v.closingBeat]) expect(stripTiltPhrasing(t).removed, t).toEqual([]);
      }
      expect(r.negativePrompt).toMatch(/no full body/);
      expect(r.negativePrompt).toMatch(/no second person in frame/);
      // the last variant is the always-eligible default
      expect(r.variants!.at(-1)!.when).toBeUndefined();
    }
  });

  it("every variant names the moment inside the first second, an end pose, and no numeric timing", () => {
    for (const id of MOMENT_RECIPE_IDS) {
      for (const v of REEL_RECIPES[id].variants!) {
        expect(v.hookBeat, `${id}/${v.id}`).toMatch(/^Within the first second/);
        expect(v.closingBeat, `${id}/${v.id}`).toMatch(/\bends\b/);
        expect(`${v.openingState} ${v.hookBeat} ${v.action} ${v.closingBeat}`).not.toMatch(/\d/);
        expect(v.hookTextPool.length).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

describe("moment recipes — variants and compile", () => {
  it("the sweater + mug scene gets the mug reveal and the cup hand-off", () => {
    const sem = resolveSceneSemantics(SWEATER_MUG, { sceneLocation: "living room" });
    expect(pickVariant(REEL_RECIPES.reveal_object, sem.entityText, 7)?.id).toMatch(/^(mug|letter_sleeve)$/);
    const ids = new Set([0, 6, 12, 18].map((d) => pickVariant(REEL_RECIPES.reveal_object, sem.entityText, d)?.id));
    expect(ids).toEqual(new Set(["mug", "letter_sleeve"]));
    expect(pickVariant(REEL_RECIPES.playful_camera, sem.entityText, 0)?.id).toBe("hand_cup");
  });

  it("never offers prop variants the scene does not contain", () => {
    const sem = resolveSceneSemantics(PLAIN, { sceneLocation: "terrace" });
    expect(eligibleVariants(REEL_RECIPES.reveal_object, sem.entityText).map((v) => v.id)).toEqual(["flowers"]);
    expect(eligibleVariants(REEL_RECIPES.playful_camera, sem.entityText).map((v) => v.id)).toEqual(["cover_lens", "tap_lens"]);
    expect(eligibleVariants(REEL_RECIPES.outfit_reveal, sem.entityText).map((v) => v.id)).toEqual(["hair_up"]);
    const sem2 = resolveSceneSemantics(COAT_SUN, { sceneLocation: "terrace" });
    expect(eligibleVariants(REEL_RECIPES.outfit_reveal, sem2.entityText).map((v) => v.id)).toEqual(["sunglasses_on", "coat_off", "hair_up"]);
  });

  it("every recipe x eligible variant compiles with zero validator errors on fitting scenes", () => {
    const scenes = [
      { b: SWEATER_MUG, loc: "living room" },
      { b: PLAIN, loc: "terrace" },
      { b: COAT_SUN, loc: "terrace" },
    ];
    for (const id of MOMENT_RECIPE_IDS) {
      for (const s of scenes) {
        for (let d = 0; d < 24; d++) {
          const out = compileRecipeReel(REEL_RECIPES[id], { sceneBrief: s.b, sceneLocation: s.loc, dayNumber: d });
          expect(out.validation.errors, `${id} d${d}`).toEqual([]);
          expect(out.prompt).toMatch(/^Close-medium on her/);
          expect(out.prompt).toMatch(/\b8s, vertical 9:16\.$/);
          expect(out.variant!.hookTextPool).toContain(out.hookText);
          expect(out.marker.variant).toBe(out.variant!.id);
          expect(out.marker.negative_prompt).toBe(REEL_RECIPES[id].negativePrompt);
        }
      }
    }
  });

  it("surprise_reaction refuses a walking scene; outfit_reveal accepts it", () => {
    expect(() => compileRecipeReel(REEL_RECIPES.surprise_reaction, { sceneBrief: WALK, sceneLocation: "street", dayNumber: 1 })).toThrow(
      /Semantic validation failed.*format_coherence/
    );
    const out = compileRecipeReel(REEL_RECIPES.outfit_reveal, { sceneBrief: WALK, sceneLocation: "street", dayNumber: 1 });
    expect(out.validation.errors).toEqual([]);
    expect(out.variant!.id).toBe("coat_off");
  });

  it("marker round-trips the variant", () => {
    const m = { id: "reveal_object", hook_text: "wait for it", negative_prompt: "x", target_duration_sec: 8, variant: "mug" };
    expect(readReelRecipeMarker({ reel_recipe: m })).toEqual(m);
  });
});

describe("rotation", () => {
  it("pattern is 7 moment / 3 classic with no adjacent classic days, incl. the wrap", () => {
    expect(ROTATION_PATTERN.filter((x) => x === "M")).toHaveLength(7);
    for (let i = 0; i < ROTATION_PATTERN.length; i++) {
      const next = ROTATION_PATTERN[(i + 1) % ROTATION_PATTERN.length];
      expect(ROTATION_PATTERN[i] === "C" && next === "C").toBe(false);
    }
  });

  it("over 1000 days: 70% moment, every recipe used, never the same recipe two days running", () => {
    const seen: Record<string, number> = {};
    let prev: ReelRecipeId | null = null;
    let moments = 0;
    for (let d = -20; d < 980; d++) {
      const id = recipeIdForDay(d, ENV);
      seen[id] = (seen[id] ?? 0) + 1;
      if ((MOMENT_RECIPE_IDS as readonly string[]).includes(id)) moments++;
      expect(id, `day ${d}`).not.toBe(prev);
      prev = id;
    }
    expect(moments / 1000).toBeCloseTo(0.7, 5);
    for (const id of [...MOMENT_RECIPE_IDS, ...CLASSIC_RECIPE_IDS]) expect(seen[id]).toBeGreaterThan(100);
  });

  it("kill switch REEL_MOMENT_RECIPES=false -> classic alternation", () => {
    const env = { REEL_MOMENT_RECIPES: "false" };
    expect([0, 1, 2, 3].map((d) => recipeIdForDay(d, env))).toEqual(["ootd_stop", "grwm_loading", "ootd_stop", "grwm_loading"]);
    expect(pickReelFormat(0, env).id).toBe("ootd_stop");
  });

  it("pickReelFormat follows recipeIdForDay; scene fallback never returns a recipe that cannot run", () => {
    for (let d = 0; d < 60; d++) expect(pickReelFormat(d, ENV).id).toBe(recipeIdForDay(d, ENV));
    for (const cls of ACTION_CLASSES) {
      for (let d = 0; d < 40; d++) {
        const f = pickReelFormatForScene(d, cls, ENV);
        if (!f) continue;
        expect(REEL_RECIPES[f.id as ReelRecipeId].requiredActionClasses).toContain(cls);
      }
    }
    // a walking day whose rotation says surprise_reaction falls back to a recipe that can walk
    const d = [...Array(40).keys()].find((x) => recipeIdForDay(x, ENV) === "surprise_reaction")!;
    expect(["outfit_reveal", "ootd_stop"]).toContain(pickReelFormatForScene(d, "locomotion", ENV)!.id);
  });
});

describe("Phase 8 SQL migration", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261013_moment_reel_recipes.sql", import.meta.url), "utf8");
  it("is idempotent, non-destructive, with guidance identical to the recipes and a commented rollback", () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    const live = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(live).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/i);
    expect(sql).toMatch(/--\s*DELETE FROM chs_shot_archetypes WHERE id IN \('reveal_object', 'outfit_reveal', 'surprise_reaction', 'playful_camera'\)/);
    for (const id of MOMENT_RECIPE_IDS) {
      const m = sql.match(new RegExp(`\\('${id}',\\s*'motion',\\s*'((?:[^']|'')*)'\\)`));
      expect(m, id).toBeTruthy();
      expect(m![1].replace(/''/g, "'")).toBe(REEL_RECIPES[id].archetypeGuidance);
    }
  });
});
