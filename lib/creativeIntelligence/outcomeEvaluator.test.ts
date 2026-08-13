import { describe, it, expect } from "vitest";
import {
  median,
  pickBaselineWindow,
  computeAlignmentScore,
  computePlatformUplift,
  computeBusinessUplift,
  deriveVerdict,
  confidenceBucket,
  alignmentBucket,
  MIN_COMPARABLE_SAMPLE,
  STRONG_UPLIFT_THRESHOLD,
  POSITIVE_UPLIFT_THRESHOLD,
  ALIGNMENT_HIGH_THRESHOLD,
  ALIGNMENT_LOW_THRESHOLD,
  ContentAttributes,
} from "./outcomeEvaluator";

// Pure-function tests only (no Supabase) — house convention. The DB-orchestrating
// evaluateStrategyOutcomes/summarizeStrategyEffectiveness are verified against real production
// data instead (see the pre-push report), same as pickTier/getGrowthBias elsewhere.

describe("median", () => {
  it("returns null for an empty array", () => {
    expect(median([])).toBeNull();
  });
  it("returns the middle value for odd-length arrays", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middle values for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("is not distorted by a single viral outlier the way a mean would be", () => {
    const values = [100, 110, 120, 130, 10000];
    expect(median(values)).toBe(120);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(2000); // mean is wildly pulled by the outlier; median isn't
  });
});

describe("pickBaselineWindow", () => {
  const now = new Date("2026-08-09T00:00:00.000Z");
  function daysAgo(n: number) {
    return { postedAt: new Date(now.getTime() - n * 86_400_000).toISOString() };
  }

  it("uses the tightest (30-day) window when it already clears minSample", () => {
    const candidates = [daysAgo(5), daysAgo(10), daysAgo(15), daysAgo(20), daysAgo(25)];
    const { windowDays, sample } = pickBaselineWindow(candidates, now, 5);
    expect(windowDays).toBe(30);
    expect(sample.length).toBe(5);
  });

  it("widens to 60 days when 30 days is too thin", () => {
    const candidates = [daysAgo(5), daysAgo(10), daysAgo(45), daysAgo(50), daysAgo(55)];
    const { windowDays, sample } = pickBaselineWindow(candidates, now, 5);
    expect(windowDays).toBe(60);
    expect(sample.length).toBe(5);
  });

  it("widens to 90 days when 60 is too thin", () => {
    const candidates = [daysAgo(5), daysAgo(45), daysAgo(85), daysAgo(88)];
    const { windowDays, sample } = pickBaselineWindow(candidates, now, 5);
    expect(windowDays).toBe(90);
    expect(sample.length).toBe(4); // still short of 5 — caller's deriveVerdict marks insufficient_data, not this function
  });

  it("only same character/post_type/horizon candidates are ever passed in by the caller — this function trusts its input", () => {
    // documents the contract: fetchBaselineCandidates() is what applies the
    // character_id/post_type/horizon filters before candidates ever reach this pure function.
    const candidates = [daysAgo(1)];
    expect(pickBaselineWindow(candidates, now, 5).sample).toEqual(candidates);
  });
});

function attrs(overrides: Partial<ContentAttributes> = {}): ContentAttributes {
  return {
    tier: "intimate_aesthetic",
    moment_family: null,
    location_family: "bedroom", // a genuine family/tag value, not free text — safe to score
    activity: "waking up", // activity is always family-tag-or-null on both sides, never free text
    sexual_energy_level: "provocative",
    shot_style: "Walking",
    ...overrides,
  };
}

describe("computeAlignmentScore", () => {
  it("is 1.0 when every comparable dimension matches", () => {
    expect(computeAlignmentScore(attrs(), attrs())).toBe(1);
  });

  it("is in 0..1 range for a partial match", () => {
    const score = computeAlignmentScore(attrs(), attrs({ sexual_energy_level: "subtle", shot_style: "Gesture" }));
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(1);
  });

  it("ignores a dimension missing on either side — missing != mismatch", () => {
    // tier/location_family/activity/shot_style all match (4 of 5); moment_family is null on
    // both sides (ignored); sexual_energy_level differs — comparable dims = 5, matches = 4.
    const recommended = attrs({ moment_family: null, sexual_energy_level: "provocative" });
    const actual = attrs({ moment_family: null, sexual_energy_level: "subtle" });
    expect(computeAlignmentScore(recommended, actual)).toBe(Math.round((4 / 5) * 100) / 100);
  });

  it("renormalizes over available dimensions, not a fixed denominator", () => {
    const recommended: ContentAttributes = { tier: "everyday_life", moment_family: null, location_family: null, activity: null, sexual_energy_level: null, shot_style: null };
    const actual: ContentAttributes = { tier: "everyday_life", moment_family: null, location_family: null, activity: null, sexual_energy_level: null, shot_style: null };
    // Only "tier" is comparable on both sides -> 1/1 = 1.0, not 1/6.
    expect(computeAlignmentScore(recommended, actual)).toBe(1);
  });

  it("returns null when there is not a single comparable dimension", () => {
    const empty: ContentAttributes = { tier: null, moment_family: null, location_family: null, activity: null, sexual_energy_level: null, shot_style: null };
    expect(computeAlignmentScore(empty, empty)).toBeNull();
  });

  it("is case/whitespace-insensitive", () => {
    const a = attrs({ shot_style: " Walking " });
    const b = attrs({ shot_style: "walking" });
    expect(computeAlignmentScore(a, b)).toBe(1);
  });

  it("V1 excludes free-text location and mood from scoring entirely — ContentAttributes has no `location`/`mood` field a naive exact-match could accidentally run on", () => {
    const keys = Object.keys(attrs());
    expect(keys).not.toContain("location");
    expect(keys).not.toContain("mood");
    expect(keys).toContain("location_family"); // the tag-only, scoring-safe replacement
  });

  it("location_family is only comparable when BOTH sides have a real tag — never falls back to free text for scoring", () => {
    // Neither side has a location_family tag (both null) -> dimension excluded, not compared as
    // free text. Only tier/activity/shot_style remain comparable, all matching -> 1.0.
    const recommended = attrs({ location_family: null });
    const actual = attrs({ location_family: null, sexual_energy_level: null });
    expect(computeAlignmentScore(recommended, actual)).toBe(1);
  });
});

describe("computePlatformUplift", () => {
  it("computes weighted uplift across available metrics", () => {
    const { value } = computePlatformUplift({ reach: 2000, saves: 40, shares: 10, views: 5000, avg_watch_time_sec: 6 }, { reach: 1000, saves: 20, shares: 5, views: 2500, avg_watch_time_sec: 3 });
    // every metric doubled -> uplift should be exactly +100% (1.0)
    expect(value).toBe(1);
  });

  it("missing metric on the post side is excluded, never treated as 0", () => {
    const post = { reach: 2000, saves: undefined, shares: 10, views: 5000, avg_watch_time_sec: undefined };
    const baseline = { reach: 1000, saves: 20, shares: 5, views: 2500, avg_watch_time_sec: 3 };
    const { value, detail } = computePlatformUplift(post, baseline);
    const savesEntry = detail.find((d) => d.metric === "saves")!;
    expect(savesEntry.available).toBe(false);
    expect(savesEntry.uplift).toBeNull();
    // if saves were wrongly treated as 0 vs baseline 20, that's a -100% uplift that would drag
    // the weighted average far down — confirm the result matches only reach/shares/views doubling.
    expect(value).toBe(1);
  });

  it("missing metric on the baseline side is also excluded, never treated as 0 baseline (no division by zero)", () => {
    const post = { reach: 2000, saves: 40 };
    const baseline = { reach: 1000, saves: undefined };
    const { detail } = computePlatformUplift(post, baseline);
    expect(detail.find((d) => d.metric === "saves")!.available).toBe(false);
  });

  it("baseline of exactly 0 is treated as unavailable (not a division by zero / infinite uplift)", () => {
    const { detail } = computePlatformUplift({ reach: 100 }, { reach: 0 });
    const entry = detail.find((d) => d.metric === "reach")!;
    expect(entry.available).toBe(false);
    expect(entry.uplift).toBeNull();
  });

  it("is null when no metrics are available on both sides", () => {
    const { value } = computePlatformUplift({}, {});
    expect(value).toBeNull();
  });
});

describe("computeBusinessUplift", () => {
  it("computes uplift when both sides have fanvue_clicks", () => {
    expect(computeBusinessUplift(20, 10)).toBe(1);
  });
  it("is null when the post has no Fanvue tracking — not 0", () => {
    expect(computeBusinessUplift(null, 10)).toBeNull();
    expect(computeBusinessUplift(undefined, 10)).toBeNull();
  });
  it("is null when the baseline has no Fanvue tracking — not 0", () => {
    expect(computeBusinessUplift(20, null)).toBeNull();
  });
  it("is null when the baseline is 0 (no division by zero)", () => {
    expect(computeBusinessUplift(20, 0)).toBeNull();
  });
});

describe("deriveVerdict", () => {
  it("MIN_COMPARABLE_SAMPLE stays 5 — no lowering the bar just to surface a verdict sooner", () => {
    expect(MIN_COMPARABLE_SAMPLE).toBe(5);
  });

  it("is insufficient_data when the comparable baseline sample is too small — never loss", () => {
    expect(deriveVerdict(-0.5, 1, MIN_COMPARABLE_SAMPLE - 1)).toBe("insufficient_data");
    expect(deriveVerdict(2.0, 1, 0)).toBe("insufficient_data");
  });

  it("exactly MIN_COMPARABLE_SAMPLE real baseline snapshots is enough to produce a real verdict (not insufficient_data)", () => {
    expect(deriveVerdict(0.6, 1, MIN_COMPARABLE_SAMPLE)).not.toBe("insufficient_data");
  });

  it("is insufficient_data when platformUplift itself could not be computed", () => {
    expect(deriveVerdict(null, 1, MIN_COMPARABLE_SAMPLE)).toBe("insufficient_data");
  });

  it("strong performance + high alignment -> strong_win", () => {
    expect(deriveVerdict(STRONG_UPLIFT_THRESHOLD + 0.1, ALIGNMENT_HIGH_THRESHOLD, MIN_COMPARABLE_SAMPLE)).toBe("strong_win");
  });

  it("strong performance + null alignment (nothing to compare) -> strong_win, not penalized for missing tags", () => {
    expect(deriveVerdict(STRONG_UPLIFT_THRESHOLD + 0.1, null, MIN_COMPARABLE_SAMPLE)).toBe("strong_win");
  });

  it("strong performance + very low alignment -> CI does NOT get full strong_win credit", () => {
    const verdict = deriveVerdict(STRONG_UPLIFT_THRESHOLD + 0.5, 0.05, MIN_COMPARABLE_SAMPLE);
    expect(verdict).not.toBe("strong_win");
    expect(verdict).toBe("neutral"); // performance real, but too loosely tied to the recommendation to credit CI at all
  });

  it("strong performance + moderate (but not high) alignment is downgraded to win, not strong_win", () => {
    const mid = (ALIGNMENT_LOW_THRESHOLD + ALIGNMENT_HIGH_THRESHOLD) / 2;
    expect(deriveVerdict(STRONG_UPLIFT_THRESHOLD + 0.1, mid, MIN_COMPARABLE_SAMPLE)).toBe("win");
  });

  it("positive (but not strong) performance + ok alignment -> win", () => {
    expect(deriveVerdict(POSITIVE_UPLIFT_THRESHOLD + 0.01, 1, MIN_COMPARABLE_SAMPLE)).toBe("win");
  });

  it("positive performance + very low alignment -> neutral, not win", () => {
    expect(deriveVerdict(POSITIVE_UPLIFT_THRESHOLD + 0.01, 0.05, MIN_COMPARABLE_SAMPLE)).toBe("neutral");
  });

  it("flat performance -> neutral regardless of alignment", () => {
    expect(deriveVerdict(0, 1, MIN_COMPARABLE_SAMPLE)).toBe("neutral");
    expect(deriveVerdict(0, 0, MIN_COMPARABLE_SAMPLE)).toBe("neutral");
  });

  it("poor performance -> loss, even with perfect alignment (alignment never excuses a real loss)", () => {
    expect(deriveVerdict(-0.5, 1, MIN_COMPARABLE_SAMPLE)).toBe("loss");
  });
});

describe("confidenceBucket", () => {
  it("mirrors generationStrategyAdapter's biasStrengthFor thresholds (<0.3 / 0.3-0.6 / >0.6)", () => {
    expect(confidenceBucket(0.29)).toBe("low");
    expect(confidenceBucket(0.3)).toBe("medium");
    expect(confidenceBucket(0.6)).toBe("medium");
    expect(confidenceBucket(0.61)).toBe("high");
  });
});

describe("alignmentBucket", () => {
  it("returns null for a null alignment score (nothing to bucket)", () => {
    expect(alignmentBucket(null)).toBeNull();
  });
  it("buckets at the same low/high thresholds used by deriveVerdict", () => {
    expect(alignmentBucket(0.1)).toBe("low");
    expect(alignmentBucket(0.45)).toBe("medium");
    expect(alignmentBucket(0.9)).toBe("high");
  });
});
