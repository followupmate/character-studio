import type { AnalyzedPost } from "./igAnalyticsAdapter";
import { PROVEN_MIN_SAMPLES, buildPerformanceBreakdown, computeConfidence, isProven } from "./scoring";
import type { ContentDescriptor, ContentPattern, PerformanceIntelligence, StoryTier } from "./types";

// Content Intelligence (A + B): groups real posted content by what it actually was
// (tier, moment_family, location_family, activity_family, sexual_energy_level — all pulled
// from existing production data, see igAnalyticsAdapter.ts) and measures how it actually
// performed using the explainable scoring model in scoring.ts. No fabricated scores: a
// combination with fewer than PROVEN_MIN_SAMPLES real posts, or that hasn't beaten this
// character's own baseline (comparable posts of the same post_type), stays "unproven".

// Kept intentionally small: more grouping dimensions fragment the sample before there are
// enough real posts per group to say anything. Extend later once volume supports it.
const PATTERN_DIMENSIONS: (keyof ContentDescriptor)[] = [
  "tier",
  "moment_family",
  "location_family",
  "activity_family",
  "sexual_energy_level",
];

function descriptorKey(d: ContentDescriptor): string {
  return PATTERN_DIMENSIONS.map((k) => `${k}=${d[k] ?? "∅"}`).join("|");
}

function patternId(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return `cp_${(h >>> 0).toString(36)}`;
}

// The baseline a group is normalized against: comparable posts = this character's own scored
// posts of the SAME post_type (a 6s reel isn't compared to a static feed photo). Falls back to
// the full scored set only when no post_type-matched baseline exists at all.
function dominantPostType(posts: AnalyzedPost[]): string {
  const counts = new Map<string, number>();
  for (const p of posts) counts.set(p.performance.post_type, (counts.get(p.performance.post_type) ?? 0) + 1);
  let best = posts[0]?.performance.post_type ?? "";
  let bestCount = -1;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

export function analyzePerformance(characterId: string, windowDays: number, posts: AnalyzedPost[]): PerformanceIntelligence {
  const scored = posts.filter((p) => p.performance.growth_score > 0);

  const byPostType = new Map<string, AnalyzedPost[]>();
  for (const post of scored) {
    const type = post.performance.post_type;
    if (!byPostType.has(type)) byPostType.set(type, []);
    byPostType.get(type)!.push(post);
  }

  const groups = new Map<string, AnalyzedPost[]>();
  for (const post of scored) {
    const key = descriptorKey(post.descriptor);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(post);
  }

  const patterns: ContentPattern[] = [];
  for (const [key, group] of groups) {
    const type = dominantPostType(group);
    const baselinePosts = byPostType.get(type) ?? scored;
    const breakdown = buildPerformanceBreakdown(group, baselinePosts);
    const status = isProven(breakdown) ? "proven" : "unproven";
    patterns.push({
      id: patternId(key),
      descriptor: group[0].descriptor,
      status,
      performance: breakdown,
      confidence_score: computeConfidence(breakdown, group, baselinePosts),
      source_post_ids: breakdown.post_ids,
    });
  }
  patterns.sort((a, b) => b.confidence_score - a.confidence_score);

  const tierTotals = new Map<StoryTier, number>();
  for (const p of scored) {
    if (!p.descriptor.tier) continue;
    tierTotals.set(p.descriptor.tier, (tierTotals.get(p.descriptor.tier) ?? 0) + p.performance.growth_score);
  }
  let topTier: StoryTier | null = null;
  let topTierScore = -Infinity;
  for (const [tier, total] of tierTotals) {
    if (total > topTierScore) {
      topTierScore = total;
      topTier = tier;
    }
  }

  return {
    character_id: characterId,
    window_days: windowDays,
    posts_analyzed: scored.length,
    avg_growth_score: scored.length > 0 ? scored.reduce((s, p) => s + p.performance.growth_score, 0) / scored.length : 0,
    avg_reach: scored.length > 0 ? scored.reduce((s, p) => s + (p.performance.reach ?? 0), 0) / scored.length : 0,
    top_tier: topTier,
    patterns,
  };
}

export function identifyProvenPatterns(intelligence: PerformanceIntelligence, limit = 10): ContentPattern[] {
  return intelligence.patterns.filter((p) => p.status === "proven").slice(0, limit);
}

// Evolution (ported concept from Python's MotionEvolution, applied to content instead of
// motion): take a proven combination and vary exactly one dimension, keeping the rest of the
// winning formula intact. No invented replacement value is chosen — the recommendation says
// which dimension to try varying, not what to replace it with, since we have no real data on
// alternatives yet.
export function evolvePattern(pattern: ContentPattern): ContentPattern | null {
  if (pattern.status !== "proven") return null;
  const candidateDims = PATTERN_DIMENSIONS.filter((d) => pattern.descriptor[d] !== null);
  if (candidateDims.length === 0) return null;

  // Prefer varying the least-defining dimension (last in the list) so the core proven
  // combination (tier + moment_family) is preserved as long as possible.
  const dim = candidateDims[candidateDims.length - 1];
  const evolvedDescriptor: ContentDescriptor = { ...pattern.descriptor, [dim]: null };

  return {
    id: `${pattern.id}_evo_${dim}`,
    descriptor: evolvedDescriptor,
    status: "evolution",
    performance: null,
    confidence_score: Math.round(pattern.confidence_score * 0.7 * 100) / 100,
    source_post_ids: pattern.source_post_ids,
    parent_pattern_id: pattern.id,
    evolved_dimension: dim,
  };
}

export { PROVEN_MIN_SAMPLES };
