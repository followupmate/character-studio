// RECOVERY phase 2 — CI_SCORING_FROZEN.
//
// The optimizer was running blind in a closed loop: growth_score is built almost entirely from
// views + interactions (every other signal is NULL — see lib/growthScore.ts and the phase 1B
// finding that follows/profile_visits are not even readable for reels), so it kept reinforcing
// yesterday's views. Views fell, the selection narrowed, and the published pool collapsed from 15
// archetypes to the 3 that happened to be ahead when the slide started.
//
// When frozen, every growth_score-derived preference is IGNORED for SELECTION:
//   - archetype weighting goes uniform across the whole chs_shot_archetypes pool
//   - the CI recommendation's preferredShotStyle stops nudging the archetype pick
//   - the CI preferredTier / growth_layer tier bias stop nudging tier selection
// growth_score itself keeps being COMPUTED AND WRITTEN exactly as before — this flag only stops it
// from steering what gets made. Cooldowns, slot family constraints and per-slot preferred/excluded
// archetype lists are craft rules, not performance signals, so they stay in force.
//
// Env var, not a per-character feature flag, because it is an operational kill switch for a
// recovery sprint — it must be flippable from Vercel without a DB write or a deploy.
export function isCiScoringFrozen(): boolean {
  return (process.env.CI_SCORING_FROZEN ?? "false").toLowerCase() === "true";
}
