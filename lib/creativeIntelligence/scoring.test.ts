import { describe, it, expect } from "vitest";
import {
  buildPerformanceBreakdown,
  computeConfidence,
  isProven,
  PLATFORM_METRIC_WEIGHTS,
  BUSINESS_METRIC_WEIGHTS,
  PROVEN_MIN_SAMPLES,
} from "./scoring";
import type { AnalyzedPost } from "./igAnalyticsAdapter";
import type { ContentDescriptor, PostPerformance } from "./types";

const BASE_DESCRIPTOR: ContentDescriptor = {
  tier: "lived_moments",
  moment_family: "vacation_beach_water",
  location: null,
  mood: null,
  magnetism_level: null,
  activity_family: "arrival",
  location_family: "urban_hotel",
  sexual_energy_level: "playful",
  continuity_phase: null,
  shot_archetype: null,
  channel: "reel",
};

function post(overrides: Partial<PostPerformance>): AnalyzedPost {
  return {
    descriptor: BASE_DESCRIPTOR,
    media_url: null,
    thumbnail_url: null,
    performance: {
      post_id: overrides.post_id ?? `post_${Math.random()}`,
      media_id: "media_1",
      story_day_id: "day_1",
      posted_at: "2026-08-01T00:00:00Z",
      post_type: "reel",
      growth_score: 10,
      growth_winner: null,
      ...overrides,
    },
  };
}

describe("buildPerformanceBreakdown", () => {
  it("marks non_follower_reach as structurally unavailable (no such metric exists in the IG API)", () => {
    const breakdown = buildPerformanceBreakdown([post({ reach: 1000 })], [post({ reach: 500 })]);
    const nonFollower = breakdown.metrics.find((m) => m.metric === "non_follower_reach")!;
    expect(nonFollower.available).toBe(false);
    expect(nonFollower.unavailable_reason).toMatch(/not fetched/i);
  });

  it("watch_completion is unavailable (not structurally) when a post has no avg_watch_time_sec, and available when it does", () => {
    const withoutWatch = buildPerformanceBreakdown([post({ reach: 1000 })], [post({ reach: 500 })]);
    const watchMissing = withoutWatch.metrics.find((m) => m.metric === "watch_completion")!;
    expect(watchMissing.available).toBe(false);
    expect(watchMissing.unavailable_reason).not.toMatch(/not fetched/i); // no longer structurally blocked

    const withWatch = buildPerformanceBreakdown(
      [post({ reach: 1000, avg_watch_time_sec: 9 })],
      [post({ reach: 500, avg_watch_time_sec: 6 })]
    );
    const watchAvailable = withWatch.metrics.find((m) => m.metric === "watch_completion")!;
    expect(watchAvailable.available).toBe(true);
    expect(watchAvailable.index).toBeCloseTo(1.5);
  });

  it("computes raw_value, baseline_value and index correctly for an available metric", () => {
    const patternPosts = [post({ reach: 1000 }), post({ reach: 2000 })]; // avg 1500
    const baselinePosts = [post({ reach: 500 }), post({ reach: 500 })]; // avg 500
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);
    const reach = breakdown.metrics.find((m) => m.metric === "reach")!;
    expect(reach.available).toBe(true);
    expect(reach.category).toBe("platform");
    expect(reach.raw_value).toBe(1500);
    expect(reach.baseline_value).toBe(500);
    expect(reach.index).toBe(3); // 3x baseline
  });

  it("tags fanvue_clicks as a business metric and everything else as platform (except engagement, still platform)", () => {
    const breakdown = buildPerformanceBreakdown([post({ reach: 1000, fanvue_clicks: 5 })], [post({ reach: 1000, fanvue_clicks: 2 })]);
    const fanvue = breakdown.metrics.find((m) => m.metric === "fanvue_clicks")!;
    const reach = breakdown.metrics.find((m) => m.metric === "reach")!;
    const engagement = breakdown.metrics.find((m) => m.metric === "engagement")!;
    expect(fanvue.category).toBe("business");
    expect(reach.category).toBe("platform");
    expect(engagement.category).toBe("platform");
  });

  it("derives engagement as (likes+comments+saves+shares)/reach and excludes it from platform_composite_index", () => {
    // reach/saves/shares are IDENTICAL between pattern and baseline (every weighted metric
    // sits exactly at its baseline, index 1.0) — only likes/comments differ, which are not
    // weighted anywhere. If engagement leaked into the composite, it would move off 1.0.
    const patternPosts = [post({ reach: 1000, saves: 10, shares: 10, likes: 100, comments: 50 })]; // engagement = 170/1000 = 0.17
    const baselinePosts = [post({ reach: 1000, saves: 10, shares: 10, likes: 20, comments: 5 })]; // engagement = 45/1000 = 0.045
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);
    const engagement = breakdown.metrics.find((m) => m.metric === "engagement")!;
    expect(engagement.available).toBe(true);
    expect(engagement.raw_value).toBeCloseTo(0.17);
    expect(engagement.index).toBeCloseTo(0.17 / 0.045, 2);
    expect(breakdown.platform_composite_index).toBeCloseTo(1.0);
  });

  it("shows total_interactions in the breakdown but excludes it from platform_composite_index (would double-count saves/shares)", () => {
    // reach/saves/shares at baseline (index 1.0 each) — total_interactions is wildly different
    // (5x), but must not move the composite since it overlaps saves/shares.
    const patternPosts = [post({ reach: 1000, saves: 10, shares: 10, total_interactions: 500 })];
    const baselinePosts = [post({ reach: 1000, saves: 10, shares: 10, total_interactions: 100 })];
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);
    const totalInteractions = breakdown.metrics.find((m) => m.metric === "total_interactions")!;
    expect(totalInteractions.available).toBe(true);
    expect(totalInteractions.index).toBeCloseTo(5.0);
    expect(breakdown.platform_composite_index).toBeCloseTo(1.0);
  });

  it("computes business_conversion_index from fanvue_clicks alone, independent of platform metrics", () => {
    const patternPosts = [post({ reach: 1000, fanvue_clicks: 20 })]; // reach at baseline, fanvue 2x
    const baselinePosts = [post({ reach: 1000, fanvue_clicks: 10 })];
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);
    expect(breakdown.platform_composite_index).toBeCloseTo(1.0);
    expect(breakdown.business_conversion_index).toBeCloseTo(2.0);
  });

  it("renormalizes platform_composite_index weights when some metrics are unavailable", () => {
    // Only reach + saves have data; follows/shares/profile_visits are absent on every post.
    const patternPosts = [post({ reach: 2000, saves: 40 })];
    const baselinePosts = [post({ reach: 1000, saves: 20 })];
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);
    const follows = breakdown.metrics.find((m) => m.metric === "follows")!;
    expect(follows.available).toBe(false);
    // reach index = 2.0, saves index = 2.0, weights 0.10 + 0.05 renormalized to 1.0 total → 2.0
    expect(breakdown.platform_composite_index).toBeCloseTo(2.0);
  });

  it("returns both indices null when nothing is comparable", () => {
    const breakdown = buildPerformanceBreakdown([post({})], []);
    expect(breakdown.platform_composite_index).toBeNull();
    expect(breakdown.business_conversion_index).toBeNull();
    expect(breakdown.winning_axis).toBe("neither");
  });

  it("platform weight table sums to 1.0", () => {
    const total = Object.values(PLATFORM_METRIC_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0);
  });

  it("business weight table sums to 1.0", () => {
    const total = Object.values(BUSINESS_METRIC_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0);
  });
});

describe("winning_axis — distinguishing IG-growth winners from Fanvue winners", () => {
  it("case A: high reach/follows, low Fanvue clicks -> winning_axis 'platform', not 'business'", () => {
    const patternPosts = [
      post({ reach: 5000, follows: 10, fanvue_clicks: 1 }),
      post({ reach: 5000, follows: 10, fanvue_clicks: 1 }),
      post({ reach: 5000, follows: 10, fanvue_clicks: 1 }),
    ];
    const baselinePosts = [post({ reach: 1000, follows: 2, fanvue_clicks: 5 }), post({ reach: 1000, follows: 2, fanvue_clicks: 5 })];
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);

    expect(breakdown.platform_composite_index).toBeGreaterThan(1.0);
    expect(breakdown.business_conversion_index).toBeLessThan(1.0);
    expect(breakdown.winning_axis).toBe("platform");
    expect(isProven(breakdown)).toBe(true);
  });

  it("case B: average reach, high Fanvue clicks -> winning_axis 'business', not 'platform'", () => {
    const patternPosts = [
      post({ reach: 1000, follows: 2, fanvue_clicks: 30 }),
      post({ reach: 1000, follows: 2, fanvue_clicks: 30 }),
      post({ reach: 1000, follows: 2, fanvue_clicks: 30 }),
    ];
    const baselinePosts = [post({ reach: 1000, follows: 2, fanvue_clicks: 5 }), post({ reach: 1000, follows: 2, fanvue_clicks: 5 })];
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);

    expect(breakdown.platform_composite_index).toBeCloseTo(1.0, 1);
    expect(breakdown.business_conversion_index).toBeGreaterThan(1.0);
    expect(breakdown.winning_axis).toBe("business");
    expect(isProven(breakdown)).toBe(true);
  });

  it("distinguishes the two winner types from each other (not just from a 'neither' baseline)", () => {
    const baselinePosts = [post({ reach: 1000, follows: 2, fanvue_clicks: 5 }), post({ reach: 1000, follows: 2, fanvue_clicks: 5 })];
    const igWinner = buildPerformanceBreakdown(
      [post({ reach: 5000, follows: 10, fanvue_clicks: 1 }), post({ reach: 5000, follows: 10, fanvue_clicks: 1 }), post({ reach: 5000, follows: 10, fanvue_clicks: 1 })],
      baselinePosts
    );
    const fanvueWinner = buildPerformanceBreakdown(
      [post({ reach: 1000, follows: 2, fanvue_clicks: 30 }), post({ reach: 1000, follows: 2, fanvue_clicks: 30 }), post({ reach: 1000, follows: 2, fanvue_clicks: 30 })],
      baselinePosts
    );

    expect(igWinner.winning_axis).not.toBe(fanvueWinner.winning_axis);
    expect(igWinner.winning_axis).toBe("platform");
    expect(fanvueWinner.winning_axis).toBe("business");
    // Both are legitimately "proven", but for entirely different, transparent reasons.
    expect(isProven(igWinner)).toBe(true);
    expect(isProven(fanvueWinner)).toBe(true);
  });

  it("winning_axis is 'both' when a pattern outperforms baseline on both axes", () => {
    const patternPosts = [
      post({ reach: 5000, follows: 10, fanvue_clicks: 30 }),
      post({ reach: 5000, follows: 10, fanvue_clicks: 30 }),
      post({ reach: 5000, follows: 10, fanvue_clicks: 30 }),
    ];
    const baselinePosts = [post({ reach: 1000, follows: 2, fanvue_clicks: 5 }), post({ reach: 1000, follows: 2, fanvue_clicks: 5 })];
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);
    expect(breakdown.winning_axis).toBe("both");
  });
});

describe("isProven", () => {
  it("requires both PROVEN_MIN_SAMPLES and winning_axis !== 'neither'", () => {
    const strongButFewSamples = buildPerformanceBreakdown(
      [post({ reach: 2000 })],
      [post({ reach: 1000 }), post({ reach: 1000 })]
    );
    expect(strongButFewSamples.sample_size).toBeLessThan(PROVEN_MIN_SAMPLES);
    expect(isProven(strongButFewSamples)).toBe(false);

    const enoughSamplesButAtBaseline = buildPerformanceBreakdown(
      [post({ reach: 1000 }), post({ reach: 1000 }), post({ reach: 1000 })],
      [post({ reach: 1000 }), post({ reach: 1000 })]
    );
    expect(isProven(enoughSamplesButAtBaseline)).toBe(false); // index === 1.0, not > 1.0

    const proven = buildPerformanceBreakdown(
      [post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 })],
      [post({ reach: 1000 }), post({ reach: 1000 })]
    );
    expect(isProven(proven)).toBe(true);
  });

  it("returns false for a null breakdown", () => {
    expect(isProven(null)).toBe(false);
  });
});

describe("computeConfidence", () => {
  it("stays within [0, 1] and rewards larger, more consistent, above-baseline samples", () => {
    const baseline = [post({ reach: 1000 }), post({ reach: 1000 })];
    const small = buildPerformanceBreakdown([post({ reach: 2000 })], baseline);
    const large = buildPerformanceBreakdown(
      [post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 })],
      baseline
    );

    const smallConfidence = computeConfidence(small, [post({ reach: 2000 })], baseline);
    const largePosts = [post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 }), post({ reach: 2000 })];
    const largeConfidence = computeConfidence(large, largePosts, baseline);

    expect(smallConfidence).toBeGreaterThanOrEqual(0);
    expect(smallConfidence).toBeLessThanOrEqual(1);
    expect(largeConfidence).toBeGreaterThanOrEqual(0);
    expect(largeConfidence).toBeLessThanOrEqual(1);
    expect(largeConfidence).toBeGreaterThan(smallConfidence);
  });

  it("returns 0 when there is no comparable data", () => {
    const breakdown = buildPerformanceBreakdown([post({})], []);
    expect(computeConfidence(breakdown, [post({})], [])).toBe(0);
  });

  it("gives a Fanvue-driven winner real confidence, not zero, even with flat IG metrics", () => {
    const baselinePosts = [post({ reach: 1000, fanvue_clicks: 5 }), post({ reach: 1000, fanvue_clicks: 5 })];
    const patternPosts = [
      post({ reach: 1000, fanvue_clicks: 40 }),
      post({ reach: 1000, fanvue_clicks: 40 }),
      post({ reach: 1000, fanvue_clicks: 40 }),
    ];
    const breakdown = buildPerformanceBreakdown(patternPosts, baselinePosts);
    const confidence = computeConfidence(breakdown, patternPosts, baselinePosts);
    expect(confidence).toBeGreaterThan(0);
  });
});
