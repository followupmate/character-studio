import { supabase } from "@/lib/supabase";

export interface StylingProfile {
  id: string;
  label: string;
  vibe: string;
  outfit: string;
  hair: string;
  jewelry: string;
  makeup: string;
  /** which tiers this profile fits best */
  tier_affinity: Array<"lifestyle_travel" | "intimate_aesthetic">;
  /** rough time of day preference — scene brief may adapt */
  time_affinity: Array<"morning" | "midday" | "golden_hour" | "evening" | "any">;
  cooldown_days: number;
}

export const STYLING_PROFILES: StylingProfile[] = [
  {
    id: "couture_evening",
    label: "Couture evening",
    vibe: "Red carpet / haute couture. Clean lines, luxurious materials. Emphasis on face, neck, silhouette.",
    outfit: "full-length couture evening gown — ivory or champagne, structured bodice, floor-length skirt, clean elegant silhouette, no embellishment",
    hair: "elegant updo — sleek low chignon or sculpted top knot, no loose pieces, smooth finish",
    jewelry: "minimal gold — one delicate necklace, small gold studs or tiny hoops only",
    makeup: "sophisticated editorial — precisely defined brow, nude or blush lip, soft sculpted contour",
    tier_affinity: ["lifestyle_travel"],
    time_affinity: ["evening"],
    cooldown_days: 7,
  },
  {
    id: "vs_glamour",
    label: "VS glamour",
    vibe: "Victoria's Secret mood. Glamorous, confident, feminine. Figure-forward but elegant.",
    outfit: "satin bodycon midi dress or fitted gown — champagne or nude, figure-hugging, low neckline, thin straps",
    hair: "Victoria's Secret bombshell waves — voluminous, loose, blown-out, high-shine",
    jewelry: "delicate gold — layered thin chains at varying lengths, small drop earrings",
    makeup: "glamorous feminine — defined eye, bronzed glow, glossy nude lip",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["golden_hour", "evening"],
    cooldown_days: 7,
  },
  {
    id: "beach_club",
    label: "Beach club",
    vibe: "Luxury beach club. Effortless summer. Sunkissed, easy, confident.",
    outfit: "linen oversized open shirt (sand or ivory) worn loose over white bikini set — triangle top, minimal high-cut bottom. shirt open, not tied",
    hair: "relaxed beach waves — tousled, salt-textured, natural movement, unstyled ends",
    jewelry: "gold body jewelry — thin waist chain, layered ankle bracelet, two or three thin rings",
    makeup: "sunkissed bare — bronzer, mascara, clear or tinted gloss, no foundation",
    tier_affinity: ["lifestyle_travel", "intimate_aesthetic"],
    time_affinity: ["midday", "golden_hour"],
    cooldown_days: 6,
  },
  {
    id: "european_summer",
    label: "European summer",
    vibe: "European summer / Amalfi vibe. Feminine, warm, effortlessly dressed. She just arrived by ferry.",
    outfit: "white flowy mini skirt — lightweight, above knee, movement-forward. fitted crop top — ribbed knit or silky, minimal cut, tucked in",
    hair: "soft loose waves — effortless, minimal product, slight natural texture",
    jewelry: "delicate gold — one thin necklace, small hoop earrings",
    makeup: "fresh feminine — light coverage, defined lashes, warm tinted lip",
    tier_affinity: ["lifestyle_travel"],
    time_affinity: ["morning", "midday", "golden_hour"],
    cooldown_days: 5,
  },
  {
    id: "vs_casual",
    label: "VS casual summer",
    vibe: "Victoria's Secret summer mood. Sexy, casual, confident. Not trying — just is.",
    outfit: "high-waisted denim shorts — short, fitted, not distressed. triangle bikini top — gold or warm nude. oversized linen or cotton shirt worn open and loose, no bra visible under shirt",
    hair: "tousled bombshell waves — voluminous, undone, confident movement",
    jewelry: "minimal — one simple chain, tiny gold earrings",
    makeup: "VS casual — bronzed, glossy, confident. sun-warmed skin visible",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["midday", "golden_hour"],
    cooldown_days: 6,
  },
  {
    id: "yacht_resort",
    label: "Yacht / resort",
    vibe: "Quiet luxury yacht styling. Understated confidence. She belongs on every terrace.",
    outfit: "silk wrap skirt — ivory or champagne, mid-length, knotted loosely at hip. black or nude bandeau bikini top — minimal, clean lines. nothing else",
    hair: "slick low bun — pulled back cleanly, no flyaways, smooth through the crown",
    jewelry: "oversized sunglasses (no visible brand), thin gold chain necklace only",
    makeup: "clean resort — light, natural, healthy finish",
    tier_affinity: ["lifestyle_travel"],
    time_affinity: ["midday", "golden_hour"],
    cooldown_days: 6,
  },
  {
    id: "sunset_romantic",
    label: "Sunset romantic",
    vibe: "Soft feminine sunset look. Romantic, warm-lit, slightly dressed up. End of a perfect day.",
    outfit: "satin mini skirt — champagne or blush, above knee, bias cut. lightweight fine-gauge knit top — cream or ecru, slightly off-shoulder or low scoop neck, untucked",
    hair: "romantic soft waves — half-up or fully loose, gentle movement, golden-hour finish",
    jewelry: "layered gold — two or three thin chains at varying lengths, small gold hoops",
    makeup: "soft glam — warm eye, bronzed cheek, satin rose lip",
    tier_affinity: ["lifestyle_travel", "intimate_aesthetic"],
    time_affinity: ["golden_hour", "evening"],
    cooldown_days: 5,
  },
];

export async function pickStylingProfile(
  characterId: string,
  tier: string
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

  // Build cooldown map: profileId → last used timestamp
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

  // Prefer profiles with matching tier_affinity and not in cooldown
  const tierKey = tier as "lifestyle_travel" | "intimate_aesthetic";
  const preferred = STYLING_PROFILES.filter(
    (p) => !isInCooldown(p) && p.tier_affinity.includes(tierKey)
  );
  const any = STYLING_PROFILES.filter((p) => !isInCooldown(p));
  const pool = preferred.length > 0 ? preferred : any.length > 0 ? any : STYLING_PROFILES;

  return pool[Math.floor(Math.random() * pool.length)];
}
