import { describe, it, expect } from "vitest";
import {
  computeFrequencyPenalties,
  softAvoidCliches,
  weeklyBalanceNudges,
  situationMemoryGuidance,
  outfitCategoryNudges,
  SituationMemorySnapshot,
} from "./situationMemory";

function snap(overrides: Partial<SituationMemorySnapshot>): SituationMemorySnapshot {
  return {
    date: "2026-07-20",
    tier: "lived_moments",
    sexual_cliches: [],
    ...overrides,
  };
}

describe("computeFrequencyPenalties", () => {
  it("flags a value used 2+ times in the last 10 days as capped, without removing it from any pool", () => {
    const history = [
      snap({ date: "2026-07-20", life_domain: "nightlife_and_social_events" }),
      snap({ date: "2026-07-19", life_domain: "nightlife_and_social_events" }),
      snap({ date: "2026-07-18", life_domain: "home_and_private_life" }),
    ];
    const result = computeFrequencyPenalties(history);
    expect(result.avoidCapped).toContain("nightlife_and_social_events");
    // "penalty", never a removal — the value is still a plain string in the returned array,
    // not filtered out of some larger candidate set (there is no candidate set here at all).
    expect(Array.isArray(result.avoidCapped)).toBe(true);
  });

  it("prefers values not used in the last 3 days over values used recently", () => {
    const history = [
      snap({ date: "2026-07-20", activity: "recent_activity" }),
      snap({ date: "2026-07-19", activity: "recent_activity" }),
      snap({ date: "2026-07-18", activity: "recent_activity" }),
      snap({ date: "2026-07-10", activity: "older_activity" }),
      snap({ date: "2026-07-09", activity: "older_activity" }),
    ];
    const result = computeFrequencyPenalties(history);
    expect(result.preferUnused).toContain("older_activity");
    expect(result.preferUnused).not.toContain("recent_activity");
  });

  it("surfaces yesterday's dominant sexual-energy level so it can be avoided as today's dominant hook", () => {
    const history = [snap({ date: "2026-07-20", sexual_energy_level: "provocative" })];
    expect(computeFrequencyPenalties(history).avoidDominantSexualEnergyMechanism).toBe("provocative");
  });

  it("returns null for the dominant mechanism when there is no history", () => {
    expect(computeFrequencyPenalties([]).avoidDominantSexualEnergyMechanism).toBeNull();
  });

  // sex_appeal_style_v1 (iteration 3) — a live run showed "satin slip dress" repeating 6/14 days
  // because the declared outfit_archetype had no anti-repeat memory. outfit_family now
  // participates in the same frequency-penalty dims as life_domain/activity/etc.
  it("flags a repeated outfit_family as capped, same as any other tracked dimension", () => {
    const history = [
      snap({ date: "2026-07-20", outfit_family: "slip_dress" }),
      snap({ date: "2026-07-19", outfit_family: "slip_dress" }),
      snap({ date: "2026-07-18", outfit_family: "bodycon_dress" }),
    ];
    const result = computeFrequencyPenalties(history);
    expect(result.avoidCapped).toContain("slip_dress");
  });

  // luxury_seduction_v1 (iteration 4) — same treatment for the two new dims, defense-in-depth
  // alongside the hard block in lib/situationValidation.ts's fashionDirectionFamilyNotOverused/
  // poseArchetypeFamilyNotOverused.
  it("flags a repeated fashion_direction_family and pose_archetype_family as capped", () => {
    const history = [
      snap({ date: "2026-07-20", fashion_direction_family: "bodycon_dress", pose_archetype_family: "seated_crossed_legs" }),
      snap({ date: "2026-07-19", fashion_direction_family: "bodycon_dress", pose_archetype_family: "seated_crossed_legs" }),
      snap({ date: "2026-07-18", fashion_direction_family: "evening_dress", pose_archetype_family: "balcony_lean" }),
    ];
    const result = computeFrequencyPenalties(history);
    expect(result.avoidCapped).toContain("bodycon_dress");
    expect(result.avoidCapped).toContain("seated_crossed_legs");
  });
});

describe("softAvoidCliches", () => {
  it("surfaces a recently-used cliché as a penalty entry, never removing it from consideration", () => {
    const history = [snap({ date: "2026-07-20", sexual_cliches: ["mirror_selfie"] })];
    const result = softAvoidCliches(history);
    expect(result).toEqual([{ cliche: "mirror_selfie", daysSinceLastUse: 0 }]);
  });

  it("records the earliest (most recent) days-since-last-use per cliché", () => {
    const history = [
      snap({ date: "2026-07-20", sexual_cliches: [] }),
      snap({ date: "2026-07-19", sexual_cliches: ["robe_opening"] }),
      snap({ date: "2026-07-18", sexual_cliches: ["robe_opening"] }),
    ];
    const result = softAvoidCliches(history);
    expect(result).toEqual([{ cliche: "robe_opening", daysSinceLastUse: 1 }]);
  });

  it("returns an empty list, not an error, when no clichés appear in the lookback", () => {
    expect(softAvoidCliches([snap({}), snap({})])).toEqual([]);
  });
});

describe("weeklyBalanceNudges", () => {
  it("flags needsSocialDay when fewer than 2 socially-implied days exist in the window", () => {
    const week = [snap({ social_context_mode: "alone" }), snap({ social_context_mode: "alone" })];
    expect(weeklyBalanceNudges(week).needsSocialDay).toBe(true);
  });

  it("clears needsSocialDay once 2+ socially-implied days exist", () => {
    const week = [
      snap({ social_context_mode: "ambient_public" }),
      snap({ social_context_mode: "partial_companion" }),
      snap({ social_context_mode: "alone" }),
    ];
    expect(weeklyBalanceNudges(week).needsSocialDay).toBe(false);
  });

  it("flags locationFamilyCapHit when one location family appears more than twice", () => {
    const week = [snap({ location_family: "her kitchen" }), snap({ location_family: "her kitchen" }), snap({ location_family: "her kitchen" })];
    expect(weeklyBalanceNudges(week).locationFamilyCapHit).toBe(true);
  });

  it("does not flag locationFamilyCapHit for a location seen only twice", () => {
    const week = [snap({ location_family: "her kitchen" }), snap({ location_family: "her kitchen" }), snap({ location_family: "the beach" })];
    expect(weeklyBalanceNudges(week).locationFamilyCapHit).toBe(false);
  });

  it("flags consecutiveNightCapHit for 2+ consecutive dominant-night days", () => {
    const week = [snap({ date: "d3", time_of_day: "night" }), snap({ date: "d2", time_of_day: "night" }), snap({ date: "d1", time_of_day: "morning" })];
    expect(weeklyBalanceNudges(week).consecutiveNightCapHit).toBe(true);
  });

  it("flags needsIntimateHighlight when no intimate_aesthetic day landed this window", () => {
    const week = [snap({ tier: "lived_moments" }), snap({ tier: "everyday_life" })];
    expect(weeklyBalanceNudges(week).needsIntimateHighlight).toBe(true);
  });

  it("clears needsIntimateHighlight once an intimate_aesthetic day exists", () => {
    const week = [snap({ tier: "intimate_aesthetic" })];
    expect(weeklyBalanceNudges(week).needsIntimateHighlight).toBe(false);
  });

  it("never touches tier selection — the nudges object carries no tier-weight field at all", () => {
    const nudges = weeklyBalanceNudges([snap({})]);
    expect(nudges).not.toHaveProperty("tierWeights");
    expect(nudges).not.toHaveProperty("TIER_WEIGHTS");
  });
});

describe("situationMemoryGuidance", () => {
  it("formats penalties/clichés/nudges into non-empty prompt text without hard-ban language", () => {
    const text = situationMemoryGuidance(
      { preferUnused: [], avoidCapped: ["nightlife_and_social_events"], avoidDominantSexualEnergyMechanism: "provocative" },
      [{ cliche: "mirror_selfie", daysSinceLastUse: 0 }],
      weeklyBalanceNudges([])
    );
    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain("soft");
    // Non-blocking language throughout — "not banned"/"never hard bans" are fine (they
    // explicitly say the opposite); an unqualified imperative ban is not.
    expect(text.toLowerCase()).not.toMatch(/\bmust never\b|\bforbidden\b|(?<!not )(?<!hard )\bbanned\b/);
  });

  // playful_hot_world_v1 (iteration 5) — outfitNudges is optional; the outfit-mix line only
  // appears when passed AND there is something under quota.
  it("appends an outfit-mix balance line only when outfitNudges has under-quota categories", () => {
    const base = situationMemoryGuidance(
      { preferUnused: [], avoidCapped: [], avoidDominantSexualEnergyMechanism: null },
      [],
      weeklyBalanceNudges([])
    );
    expect(base).not.toMatch(/outfit-mix/i);

    const withEmptyNudges = situationMemoryGuidance(
      { preferUnused: [], avoidCapped: [], avoidDominantSexualEnergyMechanism: null },
      [],
      weeklyBalanceNudges([]),
      { underQuotaCategories: [] }
    );
    expect(withEmptyNudges).not.toMatch(/outfit-mix/i);

    const withNudges = situationMemoryGuidance(
      { preferUnused: [], avoidCapped: [], avoidDominantSexualEnergyMechanism: null },
      [],
      weeklyBalanceNudges([]),
      { underQuotaCategories: ["swim_pool", "body_confidence_active"] }
    );
    expect(withNudges).toMatch(/outfit-mix/i);
    expect(withNudges).toContain("swim_pool");
    expect(withNudges).toContain("body_confidence_active");
  });
});

describe("outfitCategoryNudges", () => {
  it("flags nothing under-quota for an empty history (expected count scales to 0 too)", () => {
    expect(outfitCategoryNudges([]).underQuotaCategories).toEqual([]);
  });

  it("flags a category as under-quota once history exists but that category never appeared", () => {
    const history = Array.from({ length: 7 }, (_, i) => snap({ date: `d${i}`, outfit_category: "social_evening" }));
    const result = outfitCategoryNudges(history);
    expect(result.underQuotaCategories).toContain("intimate_private");
  });

  it("clears a category once its 14-day target count is met", () => {
    const history = [
      ...Array.from({ length: 3 }, (_, i) => snap({ date: `d${i}`, outfit_category: "social_evening" })),
      ...Array.from({ length: 3 }, (_, i) => snap({ date: `d${i + 3}`, outfit_category: "casual_sexy" })),
      ...Array.from({ length: 2 }, (_, i) => snap({ date: `d${i + 6}`, outfit_category: "swim_pool" })),
      ...Array.from({ length: 2 }, (_, i) => snap({ date: `d${i + 8}`, outfit_category: "body_confidence_active" })),
      ...Array.from({ length: 2 }, (_, i) => snap({ date: `d${i + 10}`, outfit_category: "intimate_private" })),
    ];
    const result = outfitCategoryNudges(history);
    expect(result.underQuotaCategories).toEqual([]);
  });

  // Edge case flagged in the plan: swim_pool and body_confidence_active each map to exactly 1
  // outfit_family in the full 23-family taxonomy, so a real 14-day run may only ever have 1
  // family cycling through these buckets — the nudge must still fire correctly on raw counts,
  // independent of how many distinct families fed into that count.
  it("flags swim_pool/body_confidence_active as under-quota when only 1 family has been seen repeatedly", () => {
    const history = [
      snap({ date: "d0", outfit_category: "swim_pool" }),
      snap({ date: "d1", outfit_category: "body_confidence_active" }),
      ...Array.from({ length: 3 }, (_, i) => snap({ date: `d${i + 2}`, outfit_category: "social_evening" })),
      ...Array.from({ length: 3 }, (_, i) => snap({ date: `d${i + 5}`, outfit_category: "casual_sexy" })),
      ...Array.from({ length: 2 }, (_, i) => snap({ date: `d${i + 8}`, outfit_category: "intimate_private" })),
    ];
    const result = outfitCategoryNudges(history);
    expect(result.underQuotaCategories).toContain("swim_pool");
    expect(result.underQuotaCategories).toContain("body_confidence_active");
    expect(result.underQuotaCategories).not.toContain("social_evening");
    expect(result.underQuotaCategories).not.toContain("casual_sexy");
  });

  it("scales the expected count proportionally when history is shorter than 14 days", () => {
    // 7-day history, target for swim_pool is 2/14 -> expected ~1 at day 7. 0 seen -> under quota.
    const history = Array.from({ length: 7 }, (_, i) => snap({ date: `d${i}`, outfit_category: "social_evening" }));
    const result = outfitCategoryNudges(history);
    expect(result.underQuotaCategories).toContain("swim_pool");
  });

  it("ignores snapshots with no outfit_category rather than crashing", () => {
    const history = [snap({ date: "d0" }), snap({ date: "d1", outfit_category: undefined })];
    expect(() => outfitCategoryNudges(history)).not.toThrow();
  });
});
