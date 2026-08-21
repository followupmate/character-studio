// §21/§22 — deterministic minimal action derived from the reel_video slot's own "motion" family
// archetype (chs_shot_archetypes) — no LLM call, no invention. Extracted into its own pure module
// (no server-only imports) so it can be shared by lib/dailyBatch.ts (server, automated daily
// batch), app/api/characters/prompt-director-preview/route.ts (server) AND
// components/dashboard/GenerationControls.tsx (CLIENT — importing lib/dailyBatch.ts directly would
// pull its @/lib/supabase import into the browser bundle).
export const REEL_ARCHETYPE_ACTION: Record<string, string> = {
  walking_motion: "she walks, continuing forward motion",
  gesture_motion: "she makes a single small, self-contained gesture — turning her head, raising a cup, adjusting a sleeve",
  light_motion: "light shifts across her — she stays relatively still while the environment moves",
};

export function plannedActionForReelArchetype(archetypeId: string | undefined): string | undefined {
  return archetypeId ? REEL_ARCHETYPE_ACTION[archetypeId] : undefined;
}
