import { describe, it, expect } from "vitest";
import {
  toGenerationStrategyInput,
  biasStrengthFor,
  biasDeltaFor,
  sexualEnergyMultiplierFor,
  groupByCategory,
  pickCategory,
  buildCreativeIntelligenceGuidance,
  MAX_STRATEGY_AGE_HOURS,
  GenerationStrategyInput,
} from "./generationStrategyAdapter";
import type { NextContentRecommendation, StrategyCategory } from "./types";

// Minimal, house-convention pure-function tests (no Supabase) — mirrors the style of
// lib/creativeIntelligence/scoring.test.ts. selectGenerationStrategyInput/
// getStrategyInputByProvenance are DB-touching and intentionally NOT unit tested here (same
// convention as pickTier/getGrowthBias/getLatestLifeState) — covered by the real end-to-end
// story_day generation instead.

function rec(overrides: Partial<NextContentRecommendation> = {}): NextContentRecommendation {
  return {
    rank: 1,
    category: "proven",
    scene: "Her bedroom, unmade bed, warm side light.",
    why: "Reached more people than a typical post.",
    objective: "reach",
    visual_direction: "Warm mood.",
    shot_style: "Walking",
    motion: null,
    source_evidence: "Derived from 4 posts.",
    confidence_score: 0.5,
    evidence_level: "direct",
    scene_evidence: { post_id: "post-1", reach: 12000 },
    performance: {
      sample_size: 4,
      comparable_sample_size: 20,
      metrics: [],
      platform_composite_index: 1.5,
      business_conversion_index: null,
      winning_axis: "platform",
      post_ids: ["post-1", "post-2", "post-3", "post-4"],
    },
    platform_composite_index: 1.5,
    business_conversion_index: null,
    winning_axis: "platform",
    source_pattern_ids: ["cp_abc"],
    recommended_framing: {
      tier: "intimate_aesthetic",
      moment_family: null,
      location: "bedroom",
      activity: "waking up",
      mood: "golden",
      sexual_energy_level: "provocative",
      lighting_hint: null,
      location_family: "bedroom",
    },
    ...overrides,
  };
}

describe("toGenerationStrategyInput", () => {
  it("maps every field from the recommendation and snapshot id", () => {
    const input = toGenerationStrategyInput(rec(), "snap-1");
    expect(input).toEqual<GenerationStrategyInput>({
      source: "creative_intelligence",
      category: "proven",
      strategy_snapshot_id: "snap-1",
      recommendation_rank: 1,
      preferredTier: "intimate_aesthetic",
      preferredMomentFamily: null,
      preferredLocationFamily: "bedroom",
      preferredActivity: "waking up",
      preferredMood: "golden",
      preferredShotStyle: "Walking",
      preferredSexualEnergy: "provocative",
      variationStrength: "low",
      evidencePostIds: ["post-1", "post-2", "post-3", "post-4"],
      confidence: 0.5,
      biasStrength: "medium",
    });
  });

  it("falls back to scene_evidence.post_id when performance is null (evolution/derived slots)", () => {
    const input = toGenerationStrategyInput(
      rec({ category: "evolution", performance: null, scene_evidence: { post_id: "post-9", reach: 500 } }),
      "snap-2"
    );
    expect(input.evidencePostIds).toEqual(["post-9"]);
    expect(input.variationStrength).toBe("medium");
  });

  it("evidencePostIds is empty when neither performance nor scene_evidence exist", () => {
    const input = toGenerationStrategyInput(rec({ performance: null, scene_evidence: null }), "snap-3");
    expect(input.evidencePostIds).toEqual([]);
  });
});

describe("biasStrengthFor", () => {
  it("is soft below 0.3 confidence", () => {
    expect(biasStrengthFor("proven", 0.29)).toBe("soft");
  });
  it("is medium at the 0.3 boundary", () => {
    expect(biasStrengthFor("proven", 0.3)).toBe("medium");
  });
  it("is medium at the 0.6 boundary", () => {
    expect(biasStrengthFor("proven", 0.6)).toBe("medium");
  });
  it("is strong just above 0.6", () => {
    expect(biasStrengthFor("proven", 0.61)).toBe("strong");
  });
  it("is always soft for experiment, regardless of confidence — never pushed toward the winner pattern", () => {
    expect(biasStrengthFor("experiment", 0.95)).toBe("soft");
    expect(biasStrengthFor("experiment", 0)).toBe("soft");
  });
});

describe("biasDeltaFor", () => {
  it("never exceeds the existing growth_layer cap (0.10)", () => {
    const strong = toGenerationStrategyInput(rec({ confidence_score: 0.9 }), "s");
    expect(biasDeltaFor(strong)).toBe(0.1);
  });
  it("soft is smaller than medium is smaller than strong", () => {
    const soft = toGenerationStrategyInput(rec({ confidence_score: 0.1 }), "s");
    const medium = toGenerationStrategyInput(rec({ confidence_score: 0.4 }), "s");
    const strong = toGenerationStrategyInput(rec({ confidence_score: 0.9 }), "s");
    expect(biasDeltaFor(soft)).toBeLessThan(biasDeltaFor(medium));
    expect(biasDeltaFor(medium)).toBeLessThan(biasDeltaFor(strong));
  });
});

describe("sexualEnergyMultiplierFor", () => {
  it("stays within sexualEnergyConfig's existing 0.7-1.3 multiplier ceiling", () => {
    const strong = toGenerationStrategyInput(rec({ confidence_score: 0.9 }), "s");
    expect(sexualEnergyMultiplierFor(strong)).toBe(1.3);
  });
  it("is 1 (no-op) mapping does not apply for 'none' since real inputs always carry a real biasStrength", () => {
    const soft = toGenerationStrategyInput(rec({ confidence_score: 0.1 }), "s");
    expect(sexualEnergyMultiplierFor(soft)).toBe(1.1);
  });
});

describe("groupByCategory / pickCategory", () => {
  it("groups recommendations by category", () => {
    const recs = [rec({ rank: 1, category: "proven" }), rec({ rank: 2, category: "evolution" }), rec({ rank: 3, category: "proven" })];
    const grouped = groupByCategory(recs);
    expect(grouped.proven.map((r) => r.rank)).toEqual([1, 3]);
    expect(grouped.evolution.map((r) => r.rank)).toEqual([2]);
    expect(grouped.experiment).toEqual([]);
  });

  it("draws proven/evolution/experiment in roughly 60/30/10 proportion over a large sample", () => {
    const grouped = groupByCategory([
      rec({ rank: 1, category: "proven" }),
      rec({ rank: 2, category: "evolution" }),
      rec({ rank: 3, category: "experiment" }),
    ]);
    const counts: Record<StrategyCategory, number> = { proven: 0, evolution: 0, experiment: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const cat = pickCategory(grouped, Math.random);
      if (cat) counts[cat]++;
    }
    expect(counts.proven / N).toBeGreaterThan(0.55);
    expect(counts.proven / N).toBeLessThan(0.65);
    expect(counts.evolution / N).toBeGreaterThan(0.25);
    expect(counts.evolution / N).toBeLessThan(0.35);
    expect(counts.experiment / N).toBeGreaterThan(0.05);
    expect(counts.experiment / N).toBeLessThan(0.15);
  });

  it("falls back to the nearest non-empty category (proven -> evolution -> experiment) when the drawn one is empty", () => {
    const grouped = groupByCategory([rec({ rank: 1, category: "experiment" })]);
    // rng always draws "proven" (r=0), but proven/evolution pools are empty -> falls back to experiment
    expect(pickCategory(grouped, () => 0)).toBe("experiment");
  });

  it("returns null only when every category is empty", () => {
    const grouped = groupByCategory([]);
    expect(pickCategory(grouped, Math.random)).toBeNull();
  });
});

describe("buildCreativeIntelligenceGuidance", () => {
  it("returns empty string when no preferred dimensions are set", () => {
    const input = toGenerationStrategyInput(
      rec({ recommended_framing: { tier: null, moment_family: null, location: null, activity: null, mood: null, sexual_energy_level: null, lighting_hint: null, location_family: null } }),
      "s"
    );
    expect(buildCreativeIntelligenceGuidance(input)).toBe("");
  });

  it("is worded as a soft suggestion, never a command, and never claims proven certainty for experiment slots", () => {
    const experimentInput = toGenerationStrategyInput(rec({ category: "experiment", confidence_score: 0.9 }), "s");
    const text = buildCreativeIntelligenceGuidance(experimentInput);
    expect(text).toContain("not yet proven");
    expect(text.toLowerCase()).not.toContain("must ");
    expect(text.toLowerCase()).not.toContain("always ");
  });

  it("reads more confidently for proven than for experiment", () => {
    const provenText = buildCreativeIntelligenceGuidance(toGenerationStrategyInput(rec({ category: "proven" }), "s"));
    const experimentText = buildCreativeIntelligenceGuidance(toGenerationStrategyInput(rec({ category: "experiment" }), "s"));
    expect(provenText).toContain("tended to perform well");
    expect(experimentText).toContain("open experiment");
  });
});

describe("MAX_STRATEGY_AGE_HOURS", () => {
  it("is the agreed 48-hour stale-snapshot guard", () => {
    expect(MAX_STRATEGY_AGE_HOURS).toBe(48);
  });
});
