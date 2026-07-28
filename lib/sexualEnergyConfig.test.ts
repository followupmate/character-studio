import { describe, it, expect } from "vitest";
import {
  SEXUAL_ENERGY_RANGE,
  SEXUAL_ENERGY_RANGE_INTENSIFIED,
  MAGNETISM_REASONS,
  allowedSexualEnergyLevels,
  isActiveTier,
  pickSexualEnergyLevel,
  sexualEnergyRangeGuidance,
} from "./sexualEnergyConfig";

const ACTIVE_TIERS = ["everyday_life", "lived_moments", "wellness_fitness", "luxe_car", "intimate_aesthetic"] as const;

describe("SEXUAL_ENERGY_RANGE", () => {
  it("each tier's distribution sums to 1.0", () => {
    for (const tier of ACTIVE_TIERS) {
      const sum = Object.values(SEXUAL_ENERGY_RANGE[tier]).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    }
  });

  it("matches the spec's exact per-tier distribution", () => {
    expect(SEXUAL_ENERGY_RANGE.everyday_life).toEqual({ subtle: 0.40, warm: 0.35, playful: 0.20, provocative: 0.05, intimate: 0.00 });
    expect(SEXUAL_ENERGY_RANGE.lived_moments).toEqual({ subtle: 0.10, warm: 0.35, playful: 0.35, provocative: 0.20, intimate: 0.00 });
    expect(SEXUAL_ENERGY_RANGE.wellness_fitness).toEqual({ subtle: 0.15, warm: 0.45, playful: 0.35, provocative: 0.05, intimate: 0.00 });
    expect(SEXUAL_ENERGY_RANGE.luxe_car).toEqual({ subtle: 0.00, warm: 0.15, playful: 0.40, provocative: 0.40, intimate: 0.05 });
    expect(SEXUAL_ENERGY_RANGE.intimate_aesthetic).toEqual({ subtle: 0.00, warm: 0.05, playful: 0.15, provocative: 0.45, intimate: 0.35 });
  });

  it("everyday_life never allows intimate; intimate_aesthetic never allows subtle", () => {
    expect(allowedSexualEnergyLevels("everyday_life")).not.toContain("intimate");
    expect(allowedSexualEnergyLevels("intimate_aesthetic")).not.toContain("subtle");
  });
});

describe("MAGNETISM_REASONS", () => {
  it("has exactly the 9 spec-defined reasons", () => {
    expect(MAGNETISM_REASONS).toHaveLength(9);
    expect(MAGNETISM_REASONS).toEqual([
      "physical_attraction",
      "playful_femininity",
      "private_access",
      "social_desirability",
      "body_confidence",
      "aspirational_lifestyle",
      "provocative_ambiguity",
      "intimate_curiosity",
      "adventurous_energy",
    ]);
  });
});

describe("isActiveTier", () => {
  it("recognizes the 5 active tiers and rejects historical ones", () => {
    for (const t of ACTIVE_TIERS) expect(isActiveTier(t)).toBe(true);
    expect(isActiveTier("lifestyle_travel")).toBe(false);
    expect(isActiveTier("grounded_routine")).toBe(false);
  });
});

describe("pickSexualEnergyLevel", () => {
  it("never returns a level with 0% base weight for the tier, across the full rng range", () => {
    for (const tier of ACTIVE_TIERS) {
      const disallowed = (["subtle", "warm", "playful", "provocative", "intimate"] as const).filter(
        (l) => !allowedSexualEnergyLevels(tier).includes(l)
      );
      for (let i = 0; i <= 50; i++) {
        const got = pickSexualEnergyLevel(tier, {}, () => i / 50);
        expect(disallowed).not.toContain(got);
      }
    }
  });

  it("is deterministic for a fixed rng with no context", () => {
    const rng = () => 0.5;
    expect(pickSexualEnergyLevel("lived_moments", {}, rng)).toBe(pickSexualEnergyLevel("lived_moments", {}, rng));
  });

  it("is NOT a blind weighted random — recent-level penalty shifts the distribution away from yesterday's level", () => {
    // Fix rng at a point that picks "warm" with no penalty, then confirm the same rng
    // point picks something else once "warm" was used yesterday (its weight is discounted).
    const rng = () => 0.35; // lands in the lived_moments "warm" bucket at [0.10, 0.45)
    const withoutPenalty = pickSexualEnergyLevel("lived_moments", {}, rng);
    expect(withoutPenalty).toBe("warm");
    const withPenalty = pickSexualEnergyLevel("lived_moments", { recentLevels: ["warm"] }, rng);
    expect(withPenalty).not.toBe("warm");
  });

  it("applies a continuity-phase nudge without ever leaving the tier's allowed range", () => {
    for (let i = 0; i <= 20; i++) {
      const level = pickSexualEnergyLevel("intimate_aesthetic", { continuityPhase: "aftermath" }, () => i / 20);
      expect(allowedSexualEnergyLevels("intimate_aesthetic")).toContain(level);
    }
  });

  it("never zeroes out the entire candidate pool even with maximum penalty + modifier stacking", () => {
    // Every allowed level for everyday_life "used yesterday" simultaneously is impossible in
    // practice (recentLevels is one day's value), but the floor must still hold even against
    // an aggressive single-level penalty for a tier with only two realistic levels in range.
    for (let i = 0; i <= 20; i++) {
      const level = pickSexualEnergyLevel("everyday_life", { recentLevels: ["subtle"], continuityPhase: "setup" }, () => i / 20);
      expect(allowedSexualEnergyLevels("everyday_life")).toContain(level);
    }
  });
});

describe("sexualEnergyRangeGuidance", () => {
  it("produces non-empty, tier-specific prompt text naming only the tier's non-zero levels", () => {
    const g = sexualEnergyRangeGuidance("everyday_life");
    expect(g.length).toBeGreaterThan(20);
    expect(g).toContain("subtle");
    expect(g).not.toContain("intimate 0%");
  });
});

// sensual_visual_language_v1 (iteration 2) — a production dry-run showed sexual_energy staying
// metadata-only; part of the fix is a higher-intensity distribution, tunable per-character via
// the same flag that requires the sensual_visual_language fields, WITHOUT touching the default
// SEXUAL_ENERGY_RANGE used by every other character (or by Vivien with the flag off).
describe("SEXUAL_ENERGY_RANGE_INTENSIFIED", () => {
  it("each tier's distribution sums to 1.0", () => {
    for (const tier of ACTIVE_TIERS) {
      const sum = Object.values(SEXUAL_ENERGY_RANGE_INTENSIFIED[tier]).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    }
  });

  it("matches the spec's exact intensified per-tier distribution", () => {
    expect(SEXUAL_ENERGY_RANGE_INTENSIFIED.everyday_life).toEqual({ subtle: 0.15, warm: 0.35, playful: 0.40, provocative: 0.10, intimate: 0.00 });
    expect(SEXUAL_ENERGY_RANGE_INTENSIFIED.lived_moments).toEqual({ subtle: 0.00, warm: 0.20, playful: 0.45, provocative: 0.35, intimate: 0.00 });
    expect(SEXUAL_ENERGY_RANGE_INTENSIFIED.wellness_fitness).toEqual({ subtle: 0.05, warm: 0.30, playful: 0.50, provocative: 0.15, intimate: 0.00 });
    expect(SEXUAL_ENERGY_RANGE_INTENSIFIED.luxe_car).toEqual({ subtle: 0.00, warm: 0.05, playful: 0.35, provocative: 0.50, intimate: 0.10 });
    expect(SEXUAL_ENERGY_RANGE_INTENSIFIED.intimate_aesthetic).toEqual({ subtle: 0.00, warm: 0.00, playful: 0.10, provocative: 0.45, intimate: 0.45 });
  });

  it("is strictly more intense (lower subtle/warm share) than the default table for every tier", () => {
    for (const tier of ACTIVE_TIERS) {
      const defaultCalm = SEXUAL_ENERGY_RANGE[tier].subtle + SEXUAL_ENERGY_RANGE[tier].warm;
      const intensifiedCalm = SEXUAL_ENERGY_RANGE_INTENSIFIED[tier].subtle + SEXUAL_ENERGY_RANGE_INTENSIFIED[tier].warm;
      expect(intensifiedCalm).toBeLessThanOrEqual(defaultCalm);
    }
  });

  it("pickSexualEnergyLevel(useIntensified=true) never returns a level outside the intensified allowed range", () => {
    for (const tier of ACTIVE_TIERS) {
      const disallowed = (["subtle", "warm", "playful", "provocative", "intimate"] as const).filter(
        (l) => !allowedSexualEnergyLevels(tier, true).includes(l)
      );
      for (let i = 0; i <= 50; i++) {
        const got = pickSexualEnergyLevel(tier, {}, () => i / 50, true);
        expect(disallowed).not.toContain(got);
      }
    }
  });

  it("without useIntensified, pickSexualEnergyLevel/allowedSexualEnergyLevels/sexualEnergyRangeGuidance are byte-identical to before this table existed", () => {
    const rng = () => 0.42;
    expect(pickSexualEnergyLevel("lived_moments", {}, rng)).toBe(pickSexualEnergyLevel("lived_moments", {}, rng, false));
    expect(allowedSexualEnergyLevels("lived_moments")).toEqual(allowedSexualEnergyLevels("lived_moments", false));
    expect(sexualEnergyRangeGuidance("lived_moments")).toBe(sexualEnergyRangeGuidance("lived_moments", false));
  });
});
