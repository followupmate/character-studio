import type { ContentDescriptor, StoryTier, MomentFamily } from "./types";

// Turns a ContentDescriptor into a readable content-universe/scene brief — not a mechanical
// `tier_moment_family_location` tag join. This is what a human (or, later, the generation
// pipeline) needs to understand what the recommendation actually is: a describable scene, not
// a slug. Only composes from fields the descriptor actually has — never invents specifics
// (no imagined locations, props, or story beats beyond what real production data recorded).

const TIER_LABELS: Record<StoryTier, string> = {
  lived_moments: "A lived-in, spontaneous moment",
  everyday_life: "An everyday-life scene",
  wellness_fitness: "A wellness/fitness moment",
  intimate_aesthetic: "An intimate aesthetic moment",
  luxe_car: "A luxury car moment",
  lifestyle_travel: "A lifestyle travel scene",
  grounded_routine: "A grounded routine scene",
  cinematic_melancholy: "A cinematic, melancholic scene",
  incidental_wrongness: "An incidental-wrongness scene",
  entropy: "An entropy-tier scene",
};

const MOMENT_LABELS: Record<MomentFamily, string> = {
  home_private: "at home, private",
  friends_fun: "out with friends",
  vacation_beach_water: "on vacation by the beach or water",
  pets_spontaneous: "a spontaneous moment with pets",
  city_transit: "in transit around the city",
};

function humanize(s: string | null): string | null {
  return s ? s.replace(/_/g, " ").trim() : null;
}

function withArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// General-purpose "raw_enum_value" -> "Raw enum value" — used anywhere an internal id/enum
// value would otherwise leak into primary UI text (e.g. "intimate_aesthetic" -> "Intimate aesthetic").
export function humanizeLabel(s: string): string {
  return capitalize(s.replace(/_/g, " ").trim());
}

// Short badge/label form (not a full sentence) — "Intimate aesthetic · walking motion" — built
// only from dimensions the descriptor actually has. Used for "What is working" cards and the
// best-direction summary line. Returns a flag for whether enough dimensions were present to
// call this a *specific* pattern (vs. just a bare tier), so the caller can honestly say when
// there isn't enough tagging yet instead of pretending a one-word label is a detailed insight.
export function describePatternLabel(descriptor: ContentDescriptor): { label: string; specificDimensionCount: number } {
  const parts: string[] = [];
  let specificDimensionCount = 0;

  if (descriptor.tier) parts.push(humanizeLabel(descriptor.tier));
  if (descriptor.moment_family) {
    parts.push(humanizeLabel(descriptor.moment_family));
    specificDimensionCount++;
  }
  if (descriptor.location_family) {
    parts.push(humanizeLabel(descriptor.location_family));
    specificDimensionCount++;
  }
  if (descriptor.activity_family) {
    parts.push(humanizeLabel(descriptor.activity_family));
    specificDimensionCount++;
  }
  if (descriptor.sexual_energy_level) {
    parts.push(`${humanizeLabel(descriptor.sexual_energy_level)} energy`);
    specificDimensionCount++;
  }
  if (descriptor.shot_archetype) {
    parts.push(humanizeLabel(descriptor.shot_archetype));
    specificDimensionCount++;
  }

  return { label: parts.length > 0 ? parts.join(" · ") : "Unclassified content", specificDimensionCount };
}

// Descriptive content metadata ONLY — e.g. "walking_motion" -> "Walking". This is NOT a
// Motion Intelligence output (see MotionRecommendation in types.ts); it's what the shot
// already looked like in the source post, shown in the UI as "Shot style" and kept visually
// distinct from the "Motion" (Kling) suggestion so the two are never read as the same thing.
export function describeShotStyle(shotArchetype: string | null): string | null {
  if (!shotArchetype) return null;
  const stripped = shotArchetype.replace(/_motion$/, "");
  return humanizeLabel(stripped);
}

// Human sentence for "visual direction", built only from this specific source post's own
// mood/energy — never invented. Falls back to an honest "not recorded" note.
export function describeVisualDirection(descriptor: ContentDescriptor): string {
  const clauses: string[] = [];
  if (descriptor.mood) clauses.push(`${descriptor.mood} mood`);
  if (descriptor.sexual_energy_level) clauses.push(`${humanize(descriptor.sexual_energy_level)} energy`);
  if (clauses.length === 0) return "No specific visual direction recorded for this source post yet.";
  return `${capitalize(clauses.join(", "))}.`;
}

export function describeContentConcept(descriptor: ContentDescriptor): string {
  const tierPhrase = descriptor.tier ? TIER_LABELS[descriptor.tier] : null;
  const momentPhrase = descriptor.moment_family ? MOMENT_LABELS[descriptor.moment_family] : null;
  const location = humanize(descriptor.location_family);
  const activity = humanize(descriptor.activity_family);
  const energy = humanize(descriptor.sexual_energy_level);

  const clauses: string[] = [];
  if (momentPhrase) clauses.push(momentPhrase);
  if (location) clauses.push(`set in ${withArticle(location)} setting`);
  if (activity) clauses.push(`built around ${activity}`);
  if (energy) clauses.push(`carrying a ${energy} energy`);

  if (!tierPhrase && clauses.length === 0) {
    return "Exploratory concept — not enough descriptor data yet to name a specific content universe.";
  }

  const opening = tierPhrase ?? "A scene";
  return clauses.length > 0 ? `${opening}, ${clauses.join(", ")}.` : `${opening}.`;
}

// Wraps the base concept with the one dimension an evolution recommendation is deliberately
// varying, so the phrase stays honest about what's proven vs. what's being explored.
export function describeEvolutionConcept(descriptor: ContentDescriptor, evolvedDimension: string): string {
  const base = describeContentConcept(descriptor);
  const dimensionLabel = evolvedDimension.replace(/_/g, " ");
  return `${base} Keeping the proven formula, but exploring a different ${dimensionLabel}.`;
}
