import type { ExplainableMetric, MetricCategory, PerformanceBreakdown } from "./types";

// Shared "turn a PerformanceBreakdown into a sentence" helpers — used by strategyGenerator.ts,
// topPosts.ts and insights.ts so the three surfaces describe the same underlying numbers with
// the same wording instead of drifting apart.

export const METRIC_LABELS: Record<ExplainableMetric, string> = {
  reach: "reach",
  non_follower_reach: "non-follower reach",
  follows: "follows",
  profile_visits: "profile visits",
  watch_completion: "watch time",
  saves: "saves",
  shares: "shares",
  engagement: "engagement rate",
  total_interactions: "total interactions",
  fanvue_clicks: "Fanvue clicks",
};

// Names the 1-3 real metrics of one category (platform or business) that are actually driving
// performance on that axis, so text never has to fall back to a single opaque number.
export function summarizeMetrics(breakdown: PerformanceBreakdown, category: MetricCategory, max = 3): string {
  const strong = breakdown.metrics
    .filter((m) => m.category === category && m.available && m.index !== null && m.metric !== "engagement" && m.metric !== "total_interactions")
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, max);
  if (strong.length === 0) return "no comparable baseline data yet";
  return strong.map((m) => `${METRIC_LABELS[m.metric]} ${m.index!.toFixed(2)}x baseline`).join(", ");
}

// The transparency requirement: always states which axis is actually winning, never lets a
// Fanvue-driven win read as "IG growth" or vice versa.
export function describeWinningAxis(breakdown: PerformanceBreakdown): string {
  const platformSummary = summarizeMetrics(breakdown, "platform");
  const businessSummary = summarizeMetrics(breakdown, "business");
  switch (breakdown.winning_axis) {
    case "business":
      return `Wins on Fanvue conversion (${businessSummary}) — IG growth is not above baseline (${platformSummary}).`;
    case "platform":
      return `Wins on IG growth (${platformSummary}) — Fanvue conversion is not above baseline (${businessSummary}).`;
    case "both":
      return `Wins on both IG growth (${platformSummary}) and Fanvue conversion (${businessSummary}).`;
    case "neither":
    default:
      return `Not above baseline on IG growth (${platformSummary}) or Fanvue conversion (${businessSummary}) yet.`;
  }
}

// Plain-language version of a platform/business index, for primary UI (advanced numeric detail
// stays in the <details> analytics view). E.g. 3.28 -> "+228% vs your normal content".
export function formatIndexAsDelta(index: number | null): string {
  if (index === null || !Number.isFinite(index)) return "not enough data yet";
  const pct = Math.round((index - 1) * 100);
  if (pct === 0) return "right at your normal content";
  return pct > 0 ? `+${pct}% vs your normal content` : `${pct}% vs your normal content`;
}
