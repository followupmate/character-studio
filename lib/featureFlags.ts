// v1.2 feature flags — stored on chs_characters.feature_flags (jsonb), all default false.
// Every new layer (Life / Growth / Fanvue drafts / MCP audit / Story Engine arcs) is gated by one of these, so a layer
// can be turned off per-character and the flow instantly reverts to the original behaviour (no DB rollback).
export type FeatureFlag = "life_layer" | "growth_layer" | "fanvue_drafts" | "mcp_audit" | "discovery_mode" | "open_life_generation_v1" | "sensual_visual_language_v1" | "sex_appeal_style_v1" | "luxury_seduction_v1" | "playful_hot_world_v1" | "fanvue_paid_continuation_v1" | "creative_intelligence_generation_v1" | "prompt_director_v1" | "arc_planner_v1" | "serial_captions_v1" | "storyboard_reel_v1" | "fanvue_arc_funnel_v1" | "arc_analytics_v1" | "luxury_world_v1" | "prompt_writer_v1";

export function isFlagOn(flags: unknown, flag: FeatureFlag): boolean {
  return !!flags && typeof flags === "object" && (flags as Record<string, unknown>)[flag] === true;
}
