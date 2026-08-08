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
