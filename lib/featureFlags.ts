// v1.1 feature flags — stored on chs_characters.feature_flags (jsonb), all default false.
// Every new layer (Life / Growth / Fanvue drafts / MCP audit) is gated by one of these, so a layer
// can be turned off per-character and the flow instantly reverts to the original behaviour (no DB rollback).
export type FeatureFlag = "life_layer" | "growth_layer" | "fanvue_drafts" | "mcp_audit";

export function isFlagOn(flags: unknown, flag: FeatureFlag): boolean {
  return !!flags && typeof flags === "object" && (flags as Record<string, unknown>)[flag] === true;
}
