import { describe, it, expect } from "vitest";
import {
  TIER_WEIGHTS,
  MOMENT_FAMILIES,
  MAGNETISM_LEVELS,
  MAGNETISM_FANVUE_PROB,
  LIVED_MOMENTS_FANVUE_FALLBACK,
  livedMomentsFanvueProbability,
  pickMomentFamily,
  pickMagnetismLevel,
  tierGuidance,
  tierLabel,
  momentFamilyGuidance,
  magnetismGuidance,
} from "./storyTier";
import type { MomentFamily } from "@/types";

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
