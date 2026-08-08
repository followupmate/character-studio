import type { StoryTier, MomentFamily, MagnetismLevel } from "@/types/index";
export type { StoryTier, MomentFamily, MagnetismLevel } from "@/types/index";

// Creative Intelligence — data model
//
// Goal: Instagram Analytics -> what content works -> what to make next. Motion is a
// sub-layer (D), not the point. Everything here is derived from real production data
// (chs_story_days, chs_media, chs_posts.engagement) — nothing is invented or hardcoded.
// A pattern with no supporting posts is "unproven", never assigned a fake score.

export type ContentPatternStatus = "proven" | "evolution" | "unproven";
export type StrategyCategory = "proven" | "evolution" | "experiment";
// "fanvue_conversion" is a business objective, distinct from the four platform objectives —
// see scoring.ts's platform/business split and strategyGenerator.ts's inferObjective().
export type StrategyObjective = "reach" | "follower_acquisition" | "retention" | "engagement" | "fanvue_conversion";

// The descriptor a content pattern is grouped by — pulled from existing StoryDay +
// Media.visual_signature.situation_tags fields, not a new taxonomy. Any field can be
// null when the source post predates that field being recorded.
export interface ContentDescriptor {
  tier: StoryTier | null;
  moment_family: MomentFamily | null;
  location: string | null;
  mood: string | null;
  magnetism_level: MagnetismLevel | null;
  activity_family: string | null;
  location_family: string | null;
  sexual_energy_level: string | null;
  continuity_phase: string | null;
  shot_archetype: string | null;
  channel: string | null; // feed | reel | story
}

// Real, IG-sourced metrics only — mirrors chs_posts.engagement (see lib/growthScore.ts's
// GrowthMetrics). No fabricated fields (no "success_rate = watch_time / 20").
export interface PostPerformance {
  post_id: string;
  media_id: string;
  story_day_id: string | null;
  posted_at: string | null;
  post_type: string;
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  profile_visits?: number;
  follows?: number;
  fanvue_clicks?: number;
  growth_score: number;
  growth_winner: boolean | null;
}

// ── Explainable scoring model (v3, platform / business split) ──────────────────────────────
// See lib/creativeIntelligence/scoring.ts for the full formula + rationale. Summary: every
// metric below is normalized against a BASELINE (the average of this character's own
// comparable posts — same post_type, same analysis window) rather than compared as a raw
// number, because a raw "avg_growth_score: 187.3" is meaningless without knowing what's
// typical for this account. A metric that the current IG insights import doesn't fetch
// (non_follower_reach, watch_completion) is always shown as unavailable, never guessed.
//
// Metrics split into two categories that are scored SEPARATELY, never blended into one
// opaque number: "platform" (organic Instagram growth) and "business" (Fanvue conversion).
// A pattern can win on one axis without winning on the other, and both are always shown.
export type MetricCategory = "platform" | "business";
export type ExplainableMetric =
  | "reach"
  | "non_follower_reach"
  | "follows"
  | "profile_visits"
  | "watch_completion"
  | "saves"
  | "shares"
  | "engagement"
  | "fanvue_clicks";

export interface MetricBreakdownEntry {
  metric: ExplainableMetric;
  category: MetricCategory;
  available: boolean; // real data exists for this metric, for both the pattern and its baseline
  raw_value: number | null; // avg raw value across the pattern's posts
  baseline_value: number | null; // avg value across comparable posts (same post_type, same window)
  index: number | null; // raw_value / baseline_value — 1.0 = at baseline, >1 = above baseline
  unavailable_reason?: string;
}

// Which axis is actually driving above-baseline performance — always explicit, so a pattern
// never "wins" for an unstated reason (e.g. purely on Fanvue clicks while IG reach is flat).
export type WinningAxis = "platform" | "business" | "both" | "neither";

export interface PerformanceBreakdown {
  sample_size: number;
  comparable_sample_size: number; // size of the baseline group this was normalized against
  metrics: MetricBreakdownEntry[]; // always all ExplainableMetric entries, in fixed order
  platform_composite_index: number | null; // weighted avg of available platform metric indices
  business_conversion_index: number | null; // weighted avg of available business metric indices (today: fanvue_clicks alone)
  winning_axis: WinningAxis;
  post_ids: string[];
}

export interface ContentPattern {
  id: string; // deterministic hash of the descriptor
  descriptor: ContentDescriptor;
  status: ContentPatternStatus;
  performance: PerformanceBreakdown | null; // null when there is no scored post at all
  confidence_score: number; // 0..1, derived from sample size + consistency + the stronger axis
  source_post_ids: string[];
  parent_pattern_id?: string; // set when status === "evolution"
  evolved_dimension?: keyof ContentDescriptor; // which field was mutated to create this pattern
}

// Motion Intelligence — sub-layer. Ported from the seed Dynamic Motion Library concept in
// lib/creative_intelligence.py, minus the fake success_rate formula.
export interface MotionPattern {
  id: string;
  name: string;
  description: string;
  kling_prompt: string;
  duration_sec: number;
  origin: "seed" | "evolution";
  parent_pattern_id?: string;
  mutation_strategy?: "speed" | "intensity" | "timing" | "emphasis";
  // Empirical only — populated once posts using this motion have real metrics attached.
  performance?: PerformanceBreakdown | null;
  paired_content_pattern_ids: string[];
}

export interface MotionRecommendation {
  motion_pattern_id: string;
  // "paired": real posts link this motion to this content pattern with measured performance.
  // "fallback_unproven": no such link exists yet — this is always the safe default pattern,
  // never a preference inferred from anything. confidence_score is 0 in this case.
  status: "paired" | "fallback_unproven";
  reason: string;
  confidence_score: number;
}

// The primary output: what to make next, and why.
export interface NextContentRecommendation {
  rank: number;
  category: StrategyCategory;
  content_concept: string; // a short readable content-universe brief, not a tag concatenation
  why_selected: string;
  performance: PerformanceBreakdown | null; // the evidence behind why_selected, explicit
  // Mirrors performance.platform_composite_index / business_conversion_index / winning_axis —
  // surfaced at the top level too so a consumer never has to dig into `performance.metrics`
  // to answer "did this win on IG growth or on Fanvue clicks?".
  platform_composite_index: number | null;
  business_conversion_index: number | null;
  winning_axis: WinningAxis;
  source_pattern_ids: string[];
  objective: StrategyObjective; // chosen only from metrics that are available AND above baseline
  recommended_framing: {
    tier: StoryTier | null;
    moment_family: MomentFamily | null;
    location: string | null;
    mood: string | null;
    lighting_hint: string | null;
  };
  recommended_motion: MotionRecommendation | null;
  confidence_score: number;
}

export interface NextContentStrategy {
  character_id: string;
  generated_at: string;
  window_days: number;
  recommendations: NextContentRecommendation[];
  breakdown: { proven: number; evolution: number; experiment: number };
  data_status: "ok" | "insufficient_history"; // honest signal when there isn't enough real data yet
}

export interface PerformanceIntelligence {
  character_id: string;
  window_days: number;
  posts_analyzed: number;
  avg_growth_score: number;
  avg_reach: number;
  top_tier: StoryTier | null;
  patterns: ContentPattern[]; // proven + unproven, sorted by confidence_score desc
}
