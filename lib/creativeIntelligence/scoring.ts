import type { AnalyzedPost } from "./igAnalyticsAdapter";
import type { ExplainableMetric, MetricBreakdownEntry, MetricCategory, PerformanceBreakdown, WinningAxis } from "./types";

// ── Creative Intelligence scoring model (v3, explainable, platform/business split) ─────────
//
// Every ContentPattern and NextContentRecommendation carries a PerformanceBreakdown: one row
// per real metric, each showing its raw value, its baseline (this character's own comparable
// posts — same post_type, same analysis window), and an index = raw / baseline. 1.0 = performs
// exactly at this account's own baseline; 1.5 = 50% above it. Absolute counts are never shown
// as "the score" because a raw number means nothing without knowing what's typical for this
// account.
//
// Metrics not currently fetched by app/api/publish/import-insights/route.ts's METRIC_SETS
// (non_follower_reach, watch_completion) are always marked unavailable — never estimated.
//
// TWO SEPARATE AXES, never blended into one opaque number:
//
//   PLATFORM (organic Instagram growth) — reach, non_follower_reach, follows, profile_visits,
//   watch_completion, saves, shares. Weighted into platform_composite_index:
//     follows              0.30  — strongest organic growth signal (mirrors
//                                   lib/growthScore.ts's follows weight being its highest
//                                   among platform-only metrics)
//     watch_completion      0.20  — retention/algorithm favor (currently always unavailable)
//     non_follower_reach    0.15  — organic discovery beyond the existing audience (currently
//                                   always unavailable)
//     profile_visits         0.15  — second-strongest real platform signal in
//                                   lib/growthScore.ts (weight 8, behind only follows=15)
//     reach                 0.10
//     saves                 0.05
//     shares                0.05
//   (PLATFORM_METRIC_WEIGHTS below is the authoritative source; this comment is the rationale.)
//
//   BUSINESS (Fanvue conversion) — fanvue_clicks today, kept as its own weighted table
//   (BUSINESS_METRIC_WEIGHTS) so more business metrics can be added later without touching the
//   platform math. fanvue_clicks is deliberately NEVER mixed into platform_composite_index —
//   a pattern with flat IG reach but strong Fanvue clicks must not read as "IG is growing".
//
// "engagement" (derived from likes+comments+saves+shares / reach) is shown in the breakdown
// for readability but excluded from BOTH weighted composites, to avoid double-counting
// saves/shares (which already have their own weighted rows).
//
// winning_axis names which axis is actually driving above-baseline performance ("platform",
// "business", "both", or "neither") — always explicit, so nothing "wins" for an unstated
// reason. confidence_score and status="proven" are both based on whichever axis is stronger,
// never a fixed blend.
//
// confidence_score = sizeFactor * consistencyFactor * performanceFactor (each 0..1):
//   sizeFactor        — sample_size vs PROVEN_MIN_SAMPLES, maxes out at 2x the proven bar
//   consistencyFactor — how stable the per-post index is, on whichever axis is stronger
//   performanceFactor — how far the stronger axis's index sits above 1.0 (baseline), capped
//                       at 2x baseline so one outlier post can't inflate confidence
//
// status = "proven" requires BOTH sample_size >= PROVEN_MIN_SAMPLES AND winning_axis !== "neither"
// (real outperformance on at least one axis, not just "some posts exist").

export const PROVEN_MIN_SAMPLES = 3;

export const METRIC_CATEGORY: Record<ExplainableMetric, MetricCategory> = {
  reach: "platform",
  non_follower_reach: "platform",
  follows: "platform",
  profile_visits: "platform",
  watch_completion: "platform",
  saves: "platform",
  shares: "platform",
  engagement: "platform",
  fanvue_clicks: "business",
};

// Sums to 1.0. Ordering/weights mirror lib/growthScore.ts's own prioritization among the
// platform-only metrics (follows=15 >> profile_visits=8 > shares=5 > saves=4), re-expressed as
// normalized (baseline-relative) weights instead of raw per-unit multipliers.
export const PLATFORM_METRIC_WEIGHTS: Record<
  Exclude<ExplainableMetric, "engagement" | "fanvue_clicks">,
  number
> = {
  follows: 0.3,
  watch_completion: 0.2,
  non_follower_reach: 0.15,
  profile_visits: 0.15,
  reach: 0.1,
  saves: 0.05,
  shares: 0.05,
};

// Single business metric today; kept as its own table (rather than a constant) so a second
// business metric can be added later without changing buildPerformanceBreakdown's shape.
export const BUSINESS_METRIC_WEIGHTS: Record<"fanvue_clicks", number> = {
  fanvue_clicks: 1.0,
};

const METRIC_ORDER: ExplainableMetric[] = [
  "reach",
  "non_follower_reach",
  "follows",
  "profile_visits",
  "watch_completion",
  "saves",
  "shares",
  "engagement",
  "fanvue_clicks",
];

const STRUCTURALLY_UNAVAILABLE: Partial<Record<ExplainableMetric, string>> = {
  non_follower_reach: "Not fetched by the current IG insights import (would need reach broken down by follow status).",
  watch_completion: "Not fetched by the current IG insights import (would need ig_reels_avg_watch_time / video view metrics).",
};

function rawMetric(metric: ExplainableMetric, p: AnalyzedPost["performance"]): number | undefined {
  switch (metric) {
    case "reach":
      return p.reach;
    case "follows":
      return p.follows;
    case "profile_visits":
      return p.profile_visits;
    case "saves":
      return p.saves;
    case "shares":
      return p.shares;
    case "fanvue_clicks":
      return p.fanvue_clicks;
    case "engagement":
      if (!p.reach || p.reach <= 0) return undefined;
      return ((p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0)) / p.reach;
    case "non_follower_reach":
    case "watch_completion":
      return undefined;
  }
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function baselineAverage(metric: ExplainableMetric, baselinePosts: AnalyzedPost[]): number | null {
  const values = baselinePosts.map((p) => rawMetric(metric, p.performance)).filter((v): v is number => v !== undefined);
  return average(values);
}

function buildMetricEntry(metric: ExplainableMetric, patternPosts: AnalyzedPost[], baselinePosts: AnalyzedPost[]): MetricBreakdownEntry {
  const category = METRIC_CATEGORY[metric];
  const structural = STRUCTURALLY_UNAVAILABLE[metric];
  if (structural) {
    return { metric, category, available: false, raw_value: null, baseline_value: null, index: null, unavailable_reason: structural };
  }

  const patternValues = patternPosts.map((p) => rawMetric(metric, p.performance)).filter((v): v is number => v !== undefined);
  const rawValue = average(patternValues);
  const baselineValue = baselineAverage(metric, baselinePosts);

  if (rawValue === null || baselineValue === null || baselineValue <= 0) {
    return {
      metric,
      category,
      available: false,
      raw_value: rawValue,
      baseline_value: baselineValue,
      index: null,
      unavailable_reason: "No comparable posts with this metric in the analysis window yet.",
    };
  }

  return { metric, category, available: true, raw_value: rawValue, baseline_value: baselineValue, index: rawValue / baselineValue };
}

function weightedIndex<M extends string>(metrics: MetricBreakdownEntry[], weights: Record<M, number>): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const entry of metrics) {
    if (!entry.available || entry.index === null) continue;
    const w = (weights as Record<string, number | undefined>)[entry.metric];
    if (w === undefined) continue;
    weightedSum += w * entry.index;
    weightTotal += w;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

function computeWinningAxis(platformIndex: number | null, businessIndex: number | null): WinningAxis {
  const platformWins = platformIndex !== null && platformIndex > 1.0;
  const businessWins = businessIndex !== null && businessIndex > 1.0;
  if (platformWins && businessWins) return "both";
  if (platformWins) return "platform";
  if (businessWins) return "business";
  return "neither";
}

export function buildPerformanceBreakdown(patternPosts: AnalyzedPost[], baselinePosts: AnalyzedPost[]): PerformanceBreakdown {
  const metrics = METRIC_ORDER.map((m) => buildMetricEntry(m, patternPosts, baselinePosts));

  const platform_composite_index = weightedIndex(metrics, PLATFORM_METRIC_WEIGHTS);
  const business_conversion_index = weightedIndex(metrics, BUSINESS_METRIC_WEIGHTS);

  return {
    sample_size: patternPosts.length,
    comparable_sample_size: baselinePosts.length,
    metrics,
    platform_composite_index,
    business_conversion_index,
    winning_axis: computeWinningAxis(platform_composite_index, business_conversion_index),
    post_ids: patternPosts.map((p) => p.performance.post_id),
  };
}

function perPostAxisIndex<M extends string>(post: AnalyzedPost, baselinePosts: AnalyzedPost[], weights: Record<M, number>): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const metric of Object.keys(weights) as M[]) {
    if (STRUCTURALLY_UNAVAILABLE[metric as ExplainableMetric]) continue;
    const value = rawMetric(metric as ExplainableMetric, post.performance);
    if (value === undefined) continue;
    const baseline = baselineAverage(metric as ExplainableMetric, baselinePosts);
    if (baseline === null || baseline <= 0) continue;
    const w = (weights as Record<string, number>)[metric];
    weightedSum += w * (value / baseline);
    weightTotal += w;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

function consistencyFactorFor<M extends string>(patternPosts: AnalyzedPost[], baselinePosts: AnalyzedPost[], weights: Record<M, number>): number {
  const perPost = patternPosts.map((p) => perPostAxisIndex(p, baselinePosts, weights)).filter((v): v is number => v !== null);
  if (perPost.length <= 1) return 0.5;
  const mean = perPost.reduce((s, v) => s + v, 0) / perPost.length;
  const variance = perPost.reduce((s, v) => s + (v - mean) ** 2, 0) / perPost.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  return Math.max(0.3, 1 - Math.min(0.7, cv / 2));
}

// confidence_score is based on whichever axis is stronger (platform or business) — a pattern
// that wins big on Fanvue clicks alone gets full credit, same as one that wins big on IG reach
// alone. It never averages the two axes together (that would let a strong platform performer
// and a strong business performer both look "medium", hiding which one actually won).
export function computeConfidence(breakdown: PerformanceBreakdown, patternPosts: AnalyzedPost[], baselinePosts: AnalyzedPost[]): number {
  if (breakdown.sample_size === 0) return 0;

  const platformIndex = breakdown.platform_composite_index ?? 0;
  const businessIndex = breakdown.business_conversion_index ?? 0;
  const strongerIndex = Math.max(platformIndex, businessIndex);
  if (strongerIndex <= 0) return 0;

  const sizeFactor = Math.min(1, breakdown.sample_size / (PROVEN_MIN_SAMPLES * 2));
  const consistencyFactor =
    businessIndex > platformIndex
      ? consistencyFactorFor(patternPosts, baselinePosts, BUSINESS_METRIC_WEIGHTS)
      : consistencyFactorFor(patternPosts, baselinePosts, PLATFORM_METRIC_WEIGHTS);
  const performanceFactor = Math.max(0, Math.min(1, strongerIndex / 2));

  return Math.round(sizeFactor * consistencyFactor * performanceFactor * 100) / 100;
}

export function isProven(breakdown: PerformanceBreakdown | null): boolean {
  return !!breakdown && breakdown.sample_size >= PROVEN_MIN_SAMPLES && breakdown.winning_axis !== "neither";
}
