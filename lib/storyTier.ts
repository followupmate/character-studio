import { supabase } from "@/lib/supabase";
import type { StoryTier, MomentFamily, MagnetismLevel } from "@/types";

// StoryTier's single source of truth is types/index.ts. Re-exported here so the
// many existing `import { StoryTier } from "@/lib/storyTier"` call sites keep
// working. `import type` keeps this a pure type edge (erased at runtime → no cycle
// with lib/supabase, which this module imports for its DB helpers).
export type { StoryTier, MomentFamily, MagnetismLevel };

export type ContentPhaseKind =
  | "morning_light"
  | "post_workout"
  | "home_evening"
  | "golden_hour_moment"
  | "location_drop";

export interface ContentPhase {
  kind: ContentPhaseKind;
  detail?: string;
}

// ACTIVE rotation weights (sum to 1.0). Historical tiers (lifestyle_travel,
// grounded_routine, …) are intentionally absent → never re-selected, though old
// story_days that carry them still read fine.
export const TIER_WEIGHTS: Record<string, number> = {
  lived_moments: 0.30,     // varied, believable human life — humanizes the profile, top of funnel
  everyday_life: 0.20,     // private, quieter home closeness
  intimate_aesthetic: 0.20,
  wellness_fitness: 0.15,
  luxe_car: 0.15,          // ON TEST — night luxury / passenger-princess crossover
};

const ALL_TIERS = Object.keys(TIER_WEIGHTS) as StoryTier[];

// growth_layer: optional per-tier additive weight delta. Each delta is clamped to ±0.10 and every tier
// keeps a floor of 0.05 (exploration reserve), so a "winning" tier can never starve the others.
export type TierBias = Partial<Record<StoryTier, number>>;
const BIAS_CAP = 0.10;
const TIER_FLOOR = 0.05;

function weightedPick(bias?: TierBias): StoryTier {
  const adjusted: Record<string, number> = { ...TIER_WEIGHTS };
  if (bias) {
    for (const t of ALL_TIERS) {
      const m = Math.max(-BIAS_CAP, Math.min(BIAS_CAP, bias[t] ?? 0));
      adjusted[t] = Math.max(TIER_FLOOR, TIER_WEIGHTS[t] + m);
    }
  }
  const total = ALL_TIERS.reduce((s, t) => s + adjusted[t], 0);
  const r = Math.random() * total;
  let acc = 0;
  for (const t of ALL_TIERS) {
    acc += adjusted[t];
    if (r <= acc) return t;
  }
  return "everyday_life";
}

export async function pickTier(characterId: string, lookbackDays = 6, bias?: TierBias): Promise<StoryTier> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("tier")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(lookbackDays);

  const recent = (data ?? []).map((d) => d.tier as StoryTier).filter((t) => ALL_TIERS.includes(t));

  // Weighted random, but avoid the same tier 3 days in a row (visible variety).
  for (let i = 0; i < 5; i++) {
    const pick = weightedPick(bias);
    const sameStreak = recent[0] === pick && recent[1] === pick;
    if (!sameStreak) return pick;
  }
  return weightedPick(bias);
}

export async function pickDriftSeeds(characterId: string, _dayNumber: number, lookbackDays = 14): Promise<ContentPhase[]> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("drift_seeds")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(lookbackDays);

  const rows = (data ?? []) as Array<{ drift_seeds: ContentPhase[] | null }>;

  const countOf = (kind: ContentPhaseKind) =>
    rows.filter((r) => Array.isArray(r.drift_seeds) && r.drift_seeds.some((s) => s.kind === kind)).length;

  const phases: ContentPhase[] = [];

  if (countOf("morning_light") === 0 && Math.random() < 0.18) phases.push({ kind: "morning_light" });
  if (countOf("post_workout") === 0 && Math.random() < 0.14) phases.push({ kind: "post_workout" });
  if (countOf("home_evening") === 0 && Math.random() < 0.14) phases.push({ kind: "home_evening" });
  if (countOf("golden_hour_moment") === 0 && Math.random() < 0.10) phases.push({ kind: "golden_hour_moment" });
  // location_drop (travel flavour) retired alongside the lifestyle_travel tier.

  return phases;
}

// ── lived_moments: theme families + magnetism ────────────────────────────────
// A lived_moments day commits to ONE of five "worlds". Weights are the target mix.
export const MOMENT_FAMILIES: MomentFamily[] = [
  "home_private", "friends_fun", "vacation_beach_water", "pets_spontaneous", "city_transit",
];
const MOMENT_FAMILY_WEIGHTS: Record<MomentFamily, number> = {
  home_private: 0.30,
  friends_fun: 0.25,
  vacation_beach_water: 0.20,
  pets_spontaneous: 0.15,
  city_transit: 0.10,
};

// Per-day magnetism intensity for lived_moments (mostly soft, rarely sensual).
export const MAGNETISM_LEVELS: MagnetismLevel[] = ["soft", "playful", "flirty", "sensual"];
const MAGNETISM_WEIGHTS: Record<MagnetismLevel, number> = {
  soft: 0.40, playful: 0.35, flirty: 0.20, sensual: 0.05,
};
// Fanvue draft probability by magnetism level (deliberately raised — stronger
// monetization pressure for lived_moments). Weighted by the 40/35/20/5 mix the
// average lands ≈ 0.4925.
export const MAGNETISM_FANVUE_PROB: Record<MagnetismLevel, number> = {
  soft: 0.30, playful: 0.50, flirty: 0.75, sensual: 0.95,
};
// Safe fallback (0.50) when a lived_moments day has no magnetism_level (old rows).
export const LIVED_MOMENTS_FANVUE_FALLBACK = 0.50;
export function livedMomentsFanvueProbability(magnetism: MagnetismLevel | null | undefined): number {
  return magnetism && MAGNETISM_FANVUE_PROB[magnetism] !== undefined
    ? MAGNETISM_FANVUE_PROB[magnetism]
    : LIVED_MOMENTS_FANVUE_FALLBACK;
}

// Deterministic weighted pick over a pool, driven by an injectable rng (0..1).
function weightedFrom<T extends string>(weights: Record<T, number>, pool: T[], rng: () => number): T {
  const total = pool.reduce((s, k) => s + weights[k], 0);
  let r = rng() * total;
  for (const k of pool) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return pool[pool.length - 1];
}

// Pure + unit-testable. Avoids repeating the immediately-previous family when an
// alternative exists; `last` from another tier / null is simply ignored.
export function pickMomentFamily(last?: MomentFamily | null, rng: () => number = Math.random): MomentFamily {
  const pool = last ? MOMENT_FAMILIES.filter((f) => f !== last) : MOMENT_FAMILIES;
  return weightedFrom(MOMENT_FAMILY_WEIGHTS, pool.length > 0 ? pool : MOMENT_FAMILIES, rng);
}

export function pickMagnetismLevel(rng: () => number = Math.random): MagnetismLevel {
  return weightedFrom(MAGNETISM_WEIGHTS, MAGNETISM_LEVELS, rng);
}

// Reads only PREVIOUS lived_moments days; rows with null moment_family are ignored.
export async function getLastMomentFamily(characterId: string): Promise<MomentFamily | null> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("moment_family")
    .eq("character_id", characterId)
    .eq("tier", "lived_moments")
    .not("moment_family", "is", null)
    .order("date", { ascending: false })
    .limit(1);
  return (data?.[0] as { moment_family?: MomentFamily } | undefined)?.moment_family ?? null;
}

// Shared realism note appended to every tier — drives the "real photo, not AI" look that
// makes the avatar believable and attractive (this is what converts viewers).
const REALISM_NOTE = `
REALISM (mandatory for every scene): this must read like a real photo a friend took on a phone,
not a studio render. Candid framing, slightly imperfect, natural light, real skin (visible pores,
no airbrush). Off-duty energy — caught mid-moment, not posed for a catalogue.`;

// UI label for a tier. Only lived_moments overrides; the rest humanize the id.
const TIER_LABELS: Partial<Record<StoryTier, string>> = {
  lived_moments: "Magnetic Everyday Life",
};
export function tierLabel(tier: StoryTier | null | undefined): string {
  if (!tier) return "";
  return TIER_LABELS[tier] ?? tier.replace(/_/g, " ");
}

// The chosen lived_moments world, expanded into scene direction.
export function momentFamilyGuidance(family: MomentFamily): string {
  const map: Record<MomentFamily, string> = {
    home_private:
      "TODAY'S WORLD — home_private: one private moment at home. Bed on waking, morning coffee, cooking in the kitchen, reading on the couch, skincare in the bathroom, getting dressed, tidying, a quiet evening in, or the balcony. Unforced and personal.",
    friends_fun:
      "TODAY'S WORLD — friends_fun: a social, lively moment — a drink with a friend, dinner or brunch, getting ready to go out, a house party, music, dancing, laughing. Other people may appear ONLY partly: out of focus, back-to-camera, in motion, or just a hand / shoulder / glass — at most ONE partly-visible companion, and NEVER a second fully-rendered face (it duplicates her face and breaks identity). She is the single clear main character.",
    vacation_beach_water:
      "TODAY'S WORLD — vacation_beach_water: sun and water — beach, pool, a boat, a drink by the sea, wet hair, a towel, a beach bar, a hotel morning before the pool. A SPECIFIC activity or moment, not a swimwear catalogue. Solo is completely fine. The destination must never overshadow her.",
    pets_spontaneous:
      "TODAY'S WORLD — pets_spontaneous: a pet and a real, slightly spontaneous moment — a dog on the bed, a morning walk, a cat on the kitchen counter, play, a touch, a genuine reaction, a little mess. Warm and human. She stays the visual centre; the animal supports, never takes over.",
    city_transit:
      "TODAY'S WORLD — city_transit: on the move — a car ride, a taxi, an airport, a train, a walk through the city, a coffee-to-go between places, buying flowers or groceries, waiting. A small real event of getting somewhere.",
  };
  return map[family];
}

// The chosen magnetism level, expanded into intensity direction.
export function magnetismGuidance(level: MagnetismLevel): string {
  const map: Record<MagnetismLevel, string> = {
    soft: "MAGNETISM — soft: naturally attractive, easy, human. Simple eye contact or none, relaxed body, pleasant energy. No deliberate teasing.",
    playful: "MAGNETISM — playful: cheerful, spontaneous, a smile or laugh, livelier play with the camera, a little teasing, the feel of a shared moment.",
    flirty: "MAGNETISM — flirty: knowing eye contact, a coquettish charge, slightly more attractive styling, a touch closer to the camera, a lightly private / teasing beat — still fully Instagram-safe.",
    sensual: "MAGNETISM — sensual: tasteful, non-explicit sensuality that fits the situation naturally — a stronger play of silhouette, styling or closeness. Stays contextual and believable; does NOT turn the scene into a lingerie / bedroom set (that is intimate_aesthetic).",
  };
  return `${map[level]} One or two natural magnetic details only (eye contact, a body line, a bare shoulder or leg, wet hair, an oversized tee, hair movement, a spontaneous gesture) — never all at once, and never by simply removing clothes.`;
}

export function tierGuidance(
  tier: StoryTier,
  extras?: { family?: MomentFamily | null; magnetism?: MagnetismLevel | null }
): string {
  if (tier === "lived_moments") {
    const base = `TIER: lived_moments — "Magnetic Everyday Life" (a varied, believable human life; she is LIVING it, not presenting it)

Human first. Attractive always. Playful and flirtatious when it fits naturally. Each day shows ONE specific fragment of her real life across home, friends, travel, water, pets or the city — she feels like a person with a full life beyond the frame, not a series of model poses or a luxury-destination catalogue.

MANDATORY every frame:
- She is clearly present and the single main character, but her body and attention do NOT always face the camera.
- One concrete moment and one action — doing, reacting to, or interacting with something. Not a generic lifestyle pose.
- At least one SIGN OF REAL LIFE: a used object, an unfinished activity, food, a drink, luggage, wet hair, an open door, rumpled fabric, a pet, another person partly in frame, or something happening off-frame.
- The environment is recognizable and meaningfully connected to the action.
- Expressions vary naturally: quiet, amused, distracted, laughing, tired, curious, caught mid-conversation.

ONE COHERENT MOMENT: the whole day stays in ONE event — same base location (or a logical move within it), same time of day, same outfit (or a natural progression), same mood, same visual tone, same weather. Do not jump between unrelated settings.

VISUAL: clean, believable contemporary photography. Human warmth without forced imperfection or heavy grain. Aspirational without looking staged. No empty environments, no repetitive solo posing, no catalogue framing.${REALISM_NOTE}`;
    const parts = [base];
    if (extras?.family) parts.push(momentFamilyGuidance(extras.family));
    if (extras?.magnetism) parts.push(magnetismGuidance(extras.magnetism));
    return parts.join("\n\n");
  }

  if (tier === "everyday_life") {
    return `TIER: everyday_life (relatable daily life, girlfriend energy, the life a follower wants to step into)

This is an ordinary day in her real life — the kind of content that builds parasocial closeness and pulls followers.

Scene must be:
- a normal everyday setting: her apartment (kitchen, living room, bedroom, by the window), a neighbourhood café, a casual city street, running errands, a park bench
- natural everyday light: morning kitchen light, soft afternoon through a window, overcast street
- one relatable anchor: coffee/matcha in hand, an unmade bed behind her, groceries on the counter, sneakers on, hair still a little undone
- her posture: easy, off-duty, mid-moment — leaning on the counter, curled on the couch, glancing back mid-walk

Wardrobe: casual and flattering — oversized knit over bare legs, fitted everyday tee + denim, loungewear set, a soft slip top. Comfortable but quietly attractive. She looks good without trying.

Narrative tone: warm, personal, like a text to someone she likes. A small real detail. A soft hook that makes you want the next day.${REALISM_NOTE}`;
  }

  if (tier === "wellness_fitness") {
    return `TIER: wellness_fitness (body-confident, healthy, high-engagement — the strongest reach driver)

She is moving — gym, pilates, yoga, a wellness studio, a post-workout moment. This content is the top reach driver: athletic, body-flattering, aspirational-but-attainable.

Scene must be:
- gym / pilates studio / yoga space / home workout corner / wellness studio / post-workout at home
- bright natural or clean studio light — mirrors, light wood, big windows
- one anchor: a reformer, a yoga mat, a water bottle, a post-workout matcha, a mirror selfie
- her posture: mid-movement or relaxed after — stretching, sitting on the mat, a gym mirror selfie, leaning on a machine

Wardrobe: figure-flattering athleisure — fitted sports bra + high-waisted leggings, bike shorts + crop, a tank slipping off one shoulder, matching set. Confident, sporty, attractive. Show the body the way fitness creators do — strong and healthy, never crude.

Narrative tone: confident, light, a little playful. Earned-glow energy.${REALISM_NOTE}`;
  }

  if (tier === "intimate_aesthetic") {
    return `TIER: intimate_aesthetic (the conversion tier — girlfriend fantasy that funnels to OnlyFans / Fanvue)

This is the most suggestive tier and the one that converts followers into paying subscribers. Maximally alluring WITHIN Instagram's rules — provocation through confidence, skin, fabric and gaze, never through explicit content.

Scene must be:
- interior: her bedroom or bathroom — unmade bed, soft window or warm lamp light, mirror, morning or late-night
- light: soft directional side light that traces the body — never flat
- wardrobe (push to the IG-allowed edge): lingerie styled as fashion, a silk robe falling open at the shoulder, an oversized shirt and little else, a bralette + shorts, swimwear indoors, a thin strap slipping. Tasteful but deliberately sexy.
- her posture: confident, aware of the camera — lying back on the bed, kneeling on the bed edge, mirror selfie adjusting a strap, looking back over the shoulder, stretching awake

Narrative tone: direct, daring, self-possessed. The caption has an edge and a quiet invitation — the "come find the rest of this" energy that drives subscriptions, implied never stated.

SAFE RULES (account survival): suggestive yes — explicit NO. No nudity, no exposed nipples/genitals, no sexual acts, no pornographic framing. Lingerie/swimwear/implied-topless-from-behind are the ceiling. Anything past that gets the account banned and is generated nowhere in this pipeline.${REALISM_NOTE}`;
  }

  if (tier === "luxe_car") {
    return `TIER: luxe_car (night luxury / passenger-princess — the high-reach crossover: attractive + car/luxury culture)

A cinematic night moment inside, or stepping out of, a high-end car. This tier fuses two audiences — her
admirers and the luxury/car-culture crowd — which is what drives outsized reach. Premium and elegant, never trashy.

Scene must be:
- interior of a clearly LUXURY vehicle at night (or her mid-step out of the door): quilted or soft full-grain
  leather, a starlight-style headliner or warm cabin ambient, a tasteful ambient glow (soft gold, or a restrained
  red/violet dash glow — cinematic, not gaudy), city lights / a parking structure / a tunnel streaking past the window
- convey the luxury through MATERIALS AND ATMOSPHERE, NEVER a brand badge, logo or lettering (image gens render
  logos as garble — keep any badge out of frame or out of focus). Premium/exotic grand-tourer feel, not a mass-market car.
- one anchor: the passenger seat, a hand on the door, heels on the sill, a seatbelt line across the body
- HER POSE IS THE HOOK — it must stop the scroll on its own, deliberate and body-forward, NOT a passive upright
  sit. Passenger-princess theatrics (IG-safe, suggestive-not-explicit): reclined deep in the seat with knees drawn
  up or one heel propped on the seat edge, legs long across the frame; an arm stretched along the seat back or door;
  leaning in toward the lens; a slow glance back over the shoulder; a playful hand near the face, hair or the
  seatbelt; chin down, eyes up. Pick ONE strong, intentional, a-little-provocative pose — theatrical and alluring,
  the kind that reads as a hook by itself.

Wardrobe: evening glam pushed to the IG-allowed edge — an elegant going-out mini dress or bodysuit, or
lingerie-as-fashion (structured bralette + skirt, silk slip) with sheer thigh-highs, heels, delicate fine jewellery.
Expensive, deliberate, quietly sexy — luxury-brand ENERGY without ever naming or showing a brand.

Narrative tone: POV / passenger-princess — direct, playful-confident, a little exclusive. The caption teases the
night and the lifestyle with the "come find the rest" edge that funnels to Fanvue. Hook leans POV/curiosity
("pov: you're driving", "wait till she steps out") — never a flat mood word.

SAFE RULES (account survival): suggestive yes — explicit NO. Lingerie/eveningwear + thigh-highs are the ceiling;
no nudity, no exposed nipples/genitals. Anything past that gets the account banned.${REALISM_NOTE}`;
  }

  if (tier === "lifestyle_travel") {
    return `TIER: lifestyle_travel (occasional aspirational accent — she travels sometimes)

An occasional travel day. The location is the story. She is passing through somewhere beautiful.

Scene must be:
- exterior or hotel terrace / balcony / rooftop — city or coast visible
- natural light: golden hour, blue hour, Mediterranean afternoon, morning haze
- one travel anchor: a city view, a coastline, cobblestones, a hotel pool edge, a café terrace
- her posture: relaxed, off-duty, mid-moment — not posed for camera

Wardrobe: light and effortless — slip dress, linen, swimwear at the pool, minimal gold jewelry.

Narrative tone: present, warm, slightly candid. Name the place. One sharp observation. Soft hook.${REALISM_NOTE}`;
  }

  return "";
}

export function driftSeedGuidance(seeds: ContentPhase[]): string {
  if (seeds.length === 0) return "";

  const lines: string[] = [];
  for (const seed of seeds) {
    if (seed.kind === "morning_light") {
      lines.push("- morning_light: this is an early-morning scene — soft first light, just-woke energy, slow start. Coffee or stretching, hair undone. Caption is quiet and personal.");
    } else if (seed.kind === "post_workout") {
      lines.push("- post_workout: just finished training — light natural glow/sweat sheen, relaxed-after-effort posture, water or matcha. Confident, earned-glow tone.");
    } else if (seed.kind === "home_evening") {
      lines.push("- home_evening: cozy night in — warm lamp light, loungewear or oversized knit, couch or bed, unhurried. Caption is intimate and warm, a little inviting.");
    } else if (seed.kind === "golden_hour_moment") {
      lines.push("- golden_hour_moment: the scene peaks at golden hour. Mention the warm low light once without using the phrase 'golden hour'.");
    } else if (seed.kind === "location_drop") {
      lines.push("- location_drop: a travel day — first day in a new place. Name the place once. Arrival energy.");
    }
  }

  return `CONTENT PHASE SIGNALS ACTIVE TODAY:
${lines.join("\n")}`;
}
