import type { SexualEnergyLevel, MagnetismReason, ContinuityPhase } from "@/types";

// open_life_generation_v1 — cross-tier sexual-energy config. Deliberately its OWN module
// (not colocated in lib/storyTier.ts, which owns tier ROTATION weights) because this table
// is tuned independently from TIER_WEIGHTS and touches all 5 active tiers at once.
export type { SexualEnergyLevel, MagnetismReason };

const SEXUAL_ENERGY_LEVELS: SexualEnergyLevel[] = ["subtle", "warm", "playful", "provocative", "intimate"];

type ActiveTier = "lived_moments" | "everyday_life" | "wellness_fitness" | "intimate_aesthetic" | "luxe_car";

// Initial intensity distribution PER TIER (spec §7). NOT tier rotation weights — this is the
// mix of sexual-energy levels chosen AFTER a tier has already been selected. Each row sums to 1.0.
export const SEXUAL_ENERGY_RANGE: Record<ActiveTier, Record<SexualEnergyLevel, number>> = {
  everyday_life:      { subtle: 0.40, warm: 0.35, playful: 0.20, provocative: 0.05, intimate: 0.00 },
  lived_moments:      { subtle: 0.10, warm: 0.35, playful: 0.35, provocative: 0.20, intimate: 0.00 },
  wellness_fitness:   { subtle: 0.15, warm: 0.45, playful: 0.35, provocative: 0.05, intimate: 0.00 },
  luxe_car:           { subtle: 0.00, warm: 0.15, playful: 0.40, provocative: 0.40, intimate: 0.05 },
  intimate_aesthetic: { subtle: 0.00, warm: 0.05, playful: 0.15, provocative: 0.45, intimate: 0.35 },
};

// sensual_visual_language_v1 — iteration 2. A production dry-run showed sexual_energy staying
// metadata-only (validated as "provocative" but rendering as a neutral sweater-and-wine scene).
// Part of the fix is a higher-intensity distribution, tunable independently per character via
// the SAME feature flag that requires the sensual_visual_language fields (see
// lib/storyGeneration.ts's sensualLanguageOn) — NOT a replacement of SEXUAL_ENERGY_RANGE, which
// stays the default for every other character and for Vivien with the flag off.
export const SEXUAL_ENERGY_RANGE_INTENSIFIED: Record<ActiveTier, Record<SexualEnergyLevel, number>> = {
  everyday_life:      { subtle: 0.15, warm: 0.35, playful: 0.40, provocative: 0.10, intimate: 0.00 },
  lived_moments:      { subtle: 0.00, warm: 0.20, playful: 0.45, provocative: 0.35, intimate: 0.00 },
  wellness_fitness:   { subtle: 0.05, warm: 0.30, playful: 0.50, provocative: 0.15, intimate: 0.00 },
  luxe_car:           { subtle: 0.00, warm: 0.05, playful: 0.35, provocative: 0.50, intimate: 0.10 },
  intimate_aesthetic: { subtle: 0.00, warm: 0.00, playful: 0.10, provocative: 0.45, intimate: 0.45 },
};

function rangeFor(tier: ActiveTier, useIntensified?: boolean): Record<SexualEnergyLevel, number> {
  return (useIntensified ? SEXUAL_ENERGY_RANGE_INTENSIFIED : SEXUAL_ENERGY_RANGE)[tier];
}

// The 9 magnetism reasons a StoryDay's magnetic_hook must trace back to (spec §2). A situation
// whose only reason reduces to "she is attractive" is not a valid magnetism_reason value.
export const MAGNETISM_REASONS: MagnetismReason[] = [
  "physical_attraction",
  "playful_femininity",
  "private_access",
  "social_desirability",
  "body_confidence",
  "aspirational_lifestyle",
  "provocative_ambiguity",
  "intimate_curiosity",
  "adventurous_energy",
];

// Derived from SEXUAL_ENERGY_RANGE: the levels with non-zero weight for a tier. Used by
// lib/situationValidation.ts's sexualEnergyWithinTierRange check — e.g. everyday_life never
// allows "intimate", intimate_aesthetic never allows "subtle".
export function allowedSexualEnergyLevels(tier: ActiveTier, useIntensified?: boolean): SexualEnergyLevel[] {
  const row = rangeFor(tier, useIntensified);
  return SEXUAL_ENERGY_LEVELS.filter((l) => row[l] > 0);
}

export function isActiveTier(tier: string): tier is ActiveTier {
  return tier in SEXUAL_ENERGY_RANGE;
}

// Duplicated (not imported) from lib/storyTier.ts's private weightedFrom — importing it would
// create a storyTier.ts <-> sexualEnergyConfig.ts value cycle once storyTier.ts calls back into
// this module's sexualEnergyRangeGuidance(). Six lines; not worth the cycle risk.
function weightedFrom<T extends string>(weights: Record<T, number>, pool: T[], rng: () => number): T {
  const total = pool.reduce((s, k) => s + weights[k], 0);
  let r = rng() * total;
  for (const k of pool) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return pool[pool.length - 1];
}

// Soft frequency penalty for levels used in recent days — NOT a removal. A level used
// yesterday is heavily discounted; used within the last 3 days, lightly discounted.
function frequencyPenalty(level: SexualEnergyLevel, recentLevels: SexualEnergyLevel[]): number {
  if (recentLevels[0] === level) return 0.5;
  if (recentLevels.slice(0, 3).includes(level)) return 0.75;
  return 1;
}

// Small multiplicative nudge from the active micro-event's continuity phase (spec doplnenie #3).
// Deliberately gentle (±30% max) — the tier's base distribution stays dominant; this only leans
// the pick toward what the phase implies. aftermath (something already happened) leans toward
// warm/intimate; setup (anticipation) leans toward playful; event (in the middle of it) leans
// toward provocative. standalone / no phase → no nudge.
const CONTINUITY_PHASE_MODIFIER: Record<ContinuityPhase, Partial<Record<SexualEnergyLevel, number>>> = {
  standalone: {},
  setup: { playful: 1.25, warm: 1.1 },
  event: { provocative: 1.3, playful: 1.15 },
  aftermath: { warm: 1.2, intimate: 1.3, subtle: 1.1 },
};

export interface SexualEnergyPickContext {
  recentLevels?: SexualEnergyLevel[];
  continuityPhase?: ContinuityPhase;
}

// creative_intelligence_generation_v1: optional multiplicative nudge toward one CI-preferred
// level, same magnitude family as CONTINUITY_PHASE_MODIFIER above (that mechanism's own comment
// caps itself at "±30% max" — this reuses the same ceiling so CI is never a stronger lever than
// the existing continuity-phase nudge).
export type SexualEnergyBias = Partial<Record<SexualEnergyLevel, number>>;

// NOT a blind weighted random. Base = SEXUAL_ENERGY_RANGE[tier] (or the intensified table when
// useIntensified — iteration 2, character/flag-gated); softly penalizes recently-used levels;
// applies a small continuity-phase modifier; renormalizes ONLY across the tier's non-zero cells
// (a level with 0% base weight can never be picked); floors every surviving candidate so no
// single adjustment can zero out the whole pool.
export function pickSexualEnergyLevel(
  tier: ActiveTier,
  ctx: SexualEnergyPickContext = {},
  rng: () => number = Math.random,
  useIntensified?: boolean,
  ciBias?: SexualEnergyBias
): SexualEnergyLevel {
  const pool = allowedSexualEnergyLevels(tier, useIntensified);
  const base = rangeFor(tier, useIntensified);
  const recentLevels = ctx.recentLevels ?? [];
  const phaseMod = ctx.continuityPhase ? CONTINUITY_PHASE_MODIFIER[ctx.continuityPhase] : {};

  const FLOOR = 0.02;
  const adjusted: Record<SexualEnergyLevel, number> = SEXUAL_ENERGY_LEVELS.reduce(
    (acc, l) => ({ ...acc, [l]: 0 }),
    {} as Record<SexualEnergyLevel, number>
  );
  for (const level of pool) {
    const penalty = frequencyPenalty(level, recentLevels);
    const modifier = phaseMod[level] ?? 1;
    const ciModifier = ciBias?.[level] ? Math.max(0.7, Math.min(1.3, ciBias[level] as number)) : 1;
    adjusted[level] = Math.max(FLOOR, base[level] * penalty * modifier * ciModifier);
  }

  return weightedFrom(adjusted, pool, rng);
}

// Prompt text for the tier's allowed sexual-energy distribution — injected by
// lib/storyTier.ts's tierGuidance() as extras.sexualEnergyGuidance (passed in, not imported,
// to avoid a module cycle — see the weightedFrom duplication note above).
export function sexualEnergyRangeGuidance(tier: ActiveTier, useIntensified?: boolean): string {
  const row = rangeFor(tier, useIntensified);
  const parts = SEXUAL_ENERGY_LEVELS
    .filter((l) => row[l] > 0)
    .map((l) => `${l} ${Math.round(row[l] * 100)}%`)
    .join(", ");
  return `SEXUAL-ENERGY RANGE FOR THIS TIER (target distribution across days, not a per-day menu — pick ONE level for today that fits the situation): ${parts}. The chosen level must be EARNED by today's situation, never a bare label — it is expressed through posture, proximity, gaze, privacy or a decision she made, not primarily through how much skin is visible.`;
}
