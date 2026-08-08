import { fetchRecentPostPerformance } from "./igAnalyticsAdapter";
import { analyzePerformance } from "./contentIntelligence";
import { ensureSeedMotionPatterns, getMotionPatterns } from "./motionIntelligence";
import { buildNextContentStrategy } from "./strategyGenerator";
import type { NextContentStrategy, PerformanceIntelligence } from "./types";

export * from "./types";
export { fetchRecentPostPerformance } from "./igAnalyticsAdapter";
export { analyzePerformance, identifyProvenPatterns, evolvePattern } from "./contentIntelligence";
export { SEED_MOTION_PATTERNS, ensureSeedMotionPatterns, getMotionPatterns, mutateMotionPattern, recommendMotion } from "./motionIntelligence";
export { buildNextContentStrategy, saveStrategySnapshot, getLatestStrategySnapshot } from "./strategyGenerator";
export {
  PROVEN_MIN_SAMPLES,
  METRIC_CATEGORY,
  PLATFORM_METRIC_WEIGHTS,
  BUSINESS_METRIC_WEIGHTS,
  buildPerformanceBreakdown,
  computeConfidence,
  isProven,
} from "./scoring";
export { describeContentConcept, describeEvolutionConcept } from "./contentConcept";

// Orchestrator (replaces lib/creative_intelligence.py's CreativeIntelligenceOrchestrator).
// Pure recommendation layer: reads real IG performance already imported by
// app/api/publish/import-insights/route.ts, analyzes it, and returns a Next Content Strategy.
// Does NOT call Higgsfield/Kling and does NOT touch lib/dailyBatch.ts or lib/slotPrompts.ts —
// this is intentionally a read-only analytics -> recommendation pipeline for this phase.
export async function runCreativeIntelligence(
  characterId: string,
  windowDays = 30,
  targetCount = 7
): Promise<{ intelligence: PerformanceIntelligence; strategy: NextContentStrategy }> {
  await ensureSeedMotionPatterns();

  const posts = await fetchRecentPostPerformance(characterId, windowDays);
  const intelligence = analyzePerformance(characterId, windowDays, posts);
  const motionPatterns = await getMotionPatterns();
  const strategy = buildNextContentStrategy(characterId, intelligence, motionPatterns, targetCount);

  return { intelligence, strategy };
}
