import { supabase } from "@/lib/supabase";
import type { MomentFamily } from "@/types";

type TierName = "everyday_life" | "wellness_fitness" | "intimate_aesthetic" | "luxe_car" | "lived_moments" | "lifestyle_travel";

export interface StylingProfile {
  id: string;
  label: string;
  vibe: string;
  outfit: string;
  hair: string;
  jewelry: string;
  makeup: string;
  /** which tiers this profile fits best */
  tier_affinity: TierName[];
  /** lived_moments only: which sub-worlds this profile fits (optional) */
  family_affinity?: MomentFamily[];
  /** rough time of day preference — scene brief may adapt */
  time_affinity: Array<"morning" | "midday" | "golden_hour" | "evening" | "any">;
  cooldown_days: number;
}

export const STYLING_PROFILES: StylingProfile[] = [
  // ── EVERYDAY ──────────────────────────────────────────────
  {
    id: "cozy_home_knit",
    label: "Cozy home knit",
    vibe: "Girlfriend-at-home energy. Soft, warm, quietly sexy without trying. The look a follower wants to wake up next to.",
    outfit: "oversized chunky knit sweater worn over bare legs, optionally slipping off one shoulder, simple cotton briefs or tiny shorts underneath (mostly hidden)",
    hair: "soft undone waves, slightly tousled, lived-in",
    jewelry: "thin gold chain, small gold studs",
    makeup: "bare or near-bare — clean skin, light mascara, balm lip",
    tier_affinity: ["everyday_life", "intimate_aesthetic", "lived_moments"],
    family_affinity: ["home_private", "pets_spontaneous"],
    time_affinity: ["morning", "evening"],
    cooldown_days: 4,
  },
  {
    id: "loungewear_set",
    label: "Loungewear set",
    vibe: "Soft ribbed lounge set. Comfortable, figure-skimming, at-home ease.",
    outfit: "matching ribbed loungewear set — fitted scoop or crop top + high-waist shorts or leggings, soft neutral (cream, sand, dove grey)",
    hair: "relaxed waves or a soft claw-clip half-up",
    jewelry: "thin gold chain, small hoops",
    makeup: "fresh, minimal — glowy skin, tinted lip",
    tier_affinity: ["everyday_life", "intimate_aesthetic", "lived_moments"],
    family_affinity: ["home_private"],
    time_affinity: ["morning", "evening", "any"],
    cooldown_days: 4,
  },
  {
    id: "casual_denim_day",
    label: "Casual denim day",
    vibe: "Effortless off-duty. Running errands, coffee, a walk. Attractive in a normal-girl way.",
    outfit: "fitted ribbed tank or cropped tee + well-fitted jeans or denim shorts, optional oversized shirt or light jacket worn open",
    hair: "natural waves, a little movement",
    jewelry: "thin gold chain, small hoops, optional simple watch",
    makeup: "natural — skin tint, mascara, warm lip",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit", "pets_spontaneous", "home_private"],
    time_affinity: ["midday", "golden_hour", "any"],
    cooldown_days: 4,
  },
  {
    id: "cafe_morning",
    label: "Café morning",
    vibe: "Slow morning out. Relatable, warm, approachable.",
    outfit: "oversized button-down shirt (white or sand) worn loose, with bike shorts or a mini skirt; or a soft knit + denim",
    hair: "soft waves, effortless",
    jewelry: "thin gold chain, small studs",
    makeup: "fresh-faced — glow, mascara, tinted balm",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit", "home_private"],
    time_affinity: ["morning", "midday"],
    cooldown_days: 4,
  },
  // ── LIVED MOMENTS (Magnetic Everyday Life — human, varied) ─
  {
    id: "oversized_tee_home",
    label: "Oversized tee at home",
    vibe: "That-girl-at-home. A single oversized tee, bare legs, effortless and quietly magnetic. Iconic relatable look.",
    outfit: "oversized soft cotton t-shirt (white or washed grey) worn long over bare legs, sleeves loose; barefoot or slouchy socks",
    hair: "undone waves, a little messy, lived-in",
    jewelry: "thin gold chain, small studs",
    makeup: "bare — clean glow, light mascara, balm",
    tier_affinity: ["lived_moments", "everyday_life"],
    family_affinity: ["home_private", "pets_spontaneous"],
    time_affinity: ["morning", "evening", "any"],
    cooldown_days: 5,
  },
  {
    id: "robe_morning",
    label: "Robe morning",
    vibe: "Fresh-out-of-the-shower morning. A soft robe, mirror light, unhurried and naturally alluring.",
    outfit: "soft white or cream waffle / terry robe worn loose, slipping slightly at one shoulder; simple underlayer",
    hair: "damp or air-dried, pushed back or in a soft towel-tousle",
    jewelry: "none or a single thin chain",
    makeup: "fresh, dewy, near-bare",
    tier_affinity: ["lived_moments", "intimate_aesthetic"],
    family_affinity: ["home_private"],
    time_affinity: ["morning"],
    cooldown_days: 6,
  },
  {
    id: "going_out_casual",
    label: "Going-out casual",
    vibe: "Getting-ready energy — casual-chic for a night with friends. Relatable and warm, not full glam.",
    outfit: "fitted tank or a simple slip top + straight jeans or a mini skirt, an oversized blazer or leather jacket worn open; boots or heels",
    hair: "smooth blowout or effortless waves",
    jewelry: "layered thin gold, small hoops",
    makeup: "soft evening — warm eye, glossy lip",
    tier_affinity: ["lived_moments"],
    family_affinity: ["friends_fun", "city_transit"],
    time_affinity: ["evening", "golden_hour"],
    cooldown_days: 6,
  },
  // ── WELLNESS / FITNESS ────────────────────────────────────
  {
    id: "athleisure_pilates",
    label: "Athleisure pilates",
    vibe: "Premium wellness-studio look. Healthy, toned, expensive-simple. Strong IG reach.",
    outfit: "matching seamless set — fitted sports bra + high-waisted leggings, soft neutral (cream, sage, mocha, black), figure-flattering",
    hair: "sleek low pony or claw-clip, a few loose strands",
    jewelry: "thin gold chain only (small studs)",
    makeup: "clean glow — skin tint, mascara, balm",
    tier_affinity: ["wellness_fitness"],
    time_affinity: ["morning", "midday"],
    cooldown_days: 4,
  },
  {
    id: "gym_y2k",
    label: "Gym Y2K",
    vibe: "Sporty, confident, body-forward gym energy. Mirror-selfie ready.",
    outfit: "fitted white or black athletic tank or cropped tank + bike shorts OR low-slung sweatpants riding on the hips, sneakers",
    hair: "high pony or messy bun with face-framing strands",
    jewelry: "thin gold chain, small studs",
    makeup: "minimal, sporty — glow, mascara",
    tier_affinity: ["wellness_fitness"],
    time_affinity: ["midday", "golden_hour"],
    cooldown_days: 4,
  },
  // ── INTIMATE / VIP (OF/Fanvue funnel — IG-safe ceiling) ───
  {
    id: "bedroom_lingerie",
    label: "Bedroom lingerie",
    vibe: "Highest-conversion look. Lingerie styled as fashion, girlfriend-fantasy. Suggestive to the IG edge, never explicit.",
    outfit: "matching lingerie set styled as fashion — soft bralette + matching briefs, or a silk slip / silk robe falling open at the shoulder over it. Tasteful, deliberately alluring. No exposure past IG-allowed.",
    hair: "soft tousled waves, bedroom-undone",
    jewelry: "thin gold chain, small studs",
    makeup: "soft glam — glowy skin, defined lash, nude-rose lip",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["morning", "evening"],
    cooldown_days: 5,
  },
  {
    id: "vs_glamour",
    label: "VS glamour",
    vibe: "Victoria's Secret mood. Glamorous, confident, feminine. Figure-forward but elegant.",
    outfit: "satin bodycon midi dress or fitted slip gown — champagne or nude, figure-hugging, low neckline, thin straps",
    hair: "VS bombshell waves — voluminous, loose, high-shine",
    jewelry: "delicate gold — layered thin chains, small drop earrings",
    makeup: "glamorous — defined eye, bronzed glow, glossy nude lip",
    tier_affinity: ["intimate_aesthetic", "lifestyle_travel", "lived_moments"],
    family_affinity: ["friends_fun"],
    time_affinity: ["golden_hour", "evening"],
    cooldown_days: 6,
  },
  {
    id: "vs_casual",
    label: "VS casual",
    vibe: "Sexy-casual confidence. Not trying — just is.",
    outfit: "high-waisted denim shorts + triangle bikini top or bralette, oversized linen/cotton shirt worn open and loose",
    hair: "tousled bombshell waves",
    jewelry: "one simple chain, tiny gold earrings",
    makeup: "bronzed, glossy, sun-warmed",
    tier_affinity: ["intimate_aesthetic", "lifestyle_travel", "lived_moments"],
    family_affinity: ["vacation_beach_water"],
    time_affinity: ["midday", "golden_hour"],
    cooldown_days: 6,
  },
  // ── LUXE CAR / NIGHT (passenger-princess crossover — IG-safe ceiling) ──
  {
    id: "passenger_lingerie",
    label: "Passenger-princess lingerie",
    vibe: "Night-luxe passenger seat. Lingerie styled as fashion with thigh-highs — expensive, cinematic, camera-aware. Highest-reach + conversion crossover.",
    outfit: "structured bralette or corset-style top + matching briefs or a mini skirt, sheer black thigh-high stockings, strappy heels. Lingerie-as-fashion, tasteful, IG-edge — never past allowed.",
    hair: "glossy blowout, voluminous evening waves",
    jewelry: "delicate gold — fine chain, small drops, a slim watch",
    makeup: "evening glam — defined eye, bronzed glow, nude-rose lip",
    tier_affinity: ["luxe_car", "intimate_aesthetic"],
    time_affinity: ["evening"],
    cooldown_days: 6,
  },
  {
    id: "night_out_dress",
    label: "Night-out glam dress",
    vibe: "Elegant going-out energy. Premium, poised, quietly sexy — the passenger of an expensive night.",
    outfit: "fitted satin or bodycon mini dress (black, champagne or deep red), thin straps or off-shoulder, low neckline; heels. Optional sheer thigh-highs.",
    hair: "sleek high-shine blowout or a polished low bun",
    jewelry: "fine gold layers, small drop earrings",
    makeup: "polished glam — smoked liner, bronzed cheek, glossy nude lip",
    tier_affinity: ["luxe_car", "lived_moments"],
    family_affinity: ["friends_fun"],
    time_affinity: ["evening"],
    cooldown_days: 6,
  },
  {
    id: "leather_luxe",
    label: "Leather luxe",
    vibe: "Sleek, expensive, after-dark. Confident and cool without trying.",
    outfit: "fitted leather or faux-leather mini skirt + a fine-knit or satin bodysuit / bralette top, sheer tights, ankle boots or heels.",
    hair: "straightened glossy or tousled evening waves",
    jewelry: "minimal gold — one fine chain, small hoops",
    makeup: "cool-toned evening — defined eye, matte nude lip",
    tier_affinity: ["luxe_car", "intimate_aesthetic"],
    time_affinity: ["evening"],
    cooldown_days: 6,
  },
  // ── TRAVEL (occasional accent) ────────────────────────────
  {
    id: "beach_club",
    label: "Beach club",
    vibe: "Luxury beach club. Effortless summer, sunkissed, confident.",
    outfit: "linen oversized open shirt (sand or ivory) over a clean bikini set — triangle top, simple bottom; shirt open, not tied",
    hair: "salt-textured beach waves",
    jewelry: "thin gold body chain, layered anklet, two thin rings",
    makeup: "sunkissed bare — bronzer, mascara, gloss",
    tier_affinity: ["lifestyle_travel", "lived_moments"],
    family_affinity: ["vacation_beach_water"],
    time_affinity: ["midday", "golden_hour"],
    cooldown_days: 6,
  },
  {
    id: "european_summer",
    label: "European summer",
    vibe: "Amalfi / European summer. Feminine, warm, effortlessly dressed.",
    outfit: "white flowy mini skirt + fitted ribbed crop or silky tank tucked in",
    hair: "soft loose waves, effortless",
    jewelry: "thin necklace, small hoops",
    makeup: "fresh — light coverage, defined lashes, warm lip",
    tier_affinity: ["lifestyle_travel", "lived_moments"],
    family_affinity: ["vacation_beach_water", "city_transit"],
    time_affinity: ["morning", "midday", "golden_hour"],
    cooldown_days: 6,
  },
  {
    id: "yacht_resort",
    label: "Yacht / resort",
    vibe: "Quiet-luxury resort. Understated confidence.",
    outfit: "silk wrap skirt (ivory/champagne) knotted at the hip + clean bandeau or bikini top",
    hair: "slick low bun, smooth crown",
    jewelry: "oversized sunglasses (no brand), thin gold chain",
    makeup: "clean resort — light, natural, healthy",
    tier_affinity: ["lifestyle_travel", "lived_moments"],
    family_affinity: ["vacation_beach_water"],
    time_affinity: ["midday", "golden_hour"],
    cooldown_days: 7,
  },
  {
    id: "sunset_romantic",
    label: "Sunset romantic",
    vibe: "Soft feminine sunset look. Romantic, warm-lit, lightly dressed up.",
    outfit: "satin mini skirt (champagne/blush) + fine-knit top (cream/ecru), slightly off-shoulder or low scoop, untucked",
    hair: "romantic soft waves",
    jewelry: "layered thin gold chains, small hoops",
    makeup: "soft glam — warm eye, bronzed cheek, satin rose lip",
    tier_affinity: ["intimate_aesthetic", "lifestyle_travel"],
    time_affinity: ["golden_hour", "evening"],
    cooldown_days: 6,
  },
];

export async function pickStylingProfile(
  characterId: string,
  tier: string,
  family?: MomentFamily | null
): Promise<StylingProfile> {
  // Load recently used profiles (last 21 days)
  const { data: recentPlans } = await supabase
    .from("chs_daily_plans")
    .select("styling_profile, created_at")
    .eq("character_id", characterId)
    .not("styling_profile", "is", null)
    .order("created_at", { ascending: false })
    .limit(21);

  const now = Date.now();

  const lastUsedMap = new Map<string, number>();
  for (const row of recentPlans ?? []) {
    const id = (row as { styling_profile: string }).styling_profile;
    const t = new Date((row as { created_at: string }).created_at).getTime();
    if (!lastUsedMap.has(id) || t > lastUsedMap.get(id)!) {
      lastUsedMap.set(id, t);
    }
  }

  const isInCooldown = (p: StylingProfile): boolean => {
    const lastUsed = lastUsedMap.get(p.id);
    if (!lastUsed) return false;
    const ageMs = now - lastUsed;
    return ageMs < p.cooldown_days * 24 * 60 * 60 * 1000;
  };

  const tierKey = tier as TierName;
  const tierMatch = (p: StylingProfile) => p.tier_affinity.includes(tierKey);
  const familyMatch = (p: StylingProfile) => !!family && (p.family_affinity?.includes(family) ?? false);

  // Cascade of pools, most-specific first. For lived_moments the day's family
  // leads (so a beach day gets beachwear, a home day gets home looks); otherwise
  // it's the original tier-based cascade. Each step falls through if empty.
  const cascade: Array<(p: StylingProfile) => boolean> = family
    ? [
        (p) => !isInCooldown(p) && tierMatch(p) && familyMatch(p), // tier + family, fresh
        (p) => tierMatch(p) && familyMatch(p),                     // tier + family, ignore cooldown
        (p) => familyMatch(p),                                     // family only
        (p) => !isInCooldown(p) && tierMatch(p),                   // tier only, fresh
        (p) => tierMatch(p),                                       // tier only
        (p) => !isInCooldown(p),                                   // anything fresh
      ]
    : [
        (p) => !isInCooldown(p) && tierMatch(p),
        (p) => tierMatch(p),
        (p) => !isInCooldown(p),
      ];

  let pool: StylingProfile[] = [];
  for (const pred of cascade) {
    pool = STYLING_PROFILES.filter(pred);
    if (pool.length > 0) break;
  }
  if (pool.length === 0) pool = STYLING_PROFILES;

  return pool[Math.floor(Math.random() * pool.length)];
}
