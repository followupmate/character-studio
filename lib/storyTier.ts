import { supabase } from "@/lib/supabase";

// Content direction (2026-06-25 overhaul): everyday-life dominant, OnlyFans/Fanvue funnel.
// IG = top of funnel (reach + followers via relatable, attractive, realistic everyday content)
// → conversion to OF/Fanvue via the suggestive intimate tier. All IG-public content stays
// within IG rules (suggestive, never explicit/nude — that gets the account banned).
export type StoryTier =
  | "everyday_life"
  | "wellness_fitness"
  | "intimate_aesthetic"
  | "luxe_car"
  | "lifestyle_travel";

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

// Target mix — everyday relatable + wellness reach-drivers + intimate conversion.
// lifestyle_travel is RETIRED from the rotation: in the reel data it was
// consistently the weakest tier (~115 views vs 1k–100k for the others), so it
// never gets picked for new days. The tier stays in the StoryTier union and in
// tierGuidance for backward-compat with already-generated travel days.
const TIER_WEIGHTS: Record<string, number> = {
  everyday_life: 0.30,
  wellness_fitness: 0.20,
  intimate_aesthetic: 0.25,
  luxe_car: 0.25, // ON TEST — night luxury / passenger-princess crossover (dial to 0 to disable)
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

// Shared realism note appended to every tier — drives the "real photo, not AI" look that
// makes the avatar believable and attractive (this is what converts viewers).
const REALISM_NOTE = `
REALISM (mandatory for every scene): this must read like a real photo a friend took on a phone,
not a studio render. Candid framing, slightly imperfect, natural light, real skin (visible pores,
no airbrush). Off-duty energy — caught mid-moment, not posed for a catalogue.`;

export function tierGuidance(tier: StoryTier): string {
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
