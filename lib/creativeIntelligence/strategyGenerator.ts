import { supabase } from "@/lib/supabase";
import { evolvePattern, identifyProvenPatterns } from "./contentIntelligence";
import { recommendMotion } from "./motionIntelligence";
import { describeContentConcept, describeEvolutionConcept } from "./contentConcept";
import type {
  ContentPattern,
  ExplainableMetric,
  MetricCategory,
  MotionPattern,
  NextContentRecommendation,
  NextContentStrategy,
  PerformanceBreakdown,
  PerformanceIntelligence,
  StrategyCategory,
  StrategyObjective,
} from "./types";

// Strategy Generator (C + E) — the "Next Content Strategy" output. Ported concept from
// Python's ProductionStrategyGenerator.generate_batch: a 60% proven / 30% evolution / 10%
// experiment split. What changed: PROVEN now means a real winning *content pattern*
// combination (see contentIntelligence.ts + scoring.ts), not a motion pattern — motion is
// attached to each recommendation as a sub-choice (D), not the basis for the split itself.
//
// objective and why_selected are always axis-aware (see scoring.ts's platform/business
// split): a recommendation never claims "follower_acquisition" or "fanvue_conversion" without
// naming the specific available, above-baseline metric that justifies it, and why_selected
// always states plainly whether a pattern wins on IG growth, Fanvue conversion, both, or
// neither — never a single blended number.

const PROVEN_SHARE = 0.6;
const EVOLUTION_SHARE = 0.3;
// remainder goes to experiment

const METRIC_LABELS: Record<ExplainableMetric, string> = {
  reach: "reach",
  non_follower_reach: "non-follower reach",
  follows: "follows",
  profile_visits: "profile visits",
  watch_completion: "watch completion",
  saves: "saves",
  shares: "shares",
  engagement: "engagement rate",
  fanvue_clicks: "Fanvue clicks",
};

// Names the 1-3 real metrics of one category (platform or business) that are actually driving
// a pattern's performance on that axis, so why_selected never falls back to a single opaque number.
function summarizeMetrics(breakdown: PerformanceBreakdown, category: MetricCategory, max = 3): string {
  const strong = breakdown.metrics
    .filter((m) => m.category === category && m.available && m.index !== null && m.metric !== "engagement")
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, max);
  if (strong.length === 0) return "no comparable baseline data yet";
  return strong.map((m) => `${METRIC_LABELS[m.metric]} ${m.index!.toFixed(2)}x baseline`).join(", ");
}

// The transparency the user asked for: always states which axis is actually winning, never
// lets a Fanvue-driven win read as "IG growth" or vice versa.
function describeWinningAxis(breakdown: PerformanceBreakdown): string {
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

// objective is only ever claimed from a metric that is BOTH available (real data was fetched)
// AND above this character's own baseline — never inferred from a nonzero-but-unproven count.
// fanvue_conversion is claimed only when the business axis is the actual dominant signal (not
// merely present) — otherwise a small Fanvue bump on a big IG winner would misreport the goal.
function inferObjective(breakdown: PerformanceBreakdown | null): StrategyObjective {
  if (!breakdown) return "reach";
  const metric = (name: ExplainableMetric) => breakdown.metrics.find((m) => m.metric === name);

  const fanvue = metric("fanvue_clicks");
  const fanvueAboveBaseline = fanvue?.available && fanvue.index !== null && fanvue.index > 1.0;
  if (fanvueAboveBaseline && (breakdown.business_conversion_index ?? 0) >= (breakdown.platform_composite_index ?? 0)) {
    return "fanvue_conversion";
  }

  const follows = metric("follows");
  if (follows?.available && follows.index !== null && follows.index > 1.0) return "follower_acquisition";

  const profileVisits = metric("profile_visits");
  if (profileVisits?.available && profileVisits.index !== null && profileVisits.index > 1.0) return "follower_acquisition";

  const watch = metric("watch_completion");
  if (watch?.available && watch.index !== null && watch.index > 1.0) return "retention";

  const engagement = metric("engagement");
  if (engagement?.available && engagement.index !== null && engagement.index > 1.0) return "engagement";

  return "reach";
}

function toRecommendation(
  rank: number,
  category: StrategyCategory,
  pattern: ContentPattern,
  contentConcept: string,
  whySelected: string,
  motionPatterns: MotionPattern[]
): NextContentRecommendation {
  return {
    rank,
    category,
    content_concept: contentConcept,
    why_selected: whySelected,
    performance: pattern.performance,
    platform_composite_index: pattern.performance?.platform_composite_index ?? null,
    business_conversion_index: pattern.performance?.business_conversion_index ?? null,
    winning_axis: pattern.performance?.winning_axis ?? "neither",
    source_pattern_ids: pattern.parent_pattern_id ? [pattern.parent_pattern_id] : pattern.source_post_ids.length ? [pattern.id] : [],
    objective: inferObjective(pattern.performance),
    recommended_framing: {
      tier: pattern.descriptor.tier,
      moment_family: pattern.descriptor.moment_family,
      location: pattern.descriptor.location_family ?? pattern.descriptor.location,
      mood: pattern.descriptor.mood,
      // Not yet derivable from production data (see motionIntelligence.ts's integration-gap
      // note) — left null rather than guessed.
      lighting_hint: null,
    },
    recommended_motion: recommendMotion(pattern, motionPatterns),
    confidence_score: pattern.confidence_score,
  };
}

export function buildNextContentStrategy(
  characterId: string,
  intelligence: PerformanceIntelligence,
  motionPatterns: MotionPattern[],
  targetCount: number
): NextContentStrategy {
  const proven = identifyProvenPatterns(intelligence, targetCount);

  if (proven.length === 0) {
    // Honest cold-start: no proven patterns exist yet (either no scored posts, or none have
    // cleared the sample-size/baseline bar on either axis). Never fabricate a 60/30/10 split.
    const unproven = intelligence.patterns.slice(0, targetCount);
    const recommendations = unproven.map((p, i) =>
      toRecommendation(
        i + 1,
        "experiment",
        p,
        describeContentConcept(p.descriptor),
        p.performance && p.performance.sample_size > 0
          ? `Real combination tried ${p.performance.sample_size} time(s) so far — not enough history yet to call it proven. ${describeWinningAxis(p.performance)}`
          : "No historical performance data yet for this character.",
        motionPatterns
      )
    );
    return {
      character_id: characterId,
      generated_at: new Date().toISOString(),
      window_days: intelligence.window_days,
      recommendations,
      breakdown: { proven: 0, evolution: 0, experiment: recommendations.length },
      data_status: "insufficient_history",
    };
  }

  const provenSlots = Math.round(targetCount * PROVEN_SHARE);
  const evolutionSlots = Math.round(targetCount * EVOLUTION_SHARE);
  const experimentSlots = Math.max(0, targetCount - provenSlots - evolutionSlots);

  const recommendations: NextContentRecommendation[] = [];
  let rank = 1;

  for (let i = 0; i < provenSlots; i++) {
    const pattern = proven[i % proven.length];
    const breakdown = pattern.performance;
    recommendations.push(
      toRecommendation(
        rank++,
        "proven",
        pattern,
        describeContentConcept(pattern.descriptor),
        breakdown ? `${describeWinningAxis(breakdown)} Based on ${breakdown.sample_size} posts.` : "Proven pattern.",
        motionPatterns
      )
    );
  }

  for (let i = 0; i < evolutionSlots; i++) {
    const parent = proven[i % proven.length];
    const evolved = evolvePattern(parent);
    if (!evolved) continue;
    const parentBreakdown = parent.performance;
    recommendations.push(
      toRecommendation(
        rank++,
        "evolution",
        evolved,
        describeEvolutionConcept(parent.descriptor, String(evolved.evolved_dimension)),
        parentBreakdown
          ? `Evolution of a proven pattern: keep the winning formula, vary ${String(evolved.evolved_dimension)}. ${describeWinningAxis(parentBreakdown)}`
          : `Evolution of a proven pattern: vary ${String(evolved.evolved_dimension)}.`,
        motionPatterns
      )
    );
  }

  const unproven = identifyUnprovenForExperiment(intelligence, experimentSlots);
  for (let i = 0; i < experimentSlots; i++) {
    const pattern = unproven[i % Math.max(1, unproven.length)] ?? proven[0];
    const breakdown = pattern.performance;
    recommendations.push(
      toRecommendation(
        rank++,
        "experiment",
        pattern,
        describeContentConcept(pattern.descriptor),
        breakdown && breakdown.sample_size > 0
          ? `Exploratory — real combination tried only ${breakdown.sample_size} time(s), not yet proven. ${describeWinningAxis(breakdown)}`
          : "Exploratory — no historical data for this combination yet.",
        motionPatterns
      )
    );
  }

  return {
    character_id: characterId,
    generated_at: new Date().toISOString(),
    window_days: intelligence.window_days,
    recommendations,
    breakdown: {
      proven: recommendations.filter((r) => r.category === "proven").length,
      evolution: recommendations.filter((r) => r.category === "evolution").length,
      experiment: recommendations.filter((r) => r.category === "experiment").length,
    },
    data_status: "ok",
  };
}

function identifyUnprovenForExperiment(intelligence: PerformanceIntelligence, limit: number): ContentPattern[] {
  return intelligence.patterns.filter((p) => p.status === "unproven").slice(0, Math.max(1, limit));
}

// --- Persistence: chs_ci_strategy_snapshots (replaces data/production_strategy.json) ---

export async function saveStrategySnapshot(strategy: NextContentStrategy): Promise<string> {
  const { data, error } = await supabase
    .from("chs_ci_strategy_snapshots")
    .insert({
      character_id: strategy.character_id,
      generated_at: strategy.generated_at,
      window_days: strategy.window_days,
      recommendations: strategy.recommendations,
      breakdown: strategy.breakdown,
      data_status: strategy.data_status,
    })
    .select("id")
    .single();
  if (error) throw new Error(`saveStrategySnapshot: ${error.message}`);
  return data.id as string;
}

export async function getLatestStrategySnapshot(characterId: string): Promise<NextContentStrategy | null> {
  const { data, error } = await supabase
    .from("chs_ci_strategy_snapshots")
    .select("character_id, generated_at, window_days, recommendations, breakdown, data_status")
    .eq("character_id", characterId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestStrategySnapshot: ${error.message}`);
  if (!data) return null;
  return data as unknown as NextContentStrategy;
}
