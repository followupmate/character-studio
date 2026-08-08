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
  total_interactions?: number;
  avg_watch_time_sec?: number; // reels only — see igAnalyticsAdapter.ts
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
  | "total_interactions"
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

// One real contributing post: its own descriptor AND its own reach — kept together so a
// recommendation slot can cite "this exact real post" as scene-specific evidence, distinct
// from the pattern's aggregate confidence (see NextContentRecommendation.scene_evidence).
export interface PatternSourceEntry {
  post_id: string;
  descriptor: ContentDescriptor;
  reach: number | null;
}

export interface ContentPattern {
  id: string; // deterministic hash of the descriptor
  descriptor: ContentDescriptor; // representative (first) source post's descriptor
  // Every contributing post, own descriptor + own reach — used so multiple recommendation
  // slots drawn from the same winning pattern can each ground themselves in a DIFFERENT real
  // source post (real location/mood text, real reach) instead of repeating one generic label.
  sources: PatternSourceEntry[];
  status: ContentPatternStatus;
  performance: PerformanceBreakdown | null; // null when there is no scored post at all
  // "Direction confidence" — how much this WHOLE pattern is trusted (sample size + consistency
  // + performance). Deliberately NOT a per-scene score — see NextContentRecommendation's split.
  confidence_score: number;
  // The single best-performing source post (by reach) — cited as concrete evidence
  // ("strongest source Reel reached 123.7k") instead of only an abstract index.
  strongest_source: { post_id: string; reach: number | null } | null;
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

// Motion Intelligence's own recommendation ONLY — a Kling motion-pattern suggestion (camera
// movement/timing), never to be conflated with `shot_style` below (which is purely descriptive
// content metadata, not a Motion Intelligence output). Always flagged unproven until real
// motion/content pairing data exists (see motionIntelligence.ts's integration-gap note).
export interface MotionRecommendation {
  motion_pattern_id: string;
  name: string; // human name, e.g. "The Natural Glance" — never the raw id in primary UI
  // "paired": real posts link this motion to this content pattern with measured performance.
  // "fallback_unproven": no such link exists yet — this is always the safe default pattern,
  // never a preference inferred from anything. confidence_score is 0 in this case.
  status: "paired" | "fallback_unproven";
  reason: string; // human sentence, e.g. "Motion suggestion — not enough historical data yet."
  confidence_score: number;
}

// "direct": this exact scene IS one specific real source post — scene_evidence cites its own
// reach. "derived": this scene has no individual measurement of its own (evolution slots,
// synthetically varying one dimension of a proven pattern) — inherits trust from the parent
// direction, but must never display as if it were itself measured against baseline.
export type EvidenceLevel = "direct" | "derived";

// The primary output: what to make next, and why. Every field here is meant to be readable
// on its own — no ID or index needs decoding to understand a recommendation.
export interface NextContentRecommendation {
  rank: number;
  category: StrategyCategory;
  scene: string; // concrete, creative scene grounded in ONE real source post's own location
  // text — never an algorithm description (no "vary X while keeping the formula" here; that
  // belongs in source_evidence, see strategyGenerator.ts).
  why: string; // axis-aware human sentence: won on IG growth, Fanvue conversion, both, or neither
  objective: StrategyObjective; // chosen only from metrics that are available AND above baseline
  visual_direction: string; // human sentence built from that source post's mood/energy
  shot_style: string | null; // e.g. "Walking" — descriptive content metadata (shot_archetype), NOT a Motion Intelligence output
  motion: MotionRecommendation | null;
  source_evidence: string; // e.g. "Derived from 6 intimate-aesthetic posts; strongest source Reel reached 123.7k."
  // "Direction confidence" — mirrors the parent pattern's confidence_score. A modest number
  // here (e.g. 30%) reflects limited sample size, not disagreement with "proven" — it answers
  // "how sure are we overall", not "did this scene individually prove itself".
  confidence_score: number;
  evidence_level: EvidenceLevel;
  // Set only when evidence_level === "direct": the ONE real post this scene is grounded in,
  // and its own reach — the concrete, scene-specific counterpart to confidence_score above.
  scene_evidence: { post_id: string; reach: number | null } | null;

  // Advanced/debug layer — not meant for the primary UI, kept for the <details> analytics view.
  performance: PerformanceBreakdown | null;
  platform_composite_index: number | null;
  business_conversion_index: number | null;
  winning_axis: WinningAxis;
  source_pattern_ids: string[];
  recommended_framing: {
    tier: StoryTier | null;
    moment_family: MomentFamily | null;
    location: string | null;
    activity: string | null;
    mood: string | null;
    sexual_energy_level: string | null;
    lighting_hint: string | null;
  };
}

export interface NextContentStrategy {
  character_id: string;
  generated_at: string;
  window_days: number;
  recommendations: NextContentRecommendation[];
  breakdown: { proven: number; evolution: number; experiment: number };
  data_status: "ok" | "insufficient_history"; // honest signal when there isn't enough real data yet
}

// One concrete winning post — the primary "what actually worked" unit, never averaged away
// inside a pattern. `performance` here normalizes THIS ONE post (sample_size=1) against the
// same comparable-post baseline the pattern layer uses.
export interface TopPost {
  post_id: string;
  media_url: string | null;
  thumbnail_url: string | null; // usually null today — chs_media doesn't generate stills for reels yet
  post_type: string;
  posted_at: string | null;
  tier: StoryTier | null;
  location: string | null;
  // Raw display facts, not baseline-compared — views/likes/comments aren't part of the scored
  // metric set (see scoring.ts), so they live here directly rather than in `performance.metrics`.
  views: number | null;
  likes: number | null;
  comments: number | null;
  performance: PerformanceBreakdown;
  why_interesting: string; // e.g. "This Reel reached 8.4x more people than a typical post and generated 4.1x more saves."
}

// A human-readable "what's working" insight — one real content pattern, described with
// whatever real tagging dimensions it actually has (never invented for dimensions it lacks).
export interface WhatIsWorkingInsight {
  pattern_id: string;
  label: string; // e.g. "Intimate aesthetic · walking motion"
  detail: string; // human sentence, axis-aware
  platform_index: number | null;
  business_index: number | null;
  confidence_score: number;
  sample_size: number;
  tagging_note?: string; // set when most descriptor dimensions are null: "Not enough historical tagging..."
}

export interface PerformanceIntelligence {
  character_id: string;
  window_days: number;
  posts_analyzed: number;
  avg_growth_score: number;
  avg_reach: number;
  median_reach: number;
  best_direction_label: string | null; // human label of the top pattern, e.g. "Intimate aesthetic"
  top_tier: StoryTier | null;
  patterns: ContentPattern[]; // proven + unproven, sorted by confidence_score desc
  top_posts: TopPost[]; // top 10, sorted by reach desc — the concrete winners
  what_is_working: WhatIsWorkingInsight[]; // 3-5 proven patterns, described humanly
}
