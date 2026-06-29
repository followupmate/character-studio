import { supabase } from "@/lib/supabase";
import type { StoryTier } from "@/lib/storyTier";

// GROWTH LAYER (v1.1, flag: growth_layer) — learn what grows, bias tier selection GENTLY.
// Metrics live in the existing chs_posts.engagement jsonb (manual daily import); no new table.
// The tier bias is a no-op until there is real signal (≥10 published Reels with metrics), and is
// always capped at ±10% with a per-tier floor so the engine can never collapse into one format.

export interface GrowthMetrics {
  views?: number; reach?: number; likes?: number; comments?: number; shares?: number;
  saves?: number; profile_visits?: number; follows?: number; fanvue_clicks?: number;
}

// Weighted score — downstream signals (follows, fanvue_clicks) matter far more than vanity views.
export function calculateGrowthScore(m: GrowthMetrics): number {
  return (
    (m.views ?? 0) * 0.1 +
    (m.saves ?? 0) * 4 +
    (m.comments ?? 0) * 3 +
    (m.shares ?? 0) * 5 +
    (m.profile_visits ?? 0) * 8 +
    (m.follows ?? 0) * 15 +
    (m.fanvue_clicks ?? 0) * 20
  );
}

export interface GrowthBias {
  modifier: Partial<Record<StoryTier, number>>; // per-tier additive weight delta, each within ±0.10
  winning_themes: StoryTier[];
  weak_themes: StoryTier[];
}

export const REEL_METRICS_THRESHOLD = 10; // bias stays off until this many published reels have metrics
const CAP = 0.10;
const SCALE = 0.5; // dampen the raw deviation so the bias is gentle

// Count published Reels that already have metrics (growth_score > 0).
export async function countScoredReels(characterId: string): Promise<number> {
  const { count } = await supabase
    .from("chs_posts")
    .select("id", { count: "exact", head: true })
    .eq("character_id", characterId)
    .eq("post_type", "reel")
    .eq("status", "posted")
    .gt("growth_score", 0);
  return count ?? 0;
}

// Returns null (no-op) until the threshold is met; otherwise a small, capped per-tier modifier.
export async function getGrowthBias(characterId: string): Promise<GrowthBias | null> {
  if ((await countScoredReels(characterId)) < REEL_METRICS_THRESHOLD) return null;

  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: posts } = await supabase
    .from("chs_posts")
    .select("growth_score, story_day_id")
    .eq("character_id", characterId)
    .gte("created_at", since)
    .gt("growth_score", 0);
  if (!posts || posts.length === 0) return null;

  const dayIds = Array.from(new Set(posts.map((p) => p.story_day_id).filter(Boolean))) as string[];
  if (dayIds.length === 0) return null;
  const { data: days } = await supabase.from("chs_story_days").select("id, tier").in("id", dayIds);
  const tierById = new Map((days ?? []).map((d) => [d.id as string, d.tier as StoryTier]));

  const byTier = new Map<StoryTier, number[]>();
  for (const p of posts) {
    const tier = tierById.get(p.story_day_id as string);
    if (!tier) continue;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(Number(p.growth_score) || 0);
  }
  if (byTier.size === 0) return null;

  const allScores = Array.from(byTier.values()).flat();
  const overall = allScores.reduce((s, n) => s + n, 0) / allScores.length;
  if (overall <= 0) return null;

  const modifier: Partial<Record<StoryTier, number>> = {};
  const winning: StoryTier[] = [];
  const weak: StoryTier[] = [];
  for (const [tier, scores] of byTier) {
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    const raw = ((avg - overall) / overall) * SCALE; // proportional deviation, dampened
    const m = Math.max(-CAP, Math.min(CAP, raw));
    modifier[tier] = m;
    if (m > 0.02) winning.push(tier);
    else if (m < -0.02) weak.push(tier);
  }
  return { modifier, winning_themes: winning, weak_themes: weak };
}
