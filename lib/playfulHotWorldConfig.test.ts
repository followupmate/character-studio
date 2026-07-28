import { describe, it, expect } from "vitest";
import {
  MOOD_TEMPERATURE_RANGE,
  VITALITY_LEVEL_RANGE,
  SOCIAL_PULSE_RANGE,
  SEASONALITY_RANGE,
  COLOR_ENERGY_RANGE,
  FUN_FACTOR_RANGE,
  isActivePlayfulTier,
  pickPlayfulHotWorldProfile,
  playfulHotWorldGuidance,
  PlayfulHotWorldSnapshot,
} from "./playfulHotWorldConfig";

const ACTIVE_TIERS = ["lived_moments", "everyday_life", "wellness_fitness", "intimate_aesthetic", "luxe_car"] as const;

describe("weight tables sum to 1.0 per tier", () => {
  const tables = {
    MOOD_TEMPERATURE_RANGE,
    VITALITY_LEVEL_RANGE,
    SOCIAL_PULSE_RANGE,
    SEASONALITY_RANGE,
    COLOR_ENERGY_RANGE,
    FUN_FACTOR_RANGE,
  };
  for (const [tableName, table] of Object.entries(tables)) {
    for (const tier of ACTIVE_TIERS) {
      it(`${tableName}[${tier}] sums to 1.0`, () => {
        const sum = Object.values(table[tier]).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      });
    }
  }
});

describe("isActivePlayfulTier", () => {
  it("recognizes all 5 active tiers", () => {
    for (const tier of ACTIVE_TIERS) expect(isActivePlayfulTier(tier)).toBe(true);
  });
  it("rejects a non-active tier", () => {
    expect(isActivePlayfulTier("lifestyle_travel")).toBe(false);
    expect(isActivePlayfulTier("something_unknown")).toBe(false);
  });
});

describe("pickPlayfulHotWorldProfile", () => {
  it("is deterministic for a fixed rng", () => {
    const rng = () => 0.5;
    const a = pickPlayfulHotWorldProfile("lived_moments", {}, rng);
    const b = pickPlayfulHotWorldProfile("lived_moments", {}, rng);
    expect(a).toEqual(b);
  });

  it("always returns one of the 6 fields' legal values", () => {
    const profile = pickPlayfulHotWorldProfile("lived_moments", {}, () => 0.3);
    expect(["soft", "warm", "hot"]).toContain(profile.mood_temperature);
    expect(["calm", "alive", "playful", "electric"]).toContain(profile.vitality_level);
    expect(["private", "suggested_social", "social", "party_adjacent"]).toContain(profile.social_pulse);
    expect(["neutral", "summer", "high_summer"]).toContain(profile.seasonality);
    expect(["muted", "fresh", "vivid"]).toContain(profile.color_energy);
    expect(["low", "medium", "high"]).toContain(profile.fun_factor);
  });

  it("works with no recentWindow provided (empty history)", () => {
    expect(() => pickPlayfulHotWorldProfile("everyday_life")).not.toThrow();
  });

  // Pacing boost: a value already at/above its expected pace should never be MORE likely than a
  // value that's behind pace, when both start from a comparable base weight. We test this
  // indirectly by checking that a heavily under-quota value's adjusted weight computation (via
  // many picks) trends toward being picked more often than pure base weight alone would predict.
  it("pacing boost increases the effective pick rate for a value that is behind pace", () => {
    // 14-entry window entirely "calm" (base weight only 0.10) — every OTHER value is maximally
    // behind pace. Run many picks and confirm "calm" (which is already at/over pace) is picked
    // less often than its raw 10% base weight would predict on its own, because the other 3
    // values are getting a pacing boost.
    const allCalmWindow: PlayfulHotWorldSnapshot[] = Array.from({ length: 14 }, () => ({ vitality_level: "calm" as const }));
    let calmCount = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const profile = pickPlayfulHotWorldProfile("lived_moments", { recentWindow: allCalmWindow }, Math.random);
      if (profile.vitality_level === "calm") calmCount++;
    }
    // Base weight for calm is 10% — with every other value boosted for being behind pace, calm's
    // effective share should be well under 10%.
    expect(calmCount / trials).toBeLessThan(0.10);
  });

  it("continuity phase modifier nudges vitality_level without crashing for every phase", () => {
    for (const phase of ["standalone", "setup", "event", "aftermath"] as const) {
      expect(() => pickPlayfulHotWorldProfile("lived_moments", { continuityPhase: phase }, () => 0.5)).not.toThrow();
    }
  });
});

describe("playfulHotWorldGuidance", () => {
  const baseProfile = {
    mood_temperature: "warm" as const,
    vitality_level: "alive" as const,
    social_pulse: "suggested_social" as const,
    seasonality: "neutral" as const,
    color_energy: "fresh" as const,
    fun_factor: "medium" as const,
  };

  it("always states all 6 dictated values", () => {
    const text = playfulHotWorldGuidance("lived_moments", baseProfile);
    expect(text).toContain("warm");
    expect(text).toContain("alive");
    expect(text).toContain("suggested_social");
    expect(text).toContain("neutral");
    expect(text).toContain("fresh");
    expect(text).toContain("medium");
  });

  it("adds an outdoor-daylight RULE line when seasonality is summer/high_summer", () => {
    const withoutSummer = playfulHotWorldGuidance("lived_moments", { ...baseProfile, seasonality: "neutral" });
    expect(withoutSummer).not.toMatch(/outdoor daylight/i);
    const withSummer = playfulHotWorldGuidance("lived_moments", { ...baseProfile, seasonality: "high_summer" });
    expect(withSummer).toMatch(/outdoor daylight/i);
  });

  it("adds a nightlife/social framing RULE line when social_pulse is social/party_adjacent", () => {
    const withoutSocial = playfulHotWorldGuidance("lived_moments", { ...baseProfile, social_pulse: "private" });
    expect(withoutSocial).not.toMatch(/nightlife\/event\/social/i);
    const withSocial = playfulHotWorldGuidance("lived_moments", { ...baseProfile, social_pulse: "party_adjacent" });
    expect(withSocial).toMatch(/nightlife\/event\/social/i);
  });

  it("adds a facial-expression RULE line when vitality_level is playful/electric", () => {
    const calm = playfulHotWorldGuidance("lived_moments", { ...baseProfile, vitality_level: "calm" });
    expect(calm).not.toMatch(/genuine smile/i);
    const electric = playfulHotWorldGuidance("lived_moments", { ...baseProfile, vitality_level: "electric" });
    expect(electric).toMatch(/genuine smile/i);
  });
});
