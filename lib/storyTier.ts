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

// open_life_generation_v1: intimate_aesthetic's bedroom/bathroom-first framing produced a
// single real IG result of ~207k views — a strong signal, but ONE data point. This flag
// documents that the tier's underlying PRINCIPLE (proximity / magnetism / private-access
// confidence) is product-validated as high-performing. It is explicitly NOT used to
// auto-adjust TIER_WEIGHTS — raising this tier's rotation share stays a human decision
// pending more signal (see lib/growthScore.ts getGrowthBias, which is untouched by this).
export const TIER_VALIDATED_HIGH_PERFORMING: Partial<Record<StoryTier, boolean>> = {
  intimate_aesthetic: true,
};

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

// creative_intelligence_generation_v1: optional per-family additive weight delta, same
// clamp/floor shape as growth_layer's TierBias above (storyTier.ts:47-49) so a CI-preferred
// moment_family can never be a stronger lever than the already-shipped growth_layer mechanism.
export type MomentFamilyBias = Partial<Record<MomentFamily, number>>;

// Pure + unit-testable. Avoids repeating the immediately-previous family when an
// alternative exists; `last` from another tier / null is simply ignored. `bias` is applied to
// the SURVIVING pool only (after the anti-repeat exclusion above) — it can never reintroduce
// yesterday's excluded family, matching the anti-repetition invariant used for TierBias.
export function pickMomentFamily(last?: MomentFamily | null, rng: () => number = Math.random, bias?: MomentFamilyBias): MomentFamily {
  const pool = last ? MOMENT_FAMILIES.filter((f) => f !== last) : MOMENT_FAMILIES;
  const survivingPool = pool.length > 0 ? pool : MOMENT_FAMILIES;
  if (!bias) return weightedFrom(MOMENT_FAMILY_WEIGHTS, survivingPool, rng);

  const adjusted: Record<MomentFamily, number> = { ...MOMENT_FAMILY_WEIGHTS };
  for (const f of survivingPool) {
    const m = Math.max(-BIAS_CAP, Math.min(BIAS_CAP, bias[f] ?? 0));
    adjusted[f] = Math.max(TIER_FLOOR, MOMENT_FAMILY_WEIGHTS[f] + m);
  }
  return weightedFrom(adjusted, survivingPool, rng);
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

// Concrete micro-locations that belong to each lived_moments world. Used to bind the
// story's location field to the day's family: without this the generic location spec
// offered examples from every other tier (including "gym free-weights area"), so a
// vacation_beach_water day could legitimately resolve to a gym — and then the styling
// deck, which follows the family, dressed her for the beach in it.
export const MOMENT_FAMILY_LOCATIONS: Record<MomentFamily, string> = {
  home_private:
    '"her apartment kitchen", "her bedroom, unmade bed", "the living room couch by the window", "her bathroom mirror", "the balcony"',
  friends_fun:
    '"a restaurant table at dinner", "her apartment while getting ready to go out", "a bar counter", "a house party kitchen", "a neighbourhood café table with a friend"',
  vacation_beach_water:
    '"a beach, towel on the sand", "the hotel pool edge", "a boat deck", "a beach bar table", "a hotel room the morning before the pool"',
  pets_spontaneous:
    '"her kitchen counter with the cat on it", "her bed with the dog", "a park path on the morning walk", "the hallway coming back from a walk"',
  city_transit:
    '"the passenger seat of a car", "a taxi back seat", "an airport gate", "a train window seat", "a city sidewalk between two places", "a flower stall"',
};

// The `location` line of the story output spec. lived_moments days get a hard binding to
// the day's world; every other tier keeps the original tier-example menu.
export function locationSpecFor(tier: StoryTier, family?: MomentFamily | null): string {
  if (tier === "lived_moments" && family) {
    return `- location: string (HARD CONSTRAINT — the location MUST belong to TODAY'S WORLD (${family}) described above. Do NOT borrow a location from another world or another tier: no gym, no pilates or workout space, no bedroom-as-lingerie-set, unless that genuinely IS today's world. Pick one concrete micro-location from: ${MOMENT_FAMILY_LOCATIONS[family]} — or an equally specific place that unmistakably belongs to the same world. Be concrete and physically specific.)`;
  }
  return `- location: string (the specific micro-location for today's tier — everyday: "her apartment kitchen", "neighbourhood café corner table", "city sidewalk near home"; wellness: "boutique pilates studio", "gym free-weights area", "home workout corner"; intimate: "her bedroom, unmade bed", "bathroom mirror, morning"; travel: city + spot e.g. "Amalfi, hotel terrace". Be concrete and physically specific.)`;
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

// open_life_generation_v1: examples given below are inspiration, never a whitelist. Prefer
// a new coherent situation not named in the examples when it is realistic for her, visually
// renderable in one location, compatible with the selected tier and recent continuity, and
// simple enough to understand from one image.
const INSPIRATION_NOT_WHITELIST = `Examples above are inspiration, never a whitelist. Prefer a new coherent situation
not named in the examples when it is realistic for her, visually renderable in one location,
compatible with this tier and recent continuity, and simple enough to understand from one image.`;

export function tierGuidance(
  tier: StoryTier,
  extras?: {
    family?: MomentFamily | null;
    magnetism?: MagnetismLevel | null;
    // open_life_generation_v1 — additive only. Omitting this (or passing false) reproduces
    // the exact pre-existing string for every tier; existing call sites are unaffected.
    situationMode?: boolean;
    sexualEnergyGuidance?: string; // precomputed by lib/sexualEnergyConfig.ts, passed in to avoid a module cycle
  }
): string {
  if (tier === "lived_moments") {
    const base = `TIER: lived_moments — "Magnetic Everyday Life" (a varied, believable human life; she is LIVING it, not presenting it)

Human first. Attractive always. Playful and flirtatious when it fits naturally. Each day shows ONE specific fragment of her real life across home, friends, travel, water, pets or the city — she feels like a person with a full life beyond the frame, not a series of model poses or a luxury-destination catalogue.

MANDATORY every frame:
- She is clearly present and the single main character. Vary her attention ACROSS the batch rather than turning her away from the lens by default: some frames looking straight into the camera, others absorbed in what she is doing. When she is alone, a frame that reads as a photo she took of herself — direct, easy eye contact down the lens — is natural and welcome. Never leave her staring blankly past the camera at nothing.
- One concrete moment and one action — doing, reacting to, or interacting with something. Not a generic lifestyle pose.
- At least one SIGN OF REAL LIFE: a used object, an unfinished activity, food, a drink, luggage, wet hair, an open door, rumpled fabric, a pet, another person partly in frame, or something happening off-frame.
- The environment is recognizable and meaningfully connected to the action.
- Expressions vary naturally: quiet, amused, distracted, laughing, tired, curious, caught mid-conversation.

ONE COHERENT MOMENT: the whole day stays in ONE event — same base location (or a logical move within it), same time of day, same outfit (or a natural progression), same mood, same visual tone, same weather. Do not jump between unrelated settings.

VISUAL: warm, believable contemporary photography full of real light and life. Lean into warm natural light, alive but true-to-life color, and a lived-in space with real depth. Let warmth show — a soft smile, an amused half-smile, a quiet laugh caught mid-breath, easy eye contact, a small spontaneous gesture — whenever the moment allows it. Keep it CONTAINED and photographable: never a wide open-mouth laugh, never a big toothy grin held for the camera, never mugging or gurning. She is amused by something real, not performing delight at the lens. Aspirational without looking staged. No empty environments, no repetitive solo posing, no catalogue framing.${REALISM_NOTE}`;
    const parts = [base];
    if (extras?.family) parts.push(momentFamilyGuidance(extras.family));
    if (extras?.magnetism) parts.push(magnetismGuidance(extras.magnetism));
    if (extras?.situationMode) {
      parts.push(`OPEN LIFE DOMAINS (broader than the five worlds above — pick whichever fits today's situation; a world can be revisited with a genuinely different life domain within it): nightlife and social events; beach, pool and water life; hotels and travel; home and private life (practical life as a supporting frame, never the whole point); wellness and body; fashion and self-presentation; movement and transit; friendship and celebration; playful or impulsive experiences; personal interests; unexpected everyday situations.
${INSPIRATION_NOT_WHITELIST}`);
      if (extras.sexualEnergyGuidance) parts.push(extras.sexualEnergyGuidance);
    }
    return parts.join("\n\n");
  }

  if (tier === "everyday_life") {
    const base = `TIER: everyday_life (relatable daily life, girlfriend energy, the life a follower wants to step into)

This is an ordinary day in her real life — the kind of content that builds parasocial closeness and pulls followers.

Scene must be:
- a normal everyday setting: her apartment (kitchen, living room, bedroom, by the window), a neighbourhood café, a casual city street, running errands, a park bench
- natural everyday light, warm or soft are equally valid — pick what fits the moment, don't default to grey: warm morning kitchen light, golden-hour sun through a window, bright soft afternoon, or an overcast street
- one relatable anchor: coffee/matcha in hand, an unmade bed behind her, groceries on the counter, sneakers on, hair still a little undone
- her posture: easy, off-duty, mid-moment — leaning on the counter, curled on the couch, glancing back mid-walk

Wardrobe: casual and flattering — oversized knit over bare legs, fitted everyday tee + denim, loungewear set, a soft slip top. Comfortable but quietly attractive. She looks good without trying.

Narrative tone: warm, personal, like a text to someone she likes. A small real detail. A soft hook that makes you want the next day.${REALISM_NOTE}`;
    if (!extras?.situationMode) return base;
    return `${base}

OPEN LIFE GENERATION — the practical activity is a FRAME, never the point of the day. A day that
is only chores has no magnetic reason to exist.
AVOID: a full scene built around folding laundry with no other point.
PREFER: folding laundry while on a call that reveals a decision she's making — the laundry is the
frame, the call (or the decision, or who she's talking to, or what she says) is the point.
AVOID: unpacking groceries and the scene ends there.
PREFER: coming home late from dinner, kicking her shoes off at the door, and — still in her dress —
unpacking strawberries and prosecco while someone photographs her from the hallway.
${INSPIRATION_NOT_WHITELIST}

${extras.sexualEnergyGuidance ?? ""}`;
  }

  if (tier === "wellness_fitness") {
    const base = `TIER: wellness_fitness (body-confident, healthy, high-engagement — the strongest reach driver)

She is moving — gym, pilates, yoga, a wellness studio, a post-workout moment. This content is the top reach driver: athletic, body-flattering, aspirational-but-attainable.

Scene must be:
- gym / pilates studio / yoga space / home workout corner / wellness studio / post-workout at home
- bright natural or clean studio light — mirrors, light wood, big windows
- one anchor: a reformer, a yoga mat, a water bottle, a post-workout matcha, a mirror selfie
- her posture: mid-movement or relaxed after — stretching, sitting on the mat, a gym mirror selfie, leaning on a machine

Wardrobe: figure-flattering athleisure — fitted sports bra + high-waisted leggings, bike shorts + crop, a tank slipping off one shoulder, matching set. Confident, sporty, attractive. Show the body the way fitness creators do — strong and healthy, never crude.

Narrative tone: confident, light, a little playful. Earned-glow energy.${REALISM_NOTE}`;
    if (!extras?.situationMode) return base;
    return `${base}

BEYOND GYM/PILATES/YOGA — the body-confidence principle applies to any movement, not only a
studio floor: swimming, paddleboard, dancing, mobility work, the drive to or from training, a
wellness hotel, recovery after a late night, an IG-safe sauna or spa moment, physical activity by
water, a spontaneous active plan. The sexual energy here comes from MOVEMENT, physical control and
earned confidence — never from a fetishised framing of the body.
${INSPIRATION_NOT_WHITELIST}

${extras.sexualEnergyGuidance ?? ""}`;
  }

  if (tier === "intimate_aesthetic") {
    const SAFE_RULES = `SAFE RULES (account survival): suggestive yes — explicit NO. No nudity, no exposed nipples/genitals, no sexual acts, no pornographic framing. Lingerie/swimwear/implied-topless-from-behind are the ceiling. Anything past that gets the account banned and is generated nowhere in this pipeline.`;
    if (!extras?.situationMode) {
      return `TIER: intimate_aesthetic (the conversion tier — girlfriend fantasy that funnels to OnlyFans / Fanvue)

This is the most suggestive tier and the one that converts followers into paying subscribers. Maximally alluring WITHIN Instagram's rules — provocation through confidence, skin, fabric and gaze, never through explicit content.

Scene must be:
- interior: her bedroom or bathroom — unmade bed, soft window or warm lamp light, mirror, morning or late-night
- light: soft directional side light that traces the body — never flat
- wardrobe (push to the IG-allowed edge): lingerie styled as fashion, a silk robe falling open at the shoulder, an oversized shirt and little else, a bralette + shorts, swimwear indoors, a thin strap slipping. Tasteful but deliberately sexy.
- her posture: confident, aware of the camera — lying back on the bed, kneeling on the bed edge, mirror selfie adjusting a strap, looking back over the shoulder, stretching awake

Narrative tone: direct, daring, self-possessed. The caption has an edge and a quiet invitation — the "come find the rest of this" energy that drives subscriptions, implied never stated.

${SAFE_RULES}${REALISM_NOTE}`;
    }
    return `TIER: intimate_aesthetic (the conversion tier — girlfriend fantasy that funnels to OnlyFans / Fanvue)

This is the most suggestive tier and the one that converts followers into paying subscribers. Maximally alluring WITHIN Instagram's rules — provocation through confidence, skin, fabric and gaze, never through explicit content.

SITUATION FIRST, NOT LOCATION FIRST: do not open by picking a bedroom or bathroom and inventing a
reason for it afterward. Start from a real context, decision or event — she is somewhere and doing
something for a REASON that exists before the camera does. The visual sexuality is the SECOND step,
derived from that situation, never the first.

Inspiration for the RANGE, not a whitelist — invent your own within it: a hotel room before or
after an event, a pool or private terrace at the end of the day, inside a boat cabin, the passenger
seat of a car at night, her kitchen the morning after a night out, a balcony at 2am, stretching
after a private wellness session, getting ready in front of the mirror before going out, the
morning after — waking up in yesterday's clothes, choosing which photo to send someone, a changing
room between outfits, a hotel corridor walking back to the room, a quiet moment on transit home.
The bedroom or bathroom is one possible outcome of a situation, never the default starting point.

MANDATORY every frame:
- A concrete situation: what she is doing, and why, right now — not a pose waiting for a caption.
- The sexual energy is EARNED by the situation (confidence, privacy, a decision she made, a mood)
  — never just "she is attractive and alone near a bed."

Narrative tone: direct, daring, self-possessed. The caption has an edge and a quiet invitation — the "come find the rest of this" energy that drives subscriptions, implied never stated.

${SAFE_RULES}${REALISM_NOTE}

${extras.sexualEnergyGuidance ?? ""}`;
  }

  if (tier === "luxe_car") {
    const base = `TIER: luxe_car (night luxury / passenger-princess — the high-reach crossover: attractive + car/luxury culture)

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
    if (!extras?.situationMode) return base;
    return `${base}

DOMAIN + ENVIRONMENT + OVERLAY, NOT A STANDALONE LOCATION TIER: the car is the frame she is
travelling through between real events — never the whole story. Ban generic passenger-seat posing
with no reason, a logo or badge as the visual point, or "rich girl cosplay" divorced from any
life context. She is going somewhere or coming from somewhere specific, and that destination or
departure is part of what makes the moment mean something.
${INSPIRATION_NOT_WHITELIST}

${extras.sexualEnergyGuidance ?? ""}`;
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
