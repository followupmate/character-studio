import type { StoryTier } from "@/lib/storyTier";
import type { SensualVisualLanguage, SexAppealStyle, LuxurySeduction } from "@/lib/situationPlanner";
import type { PlayfulHotWorldProfile } from "@/lib/playfulHotWorldConfig";

// Shared primitives for both lib/fanvueUnlock.ts (legacy pipeline) and lib/fanvueContinuation.ts
// (fanvue_paid_continuation_v1). Lives in its own module — with no dependency on either — so the
// two pipelines can import from each other's neighbor without a circular import.

export interface TierRule {
  probability: number;
  intensity: "soft" | "medium" | "strong";
  unlock: "subscription" | "ppv" | "bundle";
  price: number;
  series: string[];
}

// Partial — historical tiers (grounded_routine, …) and any unlisted tier fall back to
// everyday_life at the lookup below. lived_moments modulates its own probability by magnetism
// level (see maybeCreateFanvueUnlock). Tier weights are the source of truth for whether a draft
// gets created at all — fanvue_paid_continuation_v1 reuses this baseline unchanged.
export const FANVUE_RULES: Partial<Record<StoryTier, TierRule>> = {
  intimate_aesthetic: { probability: 0.85, intensity: "strong", unlock: "subscription", price: 9.99, series: ["Room 407", "After Hours", "Silk & Skin"] },
  luxe_car:           { probability: 0.80, intensity: "strong", unlock: "subscription", price: 9.99, series: ["Night Drive", "Passenger Princess", "After Dark"] },
  lived_moments:      { probability: 0.50, intensity: "medium", unlock: "subscription", price: 7.99, series: ["Off Duty", "The Rest of the Day", "Behind the Moment"] },
  wellness_fitness:   { probability: 0.45, intensity: "medium", unlock: "subscription", price: 7.99, series: ["Body Diary", "Locker Room", "Post-Workout"] },
  lifestyle_travel:   { probability: 0.55, intensity: "medium", unlock: "ppv",          price: 8.99, series: ["Pool Heat", "Room with a View", "Beach Heat"] },
  everyday_life:      { probability: 0.25, intensity: "soft",   unlock: "subscription", price: 6.99, series: ["White Shirt Morning", "Soft Home", "Slow Sunday"] },
};

export interface StoryDayLike {
  tier: string | null;
  moment_family?: string | null;
  magnetism_level?: string | null;
  location: string | null;
  mood: string | null;
  ig_caption: string | null;
  hook_text: string | null;
}

// open_life_generation_v1 — advisory context only. When provided, threads the SAME event's
// continuation/withheld_element into the prompt so it stays causally linked to today's
// situation instead of a randomly-injected lingerie/bedroom variant. "none" never suppresses
// the probability-gated draft mechanism in maybeCreateFanvueUnlock — it only means no
// continuation clause is added to the prompt text.
export interface SituationFanvueTension {
  potential: "none" | "soft" | "clear" | "strong";
  continuation?: string | null;
  withheld_element?: string | null;
}

// Pure, exported clause builders — unit-testable without Supabase, and shared verbatim between
// the legacy single-prompt builder (buildFanvuePrompt) and the per-shot storyboard builder
// (buildFanvueContinuationPlan) so "continue the same declared style forward" isn't duplicated.
// Each returns "" when its input is absent.
export function situationTensionClause(situationTension?: SituationFanvueTension): string {
  return situationTension && situationTension.potential !== "none" && situationTension.continuation
    ? ` ${situationTension.continuation}${situationTension.withheld_element ? ` (withheld from Instagram: ${situationTension.withheld_element})` : ""}`
    : "";
}

// sensual_visual_language_v1 — the FULL object, not just wardrobe/body: gesture_or_action,
// camera_relationship and exposure_boundary carry the continuation forward too, so the Fanvue
// set stays visually/behaviorally continuous with today's IG moment, not a randomly bolder swap.
export function sensualVisualLanguageClause(sensualVisualLanguage?: SensualVisualLanguage): string {
  return sensualVisualLanguage
    ? ` Sensual continuity: ${sensualVisualLanguage.wardrobe_signal}, emphasis on ${sensualVisualLanguage.body_emphasis}. She is ${sensualVisualLanguage.gesture_or_action}. Camera relationship: ${sensualVisualLanguage.camera_relationship}. Boundary: ${sensualVisualLanguage.exposure_boundary}.`
    : "";
}

// sex_appeal_style_v1 (iteration 3) — same "thread the full declared style forward" pattern as
// sensualClause above, one layer deeper (archetype/silhouette/leg visibility/facial energy/mode).
export function sexAppealStyleClause(sexAppealStyle?: SexAppealStyle): string {
  return sexAppealStyle
    ? ` Style continuity: ${sexAppealStyle.outfit_archetype}, silhouette focus on ${sexAppealStyle.silhouette_focus}, legs ${sexAppealStyle.leg_visibility}. Facial energy: ${sexAppealStyle.facial_energy}. Seduction mode: ${sexAppealStyle.seduction_mode}.`
    : "";
}

// luxury_seduction_v1 (iteration 4) — same "thread the full declared style forward" pattern,
// one layer deeper (fashion direction/material/accessories/footwear/pose/body geometry/status).
export function luxurySeductionClause(luxurySeduction?: LuxurySeduction): string {
  return luxurySeduction
    ? ` Luxury continuity: ${luxurySeduction.fashion_direction}, in ${luxurySeduction.material_language}, with ${luxurySeduction.accessory_language} and ${luxurySeduction.footwear}. Pose: ${luxurySeduction.pose_archetype}. Body line: ${luxurySeduction.body_geometry}. Status context: ${luxurySeduction.social_status_signal}.`
    : "";
}

// playful_hot_world_v1 (iteration 5) — same "thread forward" pattern, carrying the day's vibe
// (mood/vitality/social pulse/season) so the Fanvue set stays tonally continuous.
export function playfulHotWorldClause(playfulHotWorld?: PlayfulHotWorldProfile): string {
  return playfulHotWorld
    ? ` Vibe continuity: ${playfulHotWorld.mood_temperature} mood, ${playfulHotWorld.vitality_level} energy, ${playfulHotWorld.social_pulse} pulse, ${playfulHotWorld.seasonality} season.`
    : "";
}
