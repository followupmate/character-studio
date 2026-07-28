import { supabase } from "@/lib/supabase";
import type { StoryTier, MagnetismLevel } from "@/lib/storyTier";
import { livedMomentsFanvueProbability } from "@/lib/storyTier";
import type { SensualVisualLanguage, SexAppealStyle, LuxurySeduction } from "@/lib/situationPlanner";
import type { PlayfulHotWorldProfile } from "@/lib/playfulHotWorldConfig";

// FANVUE LAYER (v1.1, flag: fanvue_drafts) — turn an IG scene into a monetization DRAFT (chs_fanvue_unlocks).
// Pure DB write, post-batch, NEVER auto-publishes and NEVER calls the Fanvue MCP. The draft proposes an
// intensity (soft/medium/strong) that the user approves later. IG stays public-safe; the stronger framing
// lives only on the draft row. The IG CTA is decoupled and rate-limited to ~25–35% of outputs.

interface TierRule {
  probability: number;
  intensity: "soft" | "medium" | "strong";
  unlock: "subscription" | "ppv" | "bundle";
  price: number;
  series: string[];
}

// Partial — historical tiers (grounded_routine, …) and any unlisted tier fall
// back to everyday_life at the lookup below. lived_moments modulates its own
// probability by magnetism level (see maybeCreateFanvueUnlock).
const FANVUE_RULES: Partial<Record<StoryTier, TierRule>> = {
  intimate_aesthetic: { probability: 0.85, intensity: "strong", unlock: "subscription", price: 9.99, series: ["Room 407", "After Hours", "Silk & Skin"] },
  luxe_car:           { probability: 0.80, intensity: "strong", unlock: "subscription", price: 9.99, series: ["Night Drive", "Passenger Princess", "After Dark"] },
  lived_moments:      { probability: 0.50, intensity: "medium", unlock: "subscription", price: 7.99, series: ["Off Duty", "The Rest of the Day", "Behind the Moment"] },
  wellness_fitness:   { probability: 0.45, intensity: "medium", unlock: "subscription", price: 7.99, series: ["Body Diary", "Locker Room", "Post-Workout"] },
  lifestyle_travel:   { probability: 0.55, intensity: "medium", unlock: "ppv",          price: 8.99, series: ["Pool Heat", "Room with a View", "Beach Heat"] },
  everyday_life:      { probability: 0.25, intensity: "soft",   unlock: "subscription", price: 6.99, series: ["White Shirt Morning", "Soft Home", "Slow Sunday"] },
};

const IG_CTAS = ["the full set is inside", "the rest is on fanvue", "uncut version inside", "you only get the rest somewhere else"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// IG CTA budget: keep CTAs on ~25–35% of recent outputs. Uses recent drafts as the denominator proxy.
async function shouldAttachIgCta(characterId: string): Promise<boolean> {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await supabase
    .from("chs_fanvue_unlocks")
    .select("ig_cta")
    .eq("character_id", characterId)
    .gte("created_at", since);
  const rows = data ?? [];
  if (rows.length < 4) return Math.random() < 0.30; // not enough history yet
  const withCta = rows.filter((r) => !!r.ig_cta).length;
  const ratio = withCta / rows.length;
  if (ratio < 0.25) return true;
  if (ratio > 0.35) return false;
  return Math.random() < 0.30;
}

interface StoryDayLike {
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
// the existing probability-gated draft mechanism below — it only means no continuation clause
// is added to the prompt text.
export interface SituationFanvueTension {
  potential: "none" | "soft" | "clear" | "strong";
  continuation?: string | null;
  withheld_element?: string | null;
}

// Extracted as a pure function specifically so it's unit-testable without Supabase (house
// convention: DB-touching code stays untested, pure helpers next to it are tested directly).
export function buildFanvuePrompt(
  series: string,
  storyDay: StoryDayLike,
  wardrobe: string,
  intensity: "soft" | "medium" | "strong",
  situationTension?: SituationFanvueTension,
  sensualVisualLanguage?: SensualVisualLanguage,
  sexAppealStyle?: SexAppealStyle,
  luxurySeduction?: LuxurySeduction,
  playfulHotWorld?: PlayfulHotWorldProfile
): string {
  const situationClause =
    situationTension && situationTension.potential !== "none" && situationTension.continuation
      ? ` ${situationTension.continuation}${situationTension.withheld_element ? ` (withheld from Instagram: ${situationTension.withheld_element})` : ""}`
      : "";
  // sensual_visual_language_v1 — the FULL object, not just wardrobe/body: gesture_or_action,
  // camera_relationship and exposure_boundary carry the continuation forward too, so the Fanvue
  // set stays visually/behaviorally continuous with today's IG moment, not a randomly bolder swap.
  const sensualClause = sensualVisualLanguage
    ? ` Sensual continuity: ${sensualVisualLanguage.wardrobe_signal}, emphasis on ${sensualVisualLanguage.body_emphasis}. She is ${sensualVisualLanguage.gesture_or_action}. Camera relationship: ${sensualVisualLanguage.camera_relationship}. Boundary: ${sensualVisualLanguage.exposure_boundary}.`
    : "";
  // sex_appeal_style_v1 (iteration 3) — same "thread the full declared style forward" pattern as
  // sensualClause above, one layer deeper (archetype/silhouette/leg visibility/facial energy/mode).
  const sexAppealClause = sexAppealStyle
    ? ` Style continuity: ${sexAppealStyle.outfit_archetype}, silhouette focus on ${sexAppealStyle.silhouette_focus}, legs ${sexAppealStyle.leg_visibility}. Facial energy: ${sexAppealStyle.facial_energy}. Seduction mode: ${sexAppealStyle.seduction_mode}.`
    : "";
  // luxury_seduction_v1 (iteration 4) — same "thread the full declared style forward" pattern,
  // one layer deeper (fashion direction/material/accessories/footwear/pose/body geometry/status).
  const luxuryClause = luxurySeduction
    ? ` Luxury continuity: ${luxurySeduction.fashion_direction}, in ${luxurySeduction.material_language}, with ${luxurySeduction.accessory_language} and ${luxurySeduction.footwear}. Pose: ${luxurySeduction.pose_archetype}. Body line: ${luxurySeduction.body_geometry}. Status context: ${luxurySeduction.social_status_signal}.`
    : "";
  // playful_hot_world_v1 (iteration 5) — same "thread forward" pattern, carrying the day's vibe
  // (mood/vitality/social pulse/season) so the Fanvue set stays tonally continuous.
  const playfulClause = playfulHotWorld
    ? ` Vibe continuity: ${playfulHotWorld.mood_temperature} mood, ${playfulHotWorld.vitality_level} energy, ${playfulHotWorld.social_pulse} pulse, ${playfulHotWorld.seasonality} season.`
    : "";
  return `Soul set for "${series}". Continue the SAME real moment as today (${storyDay.location ?? "scene"}${storyDay.moment_family ? `, ${storyDay.moment_family}` : ""}) — a more private/relaxed continuation of it, NOT a new lingerie/bedroom set.${situationClause}${sensualClause}${sexAppealClause}${luxuryClause}${playfulClause} ${wardrobe ? `Wardrobe: ${wardrobe}. ` : ""}Intensity ${intensity} — within Fanvue's tasteful adult range, no explicit unless approved. Keep faithful Vivienne identity.`;
}

export async function maybeCreateFanvueUnlock(args: {
  characterId: string;
  storyDayId: string;
  dailyPlanId: string;
  storyDay: StoryDayLike;
  sceneBriefJson: Record<string, unknown> | null;
  situationFanvueTension?: SituationFanvueTension;
  sensualVisualLanguage?: SensualVisualLanguage;
  sexAppealStyle?: SexAppealStyle;
  luxurySeduction?: LuxurySeduction;
  playfulHotWorld?: PlayfulHotWorldProfile;
}): Promise<{ created: boolean; id?: string }> {
  const tier = (args.storyDay.tier ?? "everyday_life") as StoryTier;
  const rule = FANVUE_RULES[tier] ?? FANVUE_RULES.everyday_life!;

  // lived_moments modulates its Fanvue probability by the day's magnetism level
  // (soft .30 → sensual .95; ≈0.4925 average, 0.50 fallback for old null rows).
  // Its draft intensity follows too.
  const magnetism = (args.storyDay.magnetism_level ?? null) as MagnetismLevel | null;
  const probability =
    tier === "lived_moments"
      ? livedMomentsFanvueProbability(magnetism)
      : rule.probability;
  const intensity: TierRule["intensity"] =
    tier === "lived_moments"
      ? (magnetism === "sensual" ? "strong" : magnetism === "flirty" ? "medium" : "soft")
      : rule.intensity;

  // Don't create two drafts for the same day; probability gate otherwise.
  const { data: existing } = await supabase
    .from("chs_fanvue_unlocks")
    .select("id")
    .eq("story_day_id", args.storyDayId)
    .limit(1);
  if (existing && existing.length > 0) return { created: false };
  if (Math.random() > probability) return { created: false };

  const series = pick(rule.series);
  const descriptor = (args.storyDay.hook_text || args.storyDay.location || args.storyDay.mood || "the full set").toString().toLowerCase();
  const wardrobe = typeof args.sceneBriefJson?.wardrobe_lock === "string" ? (args.sceneBriefJson.wardrobe_lock as string) : "";

  const attachCta = await shouldAttachIgCta(args.characterId);

  const row = {
    character_id: args.characterId,
    story_day_id: args.storyDayId,
    daily_plan_id: args.dailyPlanId,
    unlock_type: rule.unlock,
    series_name: series,
    title: `${series} — ${descriptor}`.slice(0, 120),
    teaser_text: args.storyDay.hook_text || (args.storyDay.ig_caption ?? "").slice(0, 80) || descriptor,
    sales_copy: `Today's ${tier.replace("_", " ")} moment, the version Instagram won't let her post. ${series} — full set inside.`,
    suggested_price: rule.price,
    intensity, // PROPOSED — user approves/edits before use
    ig_cta: attachCta ? pick(IG_CTAS) : null,
    fanvue_prompt: buildFanvuePrompt(series, args.storyDay, wardrobe, intensity, args.situationFanvueTension, args.sensualVisualLanguage, args.sexAppealStyle, args.luxurySeduction, args.playfulHotWorld),
    status: "draft" as const,
  };

  const { data, error } = await supabase.from("chs_fanvue_unlocks").insert(row).select("id").single();
  if (error) return { created: false };
  return { created: true, id: data.id as string };
}
