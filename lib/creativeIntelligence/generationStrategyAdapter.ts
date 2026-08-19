import { supabase } from "@/lib/supabase";
import { getLatestStrategySnapshotRow, getStrategySnapshotById, StrategySnapshotRow } from "./strategyGenerator";
import type { MomentFamily, NextContentRecommendation, StoryTier, StrategyCategory } from "./types";

// Generation Strategy Adapter — the ONLY bridge between Creative Intelligence's analytics
// output (NextContentStrategy, dashboard-only until now) and the existing random/weighted
// generation pipeline (lib/storyGeneration.ts, lib/dailyBatch.ts). Deliberately narrow: this
// module NEVER calls Higgsfield/Kling, NEVER recomputes CI (only reads an already-saved
// snapshot from chs_ci_strategy_snapshots), and NEVER bypasses dailyBatch.ts/slotPrompts.ts/
// story tiers — it only produces a soft, capped bias signal those existing functions can
// optionally accept.
//
// Single-selection invariant (approved architecture, see the plan doc): the ONE random pick of
// "which recommendation shapes today" happens exclusively in selectGenerationStrategyInput(),
// called only from lib/storyGeneration.ts. lib/dailyBatch.ts NEVER calls that function — it
// deterministically re-reads the exact same recommendation via getStrategyInputByProvenance(),
// keyed off the (strategy_snapshot_id, recommendation_rank) storyGeneration.ts already
// persisted to chs_story_days. This guarantees one strategy decision, one provenance record,
// per day, end to end.

export type BiasStrength = "none" | "soft" | "medium" | "strong";
export type VariationStrength = "low" | "medium" | "high";

export interface GenerationStrategyInput {
  source: "creative_intelligence";
  category: StrategyCategory; // "proven" | "evolution" | "experiment"
  strategy_snapshot_id: string;
  recommendation_rank: number;

  preferredTier: StoryTier | null;
  preferredMomentFamily: MomentFamily | null;
  preferredLocationFamily: string | null; // guidance-only — location is free LLM text, never a hard constraint
  preferredActivity: string | null; // guidance-only
  preferredMood: string | null; // guidance-only
  preferredShotStyle: string | null; // humanized, e.g. "Walking" — matches NextContentRecommendation.shot_style
  preferredSexualEnergy: string | null;

  variationStrength: VariationStrength; // proven -> low, evolution -> medium, experiment -> high
  evidencePostIds: string[]; // real post ids backing this recommendation
  confidence: number; // rec.confidence_score, 0..1, unchanged from CI
  biasStrength: BiasStrength; // derived from confidence (see biasStrengthFor); always "soft" for experiment
}

// Never more aggressive than the existing growth_layer cap (storyTier.ts's BIAS_CAP = 0.10) —
// CI bias must never be a stronger lever than the already-shipped growth_layer mechanism.
const BIAS_DELTA: Record<BiasStrength, number> = { none: 0, soft: 0.05, medium: 0.08, strong: 0.1 };

// Stale-snapshot guard: a CI snapshot older than this is treated exactly like "no snapshot" —
// never used as a bias, regardless of how good its numbers were when it was generated.
export const MAX_STRATEGY_AGE_HOURS = 48;

const CATEGORY_WEIGHTS: Record<StrategyCategory, number> = { proven: 0.6, evolution: 0.3, experiment: 0.1 };
const CATEGORY_FALLBACK_ORDER: StrategyCategory[] = ["proven", "evolution", "experiment"];

export function biasStrengthFor(category: StrategyCategory, confidence: number): BiasStrength {
  // Experiment slots must never be pushed toward the winner pattern, regardless of how
  // confident the underlying (usually unproven) pattern happens to look.
  if (category === "experiment") return "soft";
  if (confidence < 0.3) return "soft";
  if (confidence <= 0.6) return "medium";
  return "strong";
}

export function biasDeltaFor(input: GenerationStrategyInput): number {
  return BIAS_DELTA[input.biasStrength];
}

// Sexual-energy level uses a MULTIPLICATIVE modifier (see lib/sexualEnergyConfig.ts's own
// CONTINUITY_PHASE_MODIFIER, capped there at 0.7-1.3), not the additive delta above — this maps
// the same three bias strengths onto that existing multiplier scale so CI is never a stronger
// lever than the continuity-phase nudge already shipped for that dimension.
const SEXUAL_ENERGY_MULTIPLIER: Record<BiasStrength, number> = { none: 1, soft: 1.1, medium: 1.2, strong: 1.3 };

export function sexualEnergyMultiplierFor(input: GenerationStrategyInput): number {
  return SEXUAL_ENERGY_MULTIPLIER[input.biasStrength];
}

function variationStrengthFor(category: StrategyCategory): VariationStrength {
  if (category === "proven") return "low";
  if (category === "evolution") return "medium";
  return "high";
}

function isSnapshotFresh(generatedAt: string, now: Date): boolean {
  const ageMs = now.getTime() - new Date(generatedAt).getTime();
  return ageMs >= 0 && ageMs <= MAX_STRATEGY_AGE_HOURS * 60 * 60 * 1000;
}

// Exported (pure, no Supabase) so category-selection/fallback behavior is unit-testable without
// a live database — see generationStrategyAdapter.test.ts.
export function groupByCategory(recommendations: NextContentRecommendation[]): Record<StrategyCategory, NextContentRecommendation[]> {
  const grouped: Record<StrategyCategory, NextContentRecommendation[]> = { proven: [], evolution: [], experiment: [] };
  for (const rec of recommendations) grouped[rec.category].push(rec);
  return grouped;
}

// Category-first weighted pick (proven 60% / evolution 30% / experiment 10%). If the drawn
// category has no recommendations in this snapshot, falls back to the nearest non-empty
// category in proven -> evolution -> experiment order — never a generation failure over an
// unlucky/small snapshot shape.
export function pickCategory(byCategory: Record<StrategyCategory, NextContentRecommendation[]>, rng: () => number): StrategyCategory | null {
  const r = rng();
  let acc = 0;
  let drawn: StrategyCategory = "proven";
  for (const cat of CATEGORY_FALLBACK_ORDER) {
    acc += CATEGORY_WEIGHTS[cat];
    if (r <= acc) {
      drawn = cat;
      break;
    }
  }
  if (byCategory[drawn].length > 0) return drawn;
  for (const cat of CATEGORY_FALLBACK_ORDER) {
    if (byCategory[cat].length > 0) return cat;
  }
  return null;
}

async function getPreviousRecommendationRank(characterId: string): Promise<number | null> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("recommendation_rank")
    .eq("character_id", characterId)
    .not("recommendation_rank", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rank = (data as { recommendation_rank?: number | null } | null)?.recommendation_rank;
  return typeof rank === "number" ? rank : null;
}

// Pure, unit-testable — maps ONE real recommendation to the generator-facing input shape.
export function toGenerationStrategyInput(rec: NextContentRecommendation, snapshotId: string): GenerationStrategyInput {
  const confidence = rec.confidence_score;
  return {
    source: "creative_intelligence",
    category: rec.category,
    strategy_snapshot_id: snapshotId,
    recommendation_rank: rec.rank,
    preferredTier: rec.recommended_framing.tier,
    preferredMomentFamily: rec.recommended_framing.moment_family,
    preferredLocationFamily: rec.recommended_framing.location,
    preferredActivity: rec.recommended_framing.activity,
    preferredMood: rec.recommended_framing.mood,
    preferredShotStyle: rec.shot_style,
    preferredSexualEnergy: rec.recommended_framing.sexual_energy_level,
    variationStrength: variationStrengthFor(rec.category),
    evidencePostIds: rec.performance?.post_ids ?? (rec.scene_evidence ? [rec.scene_evidence.post_id] : []),
    confidence,
    biasStrength: biasStrengthFor(rec.category, confidence),
  };
}

// THE single random-selection entry point (see file header). Called exclusively from
// lib/storyGeneration.ts, once per day per character. Never throws — any failure (Supabase
// error, malformed snapshot, stale/insufficient/empty data) safely resolves to null, which
// downstream callers treat identically to "Creative Intelligence unavailable today".
export async function selectGenerationStrategyInput(characterId: string): Promise<GenerationStrategyInput | null> {
  try {
    const snapshot = await getLatestStrategySnapshotRow(characterId);
    if (!snapshot) return null;
    if (!isSnapshotFresh(snapshot.generated_at, new Date())) return null;
    if (snapshot.data_status !== "ok") return null;
    if (!snapshot.recommendations || snapshot.recommendations.length === 0) return null;

    const byCategory = groupByCategory(snapshot.recommendations);
    const category = pickCategory(byCategory, Math.random);
    if (!category) return null;
    const pool = byCategory[category];

    const previousRank = await getPreviousRecommendationRank(characterId);
    const candidates = pool.length > 1 && previousRank !== null ? pool.filter((r) => r.rank !== previousRank) : pool;
    const finalPool = candidates.length > 0 ? candidates : pool;

    const rec = finalPool[Math.floor(Math.random() * finalPool.length)];
    return toGenerationStrategyInput(rec, snapshot.id);
  } catch (err) {
    console.error("[generationStrategyAdapter] selectGenerationStrategyInput failed:", err);
    return null;
  }
}

// Deterministic lookup — called exclusively from lib/dailyBatch.ts. NEVER picks randomly; just
// re-reads the exact recommendation storyGeneration.ts already selected and persisted, so the
// same day's story-generation and batch-generation steps always agree on one strategy decision.
export async function getStrategyInputByProvenance(strategySnapshotId: string, rank: number): Promise<GenerationStrategyInput | null> {
  try {
    const snapshot: StrategySnapshotRow | null = await getStrategySnapshotById(strategySnapshotId);
    if (!snapshot) return null;
    const rec = snapshot.recommendations.find((r) => r.rank === rank);
    if (!rec) return null;
    return toGenerationStrategyInput(rec, snapshot.id);
  } catch (err) {
    console.error("[generationStrategyAdapter] getStrategyInputByProvenance failed:", err);
    return null;
  }
}

// Pure — builds one soft guidance-text block for the dimensions that can only be influenced via
// prompt text (location/activity/mood are free LLM output, not a weighted pick — see the plan's
// dimension table). Wording strength tracks variationStrength so a "proven" pick reads more
// confidently than an "experiment" pick, but NEVER as a command ("must"/"always").
export function buildCreativeIntelligenceGuidance(input: GenerationStrategyInput): string {
  const parts: string[] = [];
  if (input.preferredLocationFamily) parts.push(`a ${input.preferredLocationFamily} setting`);
  if (input.preferredActivity) parts.push(`built around ${input.preferredActivity}`);
  if (input.preferredMood) parts.push(`a ${input.preferredMood} mood`);
  if (parts.length === 0) return "";

  const verb =
    input.variationStrength === "low"
      ? "has tended to perform well for this account"
      : input.variationStrength === "medium"
        ? "is worth leaning toward today, as one fresh variation on a direction that has worked"
        : "is a genuine open experiment worth trying — not yet proven, so feel free to go elsewhere if today's story calls for it";

  return `CREATIVE INTELLIGENCE (soft guidance from real Instagram performance data, never a rule) — ${parts.join(", ")} ${verb}. Use only if it fits today's natural continuation; never force it.`;
}
