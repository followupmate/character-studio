import { supabase } from "@/lib/supabase";
import { evolvePattern, identifyProvenPatterns } from "./contentIntelligence";
import { recommendMotion } from "./motionIntelligence";
import { describeVisualDirection, describePatternLabel, describeShotStyle } from "./contentConcept";
import { describeWinningAxis } from "./describeBreakdown";
import type {
  ContentPattern,
  EvidenceLevel,
  ExplainableMetric,
  MotionPattern,
  NextContentRecommendation,
  NextContentStrategy,
  PatternSourceEntry,
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
// Critical requirement: when one winning pattern fills multiple recommendation slots (which
// happens whenever there are fewer distinct proven patterns than target slots), each slot must
// still be a genuinely different, concrete scene — never the same generic label repeated. Each
// slot draws from a DIFFERENT real source post's own location/mood text (via PatternCursor),
// never a blend of multiple posts' text into one invented location.
//
// UX contract (do not regress): a recommendation's badge/axis display and its `confidence_score`
// describe the DIRECTION (the whole pattern), never a specific unmeasured scene. Evolution
// slots have no individual measurement of their own (`performance: null` on the evolved
// pattern) — they must never render as if they'd been checked against baseline and found
// wanting. `evidence_level` + `scene_evidence` exist specifically so the UI can tell "this
// exact scene was posted and reached N people" (direct) apart from "this varies a proven
// scene, unproven itself, but the direction is real" (derived).

const PROVEN_SHARE = 0.6;
const EVOLUTION_SHARE = 0.3;
// remainder goes to experiment

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function formatCompactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

// Cycles through a pattern's real source posts so repeated draws from the same winning
// pattern (e.g. 4 PROVEN slots from 1 pattern) each land on a DIFFERENT real post — own
// descriptor AND own reach — instead of the same one four times.
class PatternCursor {
  private used = new Map<string, number>();

  next(pattern: ContentPattern): PatternSourceEntry {
    const idx = this.used.get(pattern.id) ?? 0;
    this.used.set(pattern.id, idx + 1);
    const pool = pattern.sources.length > 0 ? pattern.sources : [{ post_id: pattern.strongest_source?.post_id ?? "", descriptor: pattern.descriptor, reach: pattern.strongest_source?.reach ?? null }];
    return pool[idx % pool.length];
  }
}

// The real production `location` field is already a full, descriptive sentence fragment
// (e.g. "her bedroom, unmade bed, warm side light — back home after Dubrovnik") — use it
// directly as the scene rather than re-deriving an abstract tier/moment composition. This is
// ALWAYS a concrete creative scene, never an algorithm description — "vary X while keeping
// the formula" belongs in source_evidence (buildSourceEvidence below), not here.
function buildScene(source: PatternSourceEntry): string {
  return source.descriptor.location ? capitalize(source.descriptor.location) : describePatternLabel(source.descriptor).label;
}

function buildSourceEvidence(pattern: ContentPattern, evolvedDimension?: string): string {
  const { label } = describePatternLabel(pattern.descriptor);
  const n = pattern.performance?.sample_size ?? pattern.sources.length;
  const strongest = pattern.strongest_source;
  const strongestClause = strongest && strongest.reach !== null ? `; strongest source reached ${formatCompactNumber(strongest.reach)}` : "";
  const varyingClause = evolvedDimension ? ` (this variant explores a different ${evolvedDimension.replace(/_/g, " ")}, not itself individually measured)` : "";
  return `Derived from ${n} ${label.toLowerCase()} post${n === 1 ? "" : "s"}${varyingClause}${strongestClause}.`;
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
  source: PatternSourceEntry,
  why: string,
  motionPatterns: MotionPattern[],
  evidenceLevel: EvidenceLevel,
  evolvedDimension?: string
): NextContentRecommendation {
  const descriptor = source.descriptor;
  return {
    rank,
    category,
    scene: buildScene(source),
    why,
    objective: inferObjective(pattern.performance),
    visual_direction: describeVisualDirection(descriptor),
    shot_style: describeShotStyle(descriptor.shot_archetype),
    motion: recommendMotion(pattern, motionPatterns),
    source_evidence: buildSourceEvidence(pattern, evolvedDimension),
    confidence_score: pattern.confidence_score,
    evidence_level: evidenceLevel,
    scene_evidence: evidenceLevel === "direct" && source.post_id ? { post_id: source.post_id, reach: source.reach } : null,

    performance: pattern.performance,
    platform_composite_index: pattern.performance?.platform_composite_index ?? null,
    business_conversion_index: pattern.performance?.business_conversion_index ?? null,
    winning_axis: pattern.performance?.winning_axis ?? "neither",
    source_pattern_ids: pattern.parent_pattern_id ? [pattern.parent_pattern_id] : pattern.sources.length ? [pattern.id] : [],
    recommended_framing: {
      tier: descriptor.tier,
      moment_family: descriptor.moment_family,
      location: descriptor.location_family ?? descriptor.location,
      mood: descriptor.mood,
      lighting_hint: null, // not yet derivable from production data
    },
  };
}

export function buildNextContentStrategy(
  characterId: string,
  intelligence: PerformanceIntelligence,
  motionPatterns: MotionPattern[],
  targetCount: number
): NextContentStrategy {
  const proven = identifyProvenPatterns(intelligence, targetCount);
  const cursor = new PatternCursor();

  if (proven.length === 0) {
    // Honest cold-start: no proven patterns exist yet (either no scored posts, or none have
    // cleared the sample-size/baseline bar on either axis). Never fabricate a 60/30/10 split.
    const unproven = intelligence.patterns.slice(0, targetCount);
    const recommendations = unproven.map((p, i) => {
      const source = cursor.next(p);
      const why =
        p.performance && p.performance.sample_size > 0
          ? `Real combination tried ${p.performance.sample_size} time(s) so far — not enough history yet to call it proven. ${describeWinningAxis(p.performance)}`
          : "No historical performance data yet for this character.";
      return toRecommendation(i + 1, "experiment", p, source, why, motionPatterns, "direct");
    });
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
    const source = cursor.next(pattern);
    const why = pattern.performance ? `${describeWinningAxis(pattern.performance)} Based on ${pattern.performance.sample_size} posts.` : "Proven pattern.";
    recommendations.push(toRecommendation(rank++, "proven", pattern, source, why, motionPatterns, "direct"));
  }

  for (let i = 0; i < evolutionSlots; i++) {
    const parent = proven[i % proven.length];
    const evolved = evolvePattern(parent);
    if (!evolved) continue;
    const source = cursor.next(parent); // continues the SAME cursor — no repeat with proven slots
    const dim = String(evolved.evolved_dimension);
    // Creative framing, not an algorithm description — "keep the formula, vary X" moves to
    // source_evidence via buildSourceEvidence's varyingClause instead.
    const why = parent.performance
      ? `Part of the same proven direction as above (${describeWinningAxis(parent.performance)}), explored from a fresh angle.`
      : "Part of the same proven direction as above, explored from a fresh angle.";
    recommendations.push(toRecommendation(rank++, "evolution", evolved, source, why, motionPatterns, "derived", dim));
  }

  const unproven = identifyUnprovenForExperiment(intelligence, experimentSlots);
  for (let i = 0; i < experimentSlots; i++) {
    const pattern = unproven[i % Math.max(1, unproven.length)] ?? proven[0];
    const source = cursor.next(pattern);
    const breakdown = pattern.performance;
    const why =
      breakdown && breakdown.sample_size > 0
        ? `Exploratory — real combination tried only ${breakdown.sample_size} time(s), not yet proven. ${describeWinningAxis(breakdown)}`
        : "Exploratory — no historical data for this combination yet.";
    recommendations.push(toRecommendation(rank++, "experiment", pattern, source, why, motionPatterns, "direct"));
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
