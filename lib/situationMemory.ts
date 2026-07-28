import { supabase } from "@/lib/supabase";
import type { SexualEnergyLevel, MagnetismReason, ContinuityPhase, MoodTemperature, VitalityLevel, SocialPulse, Seasonality, ColorEnergy, FunFactor } from "@/types";
import { normalizeOutfitArchetypeFamily, normalizePoseArchetype, classifyOutfitCategory, isQuietIndoorBeigeDay, type OutfitCategory, type GenerativeSituation } from "@/lib/situationPlanner";

// open_life_generation_v1 — 14-20 day anti-repeat memory. ADDITIVE to the 7 existing shallow-
// lookback mechanisms already in lib/storyTier.ts / lib/stylingDeck.ts / lib/archetypeDeck.ts /
// lib/fanvueUnlock.ts — this module does not replace any of them, it tracks the NEW structured
// dimensions the situation planner introduces. DB-read vs pure split mirrors pickTier()
// (DB)/weightedFrom() (pure) in lib/storyTier.ts, so the pure half stays unit-testable without
// Supabase.

// Deliberately widened with `| string` — the LLM may tag a new cliché not in this seed list.
// Extend SEXUAL_CLICHES over time; this is a soft-penalty list, never a hard ban (a hard-ban
// list risks exhausting the generation search space, which the product spec explicitly forbids).
export const SEXUAL_CLICHES = [
  "mirror_selfie",
  "strap_adjustment",
  "robe_opening",
  "kneeling_on_bed",
  "over_shoulder_bed",
  "legs_across_car_seat",
  "pool_edge_pose",
  "oversized_shirt_bare_legs",
  "wet_hair_closeup",
  "heels_removed_aftermath",
  "cleavage_close_crop",
  "bedroom_direct_gaze",
] as const;
export type KnownSexualCliche = (typeof SEXUAL_CLICHES)[number];
export type SexualCliche = KnownSexualCliche | string;

export interface SituationMemorySnapshot {
  date: string;
  tier: string;
  life_domain?: string;
  location_family?: string;
  activity?: string;
  reason?: string;
  social_context_mode?: string;
  time_of_day?: string;
  continuity_phase?: ContinuityPhase;
  magnetism_reason?: MagnetismReason;
  sexual_energy_level?: SexualEnergyLevel;
  sexual_expression_family?: string;
  /** sex_appeal_style_v1 (iteration 3) — normalized via normalizeOutfitArchetypeFamily() from
   * situation.sex_appeal_style.outfit_archetype; undefined for pre-iteration-3 rows/flag-off days. */
  outfit_family?: string;
  /** luxury_seduction_v1 (iteration 4) — normalized via normalizeOutfitArchetypeFamily() from
   * situation.luxury_seduction.fashion_direction (falling back to sex_appeal_style.outfit_archetype
   * when fashion_direction doesn't match a known family). Feeds both the soft dims-based nudge
   * below AND (via a 14-day-slice in lib/storyGeneration.ts) the hard repeat-cap validation. */
  fashion_direction_family?: string;
  /** luxury_seduction_v1 (iteration 4) — normalized via normalizePoseArchetype() from
   * situation.luxury_seduction.pose_archetype. */
  pose_archetype_family?: string;
  /** playful_hot_world_v1 (iteration 5) — extracted directly from situation.playful_hot_world;
   * undefined for pre-iteration-5 rows/flag-off days. */
  mood_temperature?: MoodTemperature;
  vitality_level?: VitalityLevel;
  social_pulse?: SocialPulse;
  seasonality?: Seasonality;
  color_energy?: ColorEnergy;
  fun_factor?: FunFactor;
  /** playful_hot_world_v1 — via classifyOutfitCategory(fashion_direction_family). */
  outfit_category?: OutfitCategory;
  /** playful_hot_world_v1 — via isQuietIndoorBeigeDay(). */
  is_quiet_indoor_beige?: boolean;
  shot_family?: string;
  dominant_reality_detail?: string;
  fanvue_continuation_type?: string;
  sexual_cliches: SexualCliche[];
}

// DB-touching — NOT unit tested (house convention: pickTier/getGrowthBias/getLatestLifeState
// are DB-bound and untested the same way). Reads chs_story_days.scene->situation for the
// lookback window; rows without a `situation` (old rows, or flag-off days) are skipped, not
// errored — mirrors extractSituation()'s defensive-parse contract in lib/situationPlanner.ts.
export async function getSituationMemory(characterId: string, lookbackDays = 18): Promise<SituationMemorySnapshot[]> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("date, tier, scene")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(lookbackDays);

  const rows = (data ?? []) as Array<{ date: string; tier: string | null; scene: Record<string, unknown> | null }>;
  const snapshots: SituationMemorySnapshot[] = [];

  for (const row of rows) {
    const situation = row.scene?.situation as Record<string, unknown> | null | undefined;
    if (!situation || typeof situation !== "object") continue;
    const sexualEnergy = (situation.sexual_energy as Record<string, unknown> | undefined) ?? {};
    const fanvueTension = (situation.fanvue_tension as Record<string, unknown> | undefined) ?? {};
    const visualExecution = (situation.visual_execution as Record<string, unknown> | undefined) ?? {};
    const sexAppealStyle = (situation.sex_appeal_style as Record<string, unknown> | undefined) ?? {};
    const luxurySeduction = (situation.luxury_seduction as Record<string, unknown> | undefined) ?? {};
    const playfulHotWorld = (situation.playful_hot_world as Record<string, unknown> | undefined) ?? {};
    const fashionDirectionFamily =
      normalizeOutfitArchetypeFamily(typeof luxurySeduction.fashion_direction === "string" ? (luxurySeduction.fashion_direction as string) : undefined) ??
      normalizeOutfitArchetypeFamily(typeof sexAppealStyle.outfit_archetype === "string" ? (sexAppealStyle.outfit_archetype as string) : undefined) ??
      undefined;
    snapshots.push({
      date: row.date,
      tier: row.tier ?? "",
      life_domain: typeof situation.life_domain === "string" ? situation.life_domain : undefined,
      location_family: typeof visualExecution.location === "string" ? visualExecution.location : undefined,
      activity: typeof situation.activity === "string" ? situation.activity : undefined,
      reason: typeof situation.reason === "string" ? situation.reason : undefined,
      social_context_mode:
        typeof (situation.social_context as Record<string, unknown> | undefined)?.mode === "string"
          ? ((situation.social_context as Record<string, unknown>).mode as string)
          : undefined,
      time_of_day: typeof visualExecution.time_of_day === "string" ? visualExecution.time_of_day : undefined,
      continuity_phase: typeof situation.continuity_phase === "string" ? (situation.continuity_phase as ContinuityPhase) : undefined,
      magnetism_reason: typeof situation.magnetism_reason === "string" ? (situation.magnetism_reason as MagnetismReason) : undefined,
      sexual_energy_level: typeof sexualEnergy.level === "string" ? (sexualEnergy.level as SexualEnergyLevel) : undefined,
      sexual_expression_family: typeof sexualEnergy.expression === "string" ? (sexualEnergy.expression as string) : undefined,
      outfit_family:
        normalizeOutfitArchetypeFamily(typeof sexAppealStyle.outfit_archetype === "string" ? (sexAppealStyle.outfit_archetype as string) : undefined) ??
        undefined,
      fashion_direction_family: fashionDirectionFamily,
      pose_archetype_family:
        normalizePoseArchetype(typeof luxurySeduction.pose_archetype === "string" ? (luxurySeduction.pose_archetype as string) : undefined) ?? undefined,
      mood_temperature: typeof playfulHotWorld.mood_temperature === "string" ? (playfulHotWorld.mood_temperature as MoodTemperature) : undefined,
      vitality_level: typeof playfulHotWorld.vitality_level === "string" ? (playfulHotWorld.vitality_level as VitalityLevel) : undefined,
      social_pulse: typeof playfulHotWorld.social_pulse === "string" ? (playfulHotWorld.social_pulse as SocialPulse) : undefined,
      seasonality: typeof playfulHotWorld.seasonality === "string" ? (playfulHotWorld.seasonality as Seasonality) : undefined,
      color_energy: typeof playfulHotWorld.color_energy === "string" ? (playfulHotWorld.color_energy as ColorEnergy) : undefined,
      fun_factor: typeof playfulHotWorld.fun_factor === "string" ? (playfulHotWorld.fun_factor as FunFactor) : undefined,
      outfit_category: classifyOutfitCategory(fashionDirectionFamily) ?? undefined,
      is_quiet_indoor_beige: isQuietIndoorBeigeDay(situation as unknown as GenerativeSituation),
      dominant_reality_detail: typeof situation.reality_detail === "string" ? situation.reality_detail : undefined,
      fanvue_continuation_type: typeof fanvueTension.potential === "string" ? (fanvueTension.potential as string) : undefined,
      sexual_cliches: Array.isArray(situation.sexual_cliches) ? (situation.sexual_cliches as string[]) : [],
    });
  }

  return snapshots;
}

export interface FrequencyPenalties {
  preferUnused: string[]; // dimension values not seen in the last 3 days
  avoidCapped: string[]; // dimension values that hit the 2x-in-10-days cap
  avoidDominantSexualEnergyMechanism: string | null; // yesterday's dominant hook mechanism, if any
}

// Pure. A frequency PENALTY, never a removal — callers use this to bias the prompt, not to
// filter the candidate space (a hard filter risks exhausting generation, which the spec forbids).
export function computeFrequencyPenalties(history: SituationMemorySnapshot[]): FrequencyPenalties {
  const last3 = history.slice(0, 3);
  const last10 = history.slice(0, 10);

  const dims: Array<keyof SituationMemorySnapshot> = [
    "life_domain",
    "activity",
    "location_family",
    "magnetism_reason",
    "sexual_energy_level",
    "outfit_family",
    "fashion_direction_family",
    "pose_archetype_family",
  ];
  const usedLast3 = new Set<string>();
  for (const snap of last3) {
    for (const dim of dims) {
      const v = snap[dim];
      if (typeof v === "string" && v) usedLast3.add(v);
    }
  }

  const countsLast10 = new Map<string, number>();
  for (const snap of last10) {
    for (const dim of dims) {
      const v = snap[dim];
      if (typeof v === "string" && v) countsLast10.set(v, (countsLast10.get(v) ?? 0) + 1);
    }
  }
  const avoidCapped = Array.from(countsLast10.entries())
    .filter(([, count]) => count >= 2)
    .map(([value]) => value);

  const preferUnused = Array.from(countsLast10.keys()).filter((v) => !usedLast3.has(v));

  const yesterday = history[0];
  const avoidDominantSexualEnergyMechanism = yesterday?.sexual_energy_level ?? null;

  return { preferUnused, avoidCapped, avoidDominantSexualEnergyMechanism };
}

export interface ClichePenalty {
  cliche: string;
  daysSinceLastUse: number;
}

// Pure. Never removes a cliché from the possible set — returns a penalty list the prompt can
// use to say "softly avoid", not a hard filter.
export function softAvoidCliches(history: SituationMemorySnapshot[], lookbackDays = 5): ClichePenalty[] {
  const recent = history.slice(0, lookbackDays);
  const seen = new Map<string, number>();
  recent.forEach((snap, i) => {
    for (const c of snap.sexual_cliches) {
      if (!seen.has(c)) seen.set(c, i);
    }
  });
  return Array.from(seen.entries()).map(([cliche, daysSinceLastUse]) => ({ cliche, daysSinceLastUse }));
}

// playful_hot_world_v1 (iteration 5, doplnenie #4) — a soft nudge only, never a hard block (same
// "one day can't verify a 14-day aggregate" limitation as everywhere else in this module). Direct
// pickup of iteration 4's own report finding: "category diversity not guaranteed by the
// per-family cap alone... candidate for iteration 5 if the dry run shows it's still needed" — it
// did. Target counts per 14 days mirror the outfit-mix spec (3-4 social/evening, 3-4 casual-sexy,
// 2-3 swim/pool, 2 body-confidence-active, 2 intimate/private) rounded down to the floor of each
// range; scaled proportionally when history14d is shorter than 14 days (early in a run).
const OUTFIT_CATEGORY_TARGETS_PER_14: Record<OutfitCategory, number> = {
  social_evening: 3,
  casual_sexy: 3,
  swim_pool: 2,
  body_confidence_active: 2,
  intimate_private: 2,
};

export interface OutfitCategoryNudges {
  underQuotaCategories: OutfitCategory[];
}

export function outfitCategoryNudges(history14d: SituationMemorySnapshot[]): OutfitCategoryNudges {
  const counts: Record<OutfitCategory, number> = { social_evening: 0, casual_sexy: 0, swim_pool: 0, body_confidence_active: 0, intimate_private: 0 };
  for (const s of history14d) {
    if (s.outfit_category) counts[s.outfit_category]++;
  }
  const underQuotaCategories = (Object.keys(OUTFIT_CATEGORY_TARGETS_PER_14) as OutfitCategory[]).filter((cat) => {
    const expected = (OUTFIT_CATEGORY_TARGETS_PER_14[cat] / 14) * history14d.length;
    return counts[cat] < expected;
  });
  return { underQuotaCategories };
}

export interface WeeklyBalanceNudges {
  needsSocialDay: boolean;
  needsMovementOrNewEnvironmentDay: boolean;
  needsProvocativeOrIntimateDay: boolean;
  needsIntimateHighlight: boolean;
  locationFamilyCapHit: boolean;
  consecutiveNightCapHit: boolean;
  needsCalmerContrastDay: boolean;
  needsSpontaneousDay: boolean;
}

// Pure. Operates on a 7-day rolling window. Explicitly does NOT touch pickTier/TIER_WEIGHTS —
// these are soft nudges the situation planner may use when choosing life_domain/situation/
// continuation for an ALREADY-selected tier, never a tier-selection override (spec §8/§12).
export function weeklyBalanceNudges(history7d: SituationMemorySnapshot[]): WeeklyBalanceNudges {
  const socialDays = history7d.filter((s) => s.social_context_mode && s.social_context_mode !== "alone").length;
  const movementDomains = new Set(["movement_and_transit", "beach_pool_water", "wellness_and_body", "nightlife_and_social_events"]);
  const movementDays = history7d.filter((s) => s.life_domain && movementDomains.has(s.life_domain)).length;
  const strongEnergyDays = history7d.filter((s) => s.sexual_energy_level === "provocative" || s.sexual_energy_level === "intimate").length;
  const intimateTierDays = history7d.filter((s) => s.tier === "intimate_aesthetic").length;

  const locationCounts = new Map<string, number>();
  for (const s of history7d) {
    if (s.location_family) locationCounts.set(s.location_family, (locationCounts.get(s.location_family) ?? 0) + 1);
  }
  const locationFamilyCapHit = Array.from(locationCounts.values()).some((count) => count > 2);

  let consecutiveNights = 0;
  let maxConsecutiveNights = 0;
  for (const s of history7d.slice().reverse()) {
    if (s.time_of_day === "night") {
      consecutiveNights++;
      maxConsecutiveNights = Math.max(maxConsecutiveNights, consecutiveNights);
    } else {
      consecutiveNights = 0;
    }
  }

  const calmDays = history7d.filter((s) => s.sexual_energy_level === "subtle" || s.sexual_energy_level === "warm").length;
  const standaloneDays = history7d.filter((s) => s.continuity_phase === "standalone" || !s.continuity_phase).length;

  return {
    needsSocialDay: socialDays < 2,
    needsMovementOrNewEnvironmentDay: movementDays < 2,
    needsProvocativeOrIntimateDay: strongEnergyDays < 2,
    needsIntimateHighlight: intimateTierDays === 0,
    locationFamilyCapHit,
    consecutiveNightCapHit: maxConsecutiveNights >= 2,
    needsCalmerContrastDay: calmDays === 0 && history7d.length >= 5,
    needsSpontaneousDay: standaloneDays === history7d.length && history7d.length >= 5,
  };
}

// Pure. Formats the three pure results above into one prompt text block — parallel in spirit
// to lib/storyTier.ts's driftSeedGuidance() / lib/lifeState.ts's lifeContextBlock().
export function situationMemoryGuidance(
  penalties: FrequencyPenalties,
  cliches: ClichePenalty[],
  nudges: WeeklyBalanceNudges,
  outfitNudges?: OutfitCategoryNudges
): string {
  const lines: string[] = ["ANTI-REPEAT MEMORY (soft preferences, never hard bans):"];

  if (penalties.avoidCapped.length > 0) {
    lines.push(`- These have already appeared 2+ times in the last 10 days — prefer something else: ${penalties.avoidCapped.join(", ")}`);
  }
  if (penalties.avoidDominantSexualEnergyMechanism) {
    lines.push(`- Yesterday's dominant sexual-energy level was "${penalties.avoidDominantSexualEnergyMechanism}" — avoid it as today's dominant hook again if the situation allows a different one.`);
  }
  if (cliches.length > 0) {
    const recentCliches = cliches.filter((c) => c.daysSinceLastUse <= 1).map((c) => c.cliche);
    if (recentCliches.length > 0) {
      lines.push(`- Softly avoid repeating as today's dominant visual mechanism (used yesterday, not banned — a different framing is welcome): ${recentCliches.join(", ")}`);
    }
  }

  const nudgeLines: string[] = [];
  if (nudges.needsSocialDay) nudgeLines.push("a socially-implied moment (someone else present or implied) is under-represented this week");
  if (nudges.needsMovementOrNewEnvironmentDay) nudgeLines.push("movement / water / a new environment is under-represented this week");
  if (nudges.needsProvocativeOrIntimateDay) nudgeLines.push("provocative-or-intimate sexual energy is under-represented this week");
  if (nudges.needsIntimateHighlight) nudgeLines.push("no intimate_aesthetic highlight has landed recently — one is due when the tier naturally selects it");
  if (nudges.locationFamilyCapHit) nudgeLines.push("one location family has already appeared 3+ times this week — prefer a different one");
  if (nudges.consecutiveNightCapHit) nudgeLines.push("two dominant-night days have already run back to back — a daytime moment would help");
  if (nudges.needsCalmerContrastDay) nudgeLines.push("no calmer/contrast moment this week — a quieter subtle/warm day would help");
  if (nudges.needsSpontaneousDay) nudgeLines.push("nothing spontaneous or plan-changing this week — a moment where she tries something new or changes her plan would help");

  if (nudgeLines.length > 0) {
    lines.push("- Weekly balance (bias the life_domain/situation/continuation choice, never the tier itself): " + nudgeLines.join("; ") + ".");
  }

  if (outfitNudges && outfitNudges.underQuotaCategories.length > 0) {
    lines.push(`- Outfit-mix balance (14-day rolling): under quota on ${outfitNudges.underQuotaCategories.join(", ")} — prefer a fashion_direction/outfit_archetype in one of these categories today if the situation allows it, without forcing an implausible outfit.`);
  }

  return lines.join("\n");
}
