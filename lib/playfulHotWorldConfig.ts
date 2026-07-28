import type { MoodTemperature, VitalityLevel, SocialPulse, Seasonality, ColorEnergy, FunFactor, ContinuityPhase } from "@/types";

// playful_hot_world_v1 — cross-tier "world energy" config. Deliberately its OWN module, not a
// widening of lib/sexualEnergyConfig.ts, for the same reason that file gives for staying
// independent from lib/storyTier.ts: sexualEnergyConfig.ts already carries an explicit
// cycle-avoidance rationale for duplicating weightedFrom rather than importing it; folding a
// second, larger (6-field) distribution mechanism into that file would blur its scope. Same
// posture here: pure, DB-agnostic, no imports from lib/storyTier.ts or lib/sexualEnergyConfig.ts.
export type { MoodTemperature, VitalityLevel, SocialPulse, Seasonality, ColorEnergy, FunFactor };

type ActiveTier = "lived_moments" | "everyday_life" | "wellness_fitness" | "intimate_aesthetic" | "luxe_car";
const ACTIVE_TIERS: ActiveTier[] = ["lived_moments", "everyday_life", "wellness_fitness", "intimate_aesthetic", "luxe_car"];

const MOOD_TEMPERATURE_VALUES: MoodTemperature[] = ["soft", "warm", "hot"];
const VITALITY_LEVEL_VALUES: VitalityLevel[] = ["calm", "alive", "playful", "electric"];
const SOCIAL_PULSE_VALUES: SocialPulse[] = ["private", "suggested_social", "social", "party_adjacent"];
const SEASONALITY_VALUES: Seasonality[] = ["neutral", "summer", "high_summer"];
const COLOR_ENERGY_VALUES: ColorEnergy[] = ["muted", "fresh", "vivid"];
const FUN_FACTOR_VALUES: FunFactor[] = ["low", "medium", "high"];

function uniformRange<T extends string>(weights: Record<T, number>): Record<ActiveTier, Record<T, number>> {
  return ACTIVE_TIERS.reduce((acc, t) => ({ ...acc, [t]: weights }), {} as Record<ActiveTier, Record<T, number>>);
}

// Deliberately bold starting weights (user-approved amendment, replacing an initial more
// cautious tier-differentiated draft): "today's problem is not too wild a world, it's the exact
// opposite" — cautious per-tier damping (e.g. a high `private`/`neutral`/`muted` share for
// intimate_aesthetic) would just recreate the same "quiet, closed-off, beige" failure mode for
// those tiers. One uniform table across all 5 active tiers. Each row sums to 1.0.
export const MOOD_TEMPERATURE_RANGE: Record<ActiveTier, Record<MoodTemperature, number>> = uniformRange({ soft: 0.10, warm: 0.45, hot: 0.45 });
export const VITALITY_LEVEL_RANGE: Record<ActiveTier, Record<VitalityLevel, number>> = uniformRange({ calm: 0.10, alive: 0.25, playful: 0.40, electric: 0.25 });
export const SOCIAL_PULSE_RANGE: Record<ActiveTier, Record<SocialPulse, number>> = uniformRange({ private: 0.10, suggested_social: 0.20, social: 0.40, party_adjacent: 0.30 });
export const SEASONALITY_RANGE: Record<ActiveTier, Record<Seasonality, number>> = uniformRange({ neutral: 0.10, summer: 0.45, high_summer: 0.45 });
export const COLOR_ENERGY_RANGE: Record<ActiveTier, Record<ColorEnergy, number>> = uniformRange({ muted: 0.10, fresh: 0.40, vivid: 0.50 });
export const FUN_FACTOR_RANGE: Record<ActiveTier, Record<FunFactor, number>> = uniformRange({ low: 0.10, medium: 0.35, high: 0.55 });

export function isActivePlayfulTier(tier: string): tier is ActiveTier {
  return ACTIVE_TIERS.includes(tier as ActiveTier);
}

// Duplicated (not imported) from lib/storyTier.ts's private weightedFrom / lib/sexualEnergyConfig.ts's
// own duplicate of it — same cycle-avoidance rationale as sexualEnergyConfig.ts's own comment on
// this exact function. Third copy in the project; accepted per established precedent, not a
// refactor opportunity for this iteration.
function weightedFrom<T extends string>(weights: Record<T, number>, pool: T[], rng: () => number): T {
  const total = pool.reduce((s, k) => s + weights[k], 0);
  let r = rng() * total;
  for (const k of pool) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return pool[pool.length - 1];
}

// Soft frequency penalty for values used in recent days — same shape as sexualEnergyConfig.ts's
// frequencyPenalty. A value used yesterday is heavily discounted; used within the last 3 days,
// lightly discounted.
function frequencyPenalty<T extends string>(value: T, recentValues: T[]): number {
  if (recentValues[0] === value) return 0.5;
  if (recentValues.slice(0, 3).includes(value)) return 0.75;
  return 1;
}

// Pacing boost (new mechanic, iteration 5) — a static weighted-random pick alone cannot
// guarantee 14-day aggregate floors/ceilings (e.g. a 10% weight on "calm" still has a real
// chance of landing 3+ times in 14 draws). Compares how many of the rolling window's entries
// already have this value against the expected count at this point (targetWeight × window
// length so far) and up-weights values currently behind pace. Only applied to
// vitality_level/social_pulse/seasonality (doplnenie #1/#9) — the three fields carrying
// explicit numeric acceptance criteria (directly, or via the environment-mix criteria).
function pacingBoost<T extends string>(value: T, recentValues: T[], targetWeight: number): number {
  if (recentValues.length === 0) return 1;
  const actualCount = recentValues.filter((v) => v === value).length;
  const expectedCount = targetWeight * recentValues.length;
  const deficit = expectedCount - actualCount;
  if (deficit <= 0) return 1;
  return 1 + Math.min(deficit / Math.max(expectedCount, 0.5), 1.5);
}

// Small multiplicative nudge from the active micro-event's continuity phase, mirroring
// lib/sexualEnergyConfig.ts's CONTINUITY_PHASE_MODIFIER (±30% max, base distribution stays
// dominant). Only applied to vitality_level — aftermath (something already happened) leans
// slightly calmer, setup/event (anticipation / in the middle of it) lean toward alive/electric.
const VITALITY_CONTINUITY_MODIFIER: Partial<Record<ContinuityPhase, Partial<Record<VitalityLevel, number>>>> = {
  standalone: {},
  setup: { playful: 1.2, electric: 1.1 },
  event: { electric: 1.3, playful: 1.15 },
  aftermath: { calm: 1.15, alive: 1.1 },
};

export interface PlayfulHotWorldSnapshot {
  mood_temperature?: MoodTemperature;
  vitality_level?: VitalityLevel;
  social_pulse?: SocialPulse;
  seasonality?: Seasonality;
  color_energy?: ColorEnergy;
  fun_factor?: FunFactor;
}

export interface PlayfulHotWorldPickContext {
  recentWindow?: PlayfulHotWorldSnapshot[]; // rolling ~14-generated-day window, most-recent-first
  continuityPhase?: ContinuityPhase;
}

export interface PlayfulHotWorldProfile {
  mood_temperature: MoodTemperature;
  vitality_level: VitalityLevel;
  social_pulse: SocialPulse;
  seasonality: Seasonality;
  color_energy: ColorEnergy;
  fun_factor: FunFactor;
}

const FLOOR = 0.02;

function pickOneDimension<T extends string>(
  values: T[],
  weights: Record<T, number>,
  recentWindow: PlayfulHotWorldSnapshot[],
  getField: (s: PlayfulHotWorldSnapshot) => T | undefined,
  usePacing: boolean,
  rng: () => number,
  extraModifier?: Partial<Record<T, number>>
): T {
  const recentValues = recentWindow.map(getField).filter((v): v is T => !!v);
  const adjusted = {} as Record<T, number>;
  for (const v of values) {
    const freqPenalty = frequencyPenalty(v, recentValues);
    const boost = usePacing ? pacingBoost(v, recentValues, weights[v]) : 1;
    const modifier = extraModifier?.[v] ?? 1;
    adjusted[v] = Math.max(FLOOR, weights[v] * freqPenalty * boost * modifier);
  }
  return weightedFrom(adjusted, values, rng);
}

// NOT six independent blind weighted-random picks. mood_temperature/color_energy/fun_factor get
// a soft recency penalty only (consistency/anti-repeat, no acceptance-criteria stakes).
// vitality_level/social_pulse/seasonality additionally get the pacing boost (doplnenie #9 — these
// carry the numeric floor/ceiling criteria) and, for vitality_level, the continuity-phase modifier.
export function pickPlayfulHotWorldProfile(
  tier: ActiveTier,
  ctx: PlayfulHotWorldPickContext = {},
  rng: () => number = Math.random
): PlayfulHotWorldProfile {
  const recentWindow = ctx.recentWindow ?? [];
  const vitalityModifier = ctx.continuityPhase ? VITALITY_CONTINUITY_MODIFIER[ctx.continuityPhase] : undefined;

  return {
    mood_temperature: pickOneDimension(MOOD_TEMPERATURE_VALUES, MOOD_TEMPERATURE_RANGE[tier], recentWindow, (s) => s.mood_temperature, false, rng),
    vitality_level: pickOneDimension(VITALITY_LEVEL_VALUES, VITALITY_LEVEL_RANGE[tier], recentWindow, (s) => s.vitality_level, true, rng, vitalityModifier),
    social_pulse: pickOneDimension(SOCIAL_PULSE_VALUES, SOCIAL_PULSE_RANGE[tier], recentWindow, (s) => s.social_pulse, true, rng),
    seasonality: pickOneDimension(SEASONALITY_VALUES, SEASONALITY_RANGE[tier], recentWindow, (s) => s.seasonality, true, rng),
    color_energy: pickOneDimension(COLOR_ENERGY_VALUES, COLOR_ENERGY_RANGE[tier], recentWindow, (s) => s.color_energy, false, rng),
    fun_factor: pickOneDimension(FUN_FACTOR_VALUES, FUN_FACTOR_RANGE[tier], recentWindow, (s) => s.fun_factor, false, rng),
  };
}

// Prompt text explaining the dictated values + (doplnenie #3) the seasonality→location and
// social_pulse→nightlife RULE lines — the primary lever for the environment-mix acceptance
// criteria, since no single day's validator can see the 14-day aggregate.
export function playfulHotWorldGuidance(tier: ActiveTier, profile: PlayfulHotWorldProfile): string {
  const lines: string[] = [
    `PLAYFUL/HOT WORLD FOR TODAY (dictated — do not choose different values): mood_temperature "${profile.mood_temperature}", vitality_level "${profile.vitality_level}", social_pulse "${profile.social_pulse}", seasonality "${profile.seasonality}", color_energy "${profile.color_energy}", fun_factor "${profile.fun_factor}".`,
  ];
  if (profile.seasonality === "summer" || profile.seasonality === "high_summer") {
    lines.push(`RULE: seasonality "${profile.seasonality}" means visual_execution.location MUST read as outdoor daylight — beach, pool, terrace, rooftop, promenade, sunlit street — never a generic interior.`);
  }
  if (profile.social_pulse === "social" || profile.social_pulse === "party_adjacent") {
    lines.push(`RULE: social_pulse "${profile.social_pulse}" means the situation should carry a nightlife/event/social framing — other people implied or visible at the edge of frame (never a second sharp face), music/energy/crowd context — not a solitary private moment.`);
  }
  if (profile.vitality_level === "playful" || profile.vitality_level === "electric") {
    lines.push(`RULE: vitality_level "${profile.vitality_level}" must show in facial_seduction/facial_energy as a genuine smile, laugh, or bright playful expression — not a controlled-serious luxury look.`);
  }
  if (profile.color_energy === "vivid" || profile.color_energy === "fresh") {
    lines.push(`Color priority for today: white, cream, black, tan, light denim, lime/green pool tones, swimwear colors, nightlife highlights, sunlit skin — avoid a monotone beige-on-beige palette.`);
  }
  return lines.join("\n");
}
