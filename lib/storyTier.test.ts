import { describe, it, expect } from "vitest";
import {
  TIER_WEIGHTS,
  TIER_VALIDATED_HIGH_PERFORMING,
  MOMENT_FAMILIES,
  MAGNETISM_LEVELS,
  MAGNETISM_FANVUE_PROB,
  LIVED_MOMENTS_FANVUE_FALLBACK,
  livedMomentsFanvueProbability,
  pickMomentFamily,
  pickMagnetismLevel,
  tierGuidance,
  tierLabel,
  locationSpecFor,
  MOMENT_FAMILY_LOCATIONS,
  momentFamilyGuidance,
  magnetismGuidance,
} from "./storyTier";
import type { MomentFamily, StoryTier } from "@/types";

const ACTIVE_TIERS: StoryTier[] = ["lived_moments", "everyday_life", "wellness_fitness", "intimate_aesthetic", "luxe_car"];

describe("tier rotation weights", () => {
  it("includes lived_moments in the active rotation", () => {
    expect(Object.keys(TIER_WEIGHTS)).toContain("lived_moments");
  });

  it("active weights sum to 1.0 (100%)", () => {
    const sum = Object.values(TIER_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("does NOT put retired/historical tiers back in the rotation", () => {
    for (const t of ["lifestyle_travel", "grounded_routine", "entropy"]) {
      expect(Object.keys(TIER_WEIGHTS)).not.toContain(t);
    }
  });

  it("matches the agreed lived_moments-led mix", () => {
    expect(TIER_WEIGHTS.lived_moments).toBeCloseTo(0.30, 6);
    expect(TIER_WEIGHTS.everyday_life).toBeCloseTo(0.20, 6);
    expect(TIER_WEIGHTS.intimate_aesthetic).toBeCloseTo(0.20, 6);
    expect(TIER_WEIGHTS.wellness_fitness).toBeCloseTo(0.15, 6);
    expect(TIER_WEIGHTS.luxe_car).toBeCloseTo(0.15, 6);
  });
});

describe("pickMomentFamily", () => {
  it("returns the lowest-weight family at rng→1 and the first at rng→0", () => {
    // rng near 0 lands in the first cumulative bucket (home_private, weight .30)
    expect(pickMomentFamily(null, () => 0)).toBe("home_private");
    // rng near 1 lands in the last bucket (city_transit, weight .10)
    expect(pickMomentFamily(null, () => 0.999999)).toBe("city_transit");
  });

  it("never repeats the immediately-previous family when an alternative exists", () => {
    for (const last of MOMENT_FAMILIES) {
      for (let i = 0; i <= 20; i++) {
        const got = pickMomentFamily(last, () => i / 20);
        expect(got).not.toBe(last);
      }
    }
  });

  it("ignores a null/undefined previous family (fresh weighted pick)", () => {
    expect(pickMomentFamily(null, () => 0)).toBe("home_private");
    expect(pickMomentFamily(undefined, () => 0)).toBe("home_private");
  });

  it("is deterministic for a fixed rng", () => {
    const rng = () => 0.5;
    expect(pickMomentFamily(null, rng)).toBe(pickMomentFamily(null, rng));
  });

  it("can reach every family across the rng range", () => {
    const seen = new Set<MomentFamily>();
    for (let i = 0; i < 200; i++) seen.add(pickMomentFamily(null, () => i / 200));
    expect(seen.size).toBe(MOMENT_FAMILIES.length);
  });
});

describe("pickMagnetismLevel", () => {
  it("is soft at rng→0 and sensual at rng→1 (mostly-soft mix)", () => {
    expect(pickMagnetismLevel(() => 0)).toBe("soft");
    expect(pickMagnetismLevel(() => 0.999999)).toBe("sensual");
  });

  it("is deterministic for a fixed rng", () => {
    expect(pickMagnetismLevel(() => 0.5)).toBe(pickMagnetismLevel(() => 0.5));
  });

  it("covers all four levels across the rng range", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => pickMagnetismLevel(() => i / 200)));
    expect(seen.size).toBe(MAGNETISM_LEVELS.length);
  });
});

describe("magnetism → fanvue probability", () => {
  it("uses the approved raised values, rising with intensity", () => {
    expect(MAGNETISM_FANVUE_PROB.soft).toBe(0.30);
    expect(MAGNETISM_FANVUE_PROB.playful).toBe(0.50);
    expect(MAGNETISM_FANVUE_PROB.flirty).toBe(0.75);
    expect(MAGNETISM_FANVUE_PROB.sensual).toBe(0.95);
    expect(MAGNETISM_FANVUE_PROB.soft).toBeLessThan(MAGNETISM_FANVUE_PROB.playful);
    expect(MAGNETISM_FANVUE_PROB.playful).toBeLessThan(MAGNETISM_FANVUE_PROB.flirty);
    expect(MAGNETISM_FANVUE_PROB.flirty).toBeLessThan(MAGNETISM_FANVUE_PROB.sensual);
  });

  it("weighted by the 40/35/20/5 mix averages ≈ 0.4925", () => {
    const mix = { soft: 0.4, playful: 0.35, flirty: 0.2, sensual: 0.05 } as const;
    const avg = MAGNETISM_LEVELS.reduce((s, l) => s + mix[l] * MAGNETISM_FANVUE_PROB[l], 0);
    expect(avg).toBeCloseTo(0.4925, 6);
  });

  it("resolves each level via the helper, and null → 0.50 fallback", () => {
    expect(livedMomentsFanvueProbability("soft")).toBe(0.30);
    expect(livedMomentsFanvueProbability("playful")).toBe(0.50);
    expect(livedMomentsFanvueProbability("flirty")).toBe(0.75);
    expect(livedMomentsFanvueProbability("sensual")).toBe(0.95);
    expect(livedMomentsFanvueProbability(null)).toBe(0.50);
    expect(livedMomentsFanvueProbability(undefined)).toBe(0.50);
    expect(LIVED_MOMENTS_FANVUE_FALLBACK).toBe(0.50);
  });
});

describe("guidance + label", () => {
  it("labels lived_moments as 'Magnetic Everyday Life'", () => {
    expect(tierLabel("lived_moments")).toBe("Magnetic Everyday Life");
    expect(tierLabel("everyday_life")).toBe("everyday life");
    expect(tierLabel(null)).toBe("");
  });

  it("lived_moments guidance injects the chosen family + magnetism", () => {
    const g = tierGuidance("lived_moments", { family: "vacation_beach_water", magnetism: "flirty" });
    expect(g).toContain("lived_moments");
    expect(g).toContain("vacation_beach_water");
    expect(g).toContain("MAGNETISM — flirty");
  });

  it("every family and magnetism level produces non-empty guidance", () => {
    for (const f of MOMENT_FAMILIES) expect(momentFamilyGuidance(f).length).toBeGreaterThan(20);
    for (const l of MAGNETISM_LEVELS) expect(magnetismGuidance(l).length).toBeGreaterThan(20);
  });
});

// Guards the location↔world binding. Production 2026-08-01: a vacation_beach_water day
// resolved to "gym — free weights section" because the generic location spec offered
// "gym free-weights area" as an example and nothing tied the location to the day's world.
// The styling deck then followed the family and locked beach club attire onto a gym floor.
describe("locationSpecFor", () => {
  it("binds a lived_moments location to the day's world and bans the gym example", () => {
    const spec = locationSpecFor("lived_moments", "vacation_beach_water");
    expect(spec).toContain("HARD CONSTRAINT");
    expect(spec).toContain("vacation_beach_water");
    expect(spec).toMatch(/beach, towel on the sand/);
    // the example that caused the incident must not be offered on a lived_moments day
    expect(spec).not.toMatch(/gym free-weights area/);
    expect(spec).toMatch(/no gym/i);
  });

  it("offers each family its own locations", () => {
    for (const family of MOMENT_FAMILIES) {
      const spec = locationSpecFor("lived_moments", family);
      expect(spec).toContain(family);
      expect(spec).toContain(MOMENT_FAMILY_LOCATIONS[family]);
      expect(spec).not.toMatch(/gym free-weights area/);
    }
  });

  it("leaves other tiers on the original tier-example spec", () => {
    // wellness legitimately belongs in a gym — that menu must survive
    expect(locationSpecFor("wellness_fitness", null)).toMatch(/gym free-weights area/);
    expect(locationSpecFor("intimate_aesthetic", null)).toMatch(/her bedroom, unmade bed/);
    expect(locationSpecFor("wellness_fitness", null)).not.toContain("HARD CONSTRAINT");
  });

  it("falls back to the generic spec when a lived_moments day has no family", () => {
    expect(locationSpecFor("lived_moments", null)).not.toContain("HARD CONSTRAINT");
  });
});

// Locks the "warmth esprit" doctrine change. Baseline before it: 75% of lived_moments
// briefs banned direct eye contact, 50% carried sterile wording, 100% pulled cold palette
// tokens — for the tier that is meant to read warm and alive.
describe("warmth esprit doctrine", () => {
  const STERILE = /\b(clean|minimalist|sterile|uncluttered|pristine)\b/i;

  it("lived_moments VISUAL asks for warmth, light and joy — not a clean/catalogue look", () => {
    const g = tierGuidance("lived_moments");
    const visual = g.split("VISUAL:")[1] ?? "";
    expect(visual).toMatch(/warm/i);
    expect(visual).toMatch(/smile|laughter|joy/i);
    expect(visual).toMatch(/eye contact/i);
    expect(visual).not.toMatch(STERILE);
    // the framing guards that were correct stay in place
    expect(visual).toMatch(/no empty environments/i);
    expect(visual).toMatch(/no catalogue framing/i);
  });

  it("does not push lived_moments away from the lens by default", () => {
    const g = tierGuidance("lived_moments");
    // Production 2026-08-01: alone at home in every frame, eyes off past the camera.
    // The old MANDATORY line ("her body and attention do NOT always face the camera")
    // read as a per-frame instruction instead of batch-level variety.
    expect(g).not.toMatch(/attention do NOT always face the camera/i);
    expect(g).toMatch(/Vary her attention ACROSS the batch/i);
    expect(g).toMatch(/looking straight into the camera/i);
    expect(g).toMatch(/photo she took of herself/i);
    expect(g).toMatch(/Never leave her staring blankly past the camera/i);
  });

  it("keeps expressed warmth contained, not a wide open-mouth laugh", () => {
    const g = tierGuidance("lived_moments");
    // Production 2026-08-02: "let joy show" with no ceiling on intensity produced a
    // wide-open-mouth performative laugh on a quiet spontaneous-pet-moment day.
    expect(g).not.toMatch(/Let joy show — a smile, laughter, easy eye contact, a spontaneous gesture or movement — whenever the moment allows it\./);
    expect(g).toMatch(/CONTAINED and photographable/i);
    expect(g).toMatch(/never a wide open-mouth laugh/i);
    expect(g).toMatch(/never mugging or gurning/i);
    expect(g).toMatch(/not performing delight at the lens/i);
  });

  it("everyday_life offers warm light as an equal option, not only overcast", () => {
    const g = tierGuidance("everyday_life");
    expect(g).toMatch(/warm morning kitchen light/i);
    expect(g).toMatch(/golden-hour/i);
    // overcast survives as one option among several
    expect(g).toMatch(/overcast/i);
  });

  it("leaves the measured conversion tier untouched: intimate_aesthetic stays cool and directional", () => {
    const g = tierGuidance("intimate_aesthetic");
    expect(g).toMatch(/the conversion tier/i);
    expect(g).toMatch(/soft directional side light/i);
    expect(g).toMatch(/suggestive yes — explicit NO/i);
    // no warmth/joy language leaked in from the lived_moments rewrite
    expect(g).not.toMatch(/let joy show/i);
    expect(g).not.toMatch(/laughter/i);
  });

  it("luxe_car and wellness_fitness doctrine is unchanged by the warmth edit", () => {
    expect(tierGuidance("luxe_car")).toMatch(/HER POSE IS THE HOOK/);
    expect(tierGuidance("luxe_car")).not.toMatch(/let joy show/i);
    expect(tierGuidance("wellness_fitness")).toMatch(/strongest reach driver/i);
    expect(tierGuidance("wellness_fitness")).not.toMatch(/let joy show/i);
  });
});

// open_life_generation_v1 — flag-off must reproduce the EXACT pre-feature baseline for every
// active tier (captured here as fixtures), and flag-on must restructure intimate_aesthetic to
// be situation-first rather than bedroom/bathroom-first, while never touching TIER_WEIGHTS or
// the SAFE RULES paragraph.
describe("open_life_generation_v1 — situationMode", () => {
  it("tierGuidance(tier) with no extras is byte-identical to the pre-feature baseline for every active tier", () => {
    for (const tier of ACTIVE_TIERS) {
      const withoutExtras = tierGuidance(tier);
      const withUndefinedSituationMode = tierGuidance(tier, { situationMode: undefined });
      const withFalseSituationMode = tierGuidance(tier, { situationMode: false });
      expect(withUndefinedSituationMode).toBe(withoutExtras);
      expect(withFalseSituationMode).toBe(withoutExtras);
    }
  });

  it("lived_moments/everyday_life/wellness_fitness/luxe_car: situationMode only APPENDS, never removes the original text", () => {
    for (const tier of ["lived_moments", "everyday_life", "wellness_fitness", "luxe_car"] as StoryTier[]) {
      const original = tierGuidance(tier);
      const extended = tierGuidance(tier, { situationMode: true });
      expect(extended.startsWith(original)).toBe(true);
      expect(extended.length).toBeGreaterThan(original.length);
    }
  });

  it("intimate_aesthetic situationMode is SITUATION FIRST and does not open with 'her bedroom or bathroom'", () => {
    const g = tierGuidance("intimate_aesthetic", { situationMode: true });
    expect(g).toMatch(/SITUATION FIRST/);
    expect(g).not.toMatch(/Scene must be:\n- interior: her bedroom or bathroom/);
    const firstSceneSettingLine = g.split("\n").find((l) => l.trim().length > 0 && !l.startsWith("TIER:"));
    expect(firstSceneSettingLine ?? "").not.toMatch(/her bedroom or bathroom/i);
  });

  it("intimate_aesthetic situationMode preserves the SAFE RULES paragraph verbatim", () => {
    const flagOff = tierGuidance("intimate_aesthetic");
    const flagOn = tierGuidance("intimate_aesthetic", { situationMode: true });
    const safeRulesLine = "SAFE RULES (account survival): suggestive yes — explicit NO. No nudity, no exposed nipples/genitals, no sexual acts, no pornographic framing. Lingerie/swimwear/implied-topless-from-behind are the ceiling. Anything past that gets the account banned and is generated nowhere in this pipeline.";
    expect(flagOff).toContain(safeRulesLine);
    expect(flagOn).toContain(safeRulesLine);
  });

  it("appends the precomputed sexualEnergyGuidance verbatim when provided", () => {
    const g = tierGuidance("intimate_aesthetic", { situationMode: true, sexualEnergyGuidance: "MARKER_TEXT_XYZ" });
    expect(g).toContain("MARKER_TEXT_XYZ");
  });

  it("every active tier's examples are framed as inspiration, not a whitelist, under situationMode", () => {
    for (const tier of ACTIVE_TIERS) {
      const g = tierGuidance(tier, { situationMode: true });
      expect(g).toMatch(/inspiration/i);
      expect(g).toMatch(/never a whitelist|not a whitelist/i);
    }
  });

  it("TIER_VALIDATED_HIGH_PERFORMING marks intimate_aesthetic true, and does not mark other active tiers", () => {
    expect(TIER_VALIDATED_HIGH_PERFORMING.intimate_aesthetic).toBe(true);
    for (const tier of ["lived_moments", "everyday_life", "wellness_fitness", "luxe_car"] as StoryTier[]) {
      expect(TIER_VALIDATED_HIGH_PERFORMING[tier]).toBeUndefined();
    }
  });

  it("TIER_WEIGHTS is unchanged by this feature (re-confirms the flag-off weight guarantee)", () => {
    expect(TIER_WEIGHTS.lived_moments).toBeCloseTo(0.30, 6);
    expect(TIER_WEIGHTS.everyday_life).toBeCloseTo(0.20, 6);
    expect(TIER_WEIGHTS.intimate_aesthetic).toBeCloseTo(0.20, 6);
    expect(TIER_WEIGHTS.wellness_fitness).toBeCloseTo(0.15, 6);
    expect(TIER_WEIGHTS.luxe_car).toBeCloseTo(0.15, 6);
  });
});

// ── tier_rotation_v1 (phase 1, 2026-10) ───────────────────────────────────────
import { pickTierRotation, TIER_ROTATION_LOOKBACK_DAYS } from "./storyTier";
import type { StoryTier as RotStoryTier } from "./storyTier";
import { isCiBiasInert } from "./ciScoringFrozen";

describe("pickTierRotation (LRU)", () => {
  const ACTIVE = Object.keys(TIER_WEIGHTS) as RotStoryTier[];

  it("lookback is 10 days", () => {
    expect(TIER_ROTATION_LOOKBACK_DAYS).toBe(10);
  });

  it("with no history returns an active tier", () => {
    expect(ACTIVE).toContain(pickTierRotation([], () => 0));
  });

  it("prefers a never-used tier over any used one", () => {
    const recent: RotStoryTier[] = ["lived_moments", "everyday_life", "intimate_aesthetic", "wellness_fitness"];
    expect(pickTierRotation(recent, () => 0)).toBe("luxe_car");
    expect(pickTierRotation(recent, () => 0.99)).toBe("luxe_car");
  });

  it("when all tiers were used, picks the least recently used (largest index)", () => {
    const recent: RotStoryTier[] = ["luxe_car", "wellness_fitness", "intimate_aesthetic", "everyday_life", "lived_moments"];
    expect(pickTierRotation(recent, () => 0)).toBe("lived_moments");
  });

  it("never repeats the previous day's tier", () => {
    for (const last of ACTIVE) {
      for (let i = 0; i < 20; i++) {
        expect(pickTierRotation([last], () => i / 20)).not.toBe(last);
      }
    }
  });

  it("simulated 500 days: exactly flat (each tier 20%) and no immediate repeats", () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const history: RotStoryTier[] = [];
    const counts: Record<string, number> = {};
    for (let d = 0; d < 500; d++) {
      const t = pickTierRotation(history.slice(0, TIER_ROTATION_LOOKBACK_DAYS), rng);
      if (history[0]) expect(t).not.toBe(history[0]);
      history.unshift(t);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    for (const t of ACTIVE) expect(counts[t]).toBe(100);
  });

  it("ignores TIER_WEIGHTS: luxe_car (15%) and lived_moments (30%) come up equally often", () => {
    // covered by the flat-count test above; this pins that the weights themselves are untouched
    expect(TIER_WEIGHTS.lived_moments).toBeCloseTo(0.30, 6);
    expect(TIER_WEIGHTS.luxe_car).toBeCloseTo(0.15, 6);
  });
});

describe("pickMomentFamily flat (tier_rotation_v1)", () => {
  it("flat=true draws uniformly (each non-excluded family ≈ 25%) and still avoids `last`", () => {
    const counts: Record<string, number> = {};
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const f = pickMomentFamily("home_private", () => i / N, undefined, true);
      expect(f).not.toBe("home_private");
      counts[f] = (counts[f] ?? 0) + 1;
    }
    for (const f of ["friends_fun", "vacation_beach_water", "pets_spontaneous", "city_transit"]) {
      expect(counts[f] / N).toBeGreaterThan(0.24);
      expect(counts[f] / N).toBeLessThan(0.26);
    }
  });

  it("flat=true ignores any bias", () => {
    const withBias = pickMomentFamily(null, () => 0.1, { city_transit: 0.1 }, true);
    const without = pickMomentFamily(null, () => 0.1, undefined, true);
    expect(withBias).toBe(without);
  });

  it("flat=false (default) is unchanged: first-bucket home_private at rng 0", () => {
    expect(pickMomentFamily(null, () => 0)).toBe("home_private");
  });
});

describe("isCiBiasInert", () => {
  const save = { a: process.env.CI_BIAS_INERT, b: process.env.CI_SCORING_FROZEN };
  const restore = () => {
    if (save.a === undefined) delete process.env.CI_BIAS_INERT; else process.env.CI_BIAS_INERT = save.a;
    if (save.b === undefined) delete process.env.CI_SCORING_FROZEN; else process.env.CI_SCORING_FROZEN = save.b;
  };

  it("false by default", () => {
    delete process.env.CI_BIAS_INERT; delete process.env.CI_SCORING_FROZEN;
    expect(isCiBiasInert()).toBe(false);
    restore();
  });
  it("true via CI_BIAS_INERT", () => {
    delete process.env.CI_SCORING_FROZEN; process.env.CI_BIAS_INERT = "TRUE";
    expect(isCiBiasInert()).toBe(true);
    restore();
  });
  it("true via the existing CI_SCORING_FROZEN", () => {
    delete process.env.CI_BIAS_INERT; process.env.CI_SCORING_FROZEN = "true";
    expect(isCiBiasInert()).toBe(true);
    restore();
  });
});
