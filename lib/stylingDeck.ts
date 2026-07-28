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
  /** sensual_visual_language_v1 (iteration 2) — coarse weather compatibility. Omitted on
   * existing STYLING_PROFILES entries (implicitly "any", zero behavior change); set on new
   * MAGNETIC_STYLING_PROFILES entries so e.g. swimwear-adjacent looks aren't forced in the rain. */
  weather_affinity?: Array<"indoor" | "outdoor_warm" | "outdoor_cool" | "any">;
  /** sex_appeal_style_v1 (iteration 3) — normalized family tag matching
   * lib/situationPlanner.ts's normalizeOutfitArchetypeFamily() output, so the situation
   * planner's declared sex_appeal_style.outfit_archetype can actually steer which StylingProfile
   * gets picked (see selectStylingSourcePool's outfitFamilyHint cascade step below). Omitted on
   * existing STYLING_PROFILES entries — always compatible, zero behavior change. */
  outfit_family?: string;
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

// sensual_visual_language_v1 (iteration 2) — a production dry-run collage skewed toward sweaters/
// robes/joggers/neutral gym sets. These are the identified "too safe" defaults that produced it;
// excluded from the candidate pool (for the tiers they appear in) when useMagneticPool is on —
// see selectStylingSourcePool() below. Named/exported so it's easy to tune.
export const SAFE_TAME_IDS = ["cozy_home_knit", "loungewear_set", "oversized_tee_home", "robe_morning", "athleisure_pilates"];

// New wardrobe families with a concrete, visually executable garment named — precisely what
// lib/situationValidation.ts's noGenericWardrobeSignal requires downstream, and precisely what
// was missing from the collage the product review flagged (safe sweaters/robes/joggers instead
// of short/fitted/open/sheer looks). Same structural shape as STYLING_PROFILES — no new required
// fields, just more items plus the optional weather_affinity tag.
export const MAGNETIC_STYLING_PROFILES: StylingProfile[] = [
  // ── EVERYDAY / LIVED MOMENTS ──────────────────────────────
  {
    id: "mini_dress_day",
    label: "Mini dress, out and about",
    vibe: "Confident daytime magnetism. A short fitted dress that moves with her — deliberate, not accidental.",
    outfit: "fitted mini dress (rib-knit or jersey), thin straps or short sleeve, hem sitting mid-thigh; simple sandals or sneakers",
    hair: "natural waves, loose",
    jewelry: "thin gold chain, small hoops",
    makeup: "natural glow, defined lash, warm lip",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit", "friends_fun"],
    time_affinity: ["midday", "golden_hour", "any"],
    weather_affinity: ["outdoor_warm", "indoor"],
    outfit_family: "mini_dress",
    cooldown_days: 5,
  },
  {
    id: "fitted_mini_skirt",
    label: "Fitted mini skirt",
    vibe: "Everyday polish with an edge — legs are the story.",
    outfit: "fitted mini skirt (denim or ponte) + fitted crop top or tucked-in tee, sneakers or low heels",
    hair: "sleek ponytail or loose waves",
    jewelry: "thin gold chain, small studs",
    makeup: "fresh, defined brow, tinted lip",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["outdoor_warm", "indoor"],
    outfit_family: "mini_skirt",
    cooldown_days: 5,
  },
  {
    id: "denim_shorts_day",
    label: "Short denim shorts",
    vibe: "Short denim shorts, effortless legs-forward summer errand energy.",
    outfit: "high-waisted short denim shorts + fitted ribbed tank, open shirt optional",
    hair: "natural waves, movement",
    jewelry: "thin chain, small hoops",
    makeup: "sunkissed natural",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit", "vacation_beach_water"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["outdoor_warm"],
    outfit_family: "shorts_look",
    cooldown_days: 5,
  },
  {
    id: "satin_camisole_evening",
    label: "Satin camisole, evening",
    vibe: "Satin camisole under an open layer — quiet evening polish.",
    outfit: "satin camisole (bias cut, thin straps) + straight trousers or jeans, blazer or cardigan worn open",
    hair: "soft waves",
    jewelry: "delicate gold layers",
    makeup: "soft evening glam",
    tier_affinity: ["lived_moments", "everyday_life"],
    family_affinity: ["friends_fun"],
    time_affinity: ["evening", "golden_hour"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "camisole_set",
    cooldown_days: 6,
  },
  {
    id: "cropped_tank_waist",
    label: "Cropped tank, waist exposed",
    vibe: "Fitted cropped tank, waist as the anchor — casual but deliberate.",
    outfit: "fitted cropped tank (ribbed) exposing the waist + high-waisted jeans or trousers",
    hair: "low bun or waves",
    jewelry: "small studs",
    makeup: "clean everyday glow",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["home_private", "city_transit"],
    time_affinity: ["any"],
    weather_affinity: ["indoor", "outdoor_warm"],
    cooldown_days: 5,
  },
  {
    id: "open_shirt_fitted_top",
    label: "Open shirt over fitted top",
    vibe: "Open oversized shirt over a fitted top — a controlled reveal, not an accident.",
    outfit: "oversized linen or cotton shirt worn fully open (unbuttoned, sleeves loose) over a fitted camisole or bralette top, denim or shorts beneath",
    hair: "natural waves",
    jewelry: "thin gold chain",
    makeup: "sun-warmed natural",
    tier_affinity: ["lived_moments", "everyday_life"],
    family_affinity: ["vacation_beach_water", "home_private"],
    time_affinity: ["midday", "golden_hour", "morning"],
    weather_affinity: ["outdoor_warm", "indoor"],
    outfit_family: "open_shirt_layer",
    cooldown_days: 5,
  },
  {
    id: "sheer_knit_layer",
    label: "Sheer knit over opaque layer",
    vibe: "Fine, semi-sheer knit over an opaque underlayer — texture and silhouette, fully covered.",
    outfit: "fine-gauge semi-sheer knit top layered over an opaque fitted camisole or bralette, fitted bottoms",
    hair: "soft waves",
    jewelry: "delicate gold",
    makeup: "soft glow",
    tier_affinity: ["lived_moments", "everyday_life"],
    family_affinity: ["home_private", "friends_fun"],
    time_affinity: ["evening", "any"],
    weather_affinity: ["indoor"],
    outfit_family: "sheer_top",
    cooldown_days: 6,
  },
  {
    id: "blazer_bare_legs",
    label: "Blazer, bare legs",
    vibe: "An oversized blazer as the whole outfit — bare legs, deliberate, elegant, a little daring.",
    outfit: "oversized tailored blazer worn as a dress (buttoned or open over a fitted camisole), bare legs, heels or boots",
    hair: "sleek blowout",
    jewelry: "fine gold layers, small drop earrings",
    makeup: "polished evening",
    tier_affinity: ["lived_moments", "luxe_car"],
    family_affinity: ["friends_fun"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "blazer_bare_legs",
    cooldown_days: 6,
  },
  {
    id: "summer_dress_slit",
    label: "Summer dress, thigh slit",
    vibe: "A flowing summer dress with a thigh-high slit — soft in motion, deliberate when she moves.",
    outfit: "lightweight summer dress (linen or viscose) with a thigh-high side slit, fitted through the bodice",
    hair: "loose waves",
    jewelry: "thin gold anklet, small hoops",
    makeup: "sunkissed glow",
    tier_affinity: ["lived_moments", "everyday_life"],
    family_affinity: ["vacation_beach_water", "city_transit"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["outdoor_warm"],
    outfit_family: "high_slit_dress",
    cooldown_days: 6,
  },
  // ── WELLNESS / FITNESS ────────────────────────────────────
  {
    id: "sports_bra_solo",
    label: "Sports bra, no cover layer",
    vibe: "Sports bra as the top layer — strong, body-forward, unapologetic.",
    outfit: "fitted seamless sports bra + high-waisted leggings or bike shorts, no cover layer",
    hair: "high pony",
    jewelry: "thin gold chain",
    makeup: "minimal, sporty glow",
    tier_affinity: ["wellness_fitness"],
    time_affinity: ["morning", "midday"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "activewear",
    cooldown_days: 4,
  },
  {
    id: "cropped_athletic_top",
    label: "Cropped athletic top",
    vibe: "Cropped athletic top exposing the midriff mid-movement.",
    outfit: "cropped fitted athletic top + high-waisted leggings, midriff visible",
    hair: "low pony or braid",
    jewelry: "thin studs",
    makeup: "fresh, dewy",
    tier_affinity: ["wellness_fitness"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "activewear",
    cooldown_days: 4,
  },
  {
    id: "fitted_shorts_active",
    label: "Fitted athletic shorts",
    vibe: "Fitted athletic shorts, legs the whole point of the frame.",
    outfit: "fitted running or dance shorts + fitted tank or sports bra",
    hair: "high pony, movement",
    jewelry: "none or thin chain",
    makeup: "sporty minimal",
    tier_affinity: ["wellness_fitness"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["outdoor_warm", "indoor"],
    outfit_family: "activewear",
    cooldown_days: 4,
  },
  {
    id: "athletic_bodysuit_safe",
    label: "High-cut athletic bodysuit",
    vibe: "High-cut athletic bodysuit — safe coverage, strong silhouette, dance/training energy.",
    outfit: "high-cut fitted athletic bodysuit (full safe coverage through the torso), sheer or fitted tights optional",
    hair: "sleek bun",
    jewelry: "none",
    makeup: "clean dance-studio glow",
    tier_affinity: ["wellness_fitness"],
    time_affinity: ["midday", "evening"],
    weather_affinity: ["indoor"],
    outfit_family: "activewear",
    cooldown_days: 5,
  },
  {
    id: "swim_open_shirt_wellness",
    label: "Swimwear, open shirt (wellness)",
    vibe: "Swimwear with an open shirt — poolside recovery, unhurried.",
    outfit: "fitted one-piece or bikini + open lightweight shirt worn loose",
    hair: "damp, natural",
    jewelry: "thin body chain",
    makeup: "bare, dewy",
    tier_affinity: ["wellness_fitness"],
    family_affinity: ["vacation_beach_water"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["outdoor_warm"],
    outfit_family: "swimwear_coverup",
    cooldown_days: 5,
  },
  {
    id: "recovery_body_conscious",
    label: "Post-training recovery set",
    vibe: "Post-training recovery — body-conscious, unhurried, earned.",
    outfit: "fitted seamless recovery set (bralette + bike shorts), oversized unzipped jacket optional",
    hair: "loose, slightly damp",
    jewelry: "thin chain",
    makeup: "bare, post-workout flush",
    tier_affinity: ["wellness_fitness"],
    time_affinity: ["midday", "evening"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "activewear",
    cooldown_days: 4,
  },
  // ── INTIMATE AESTHETIC (dopĺňa existujúce bedroom_lingerie/vs_glamour/vs_casual) ──
  {
    id: "satin_slip_dress",
    label: "Satin slip dress",
    vibe: "Satin slip dress — situation-first (getting ready, aftermath, private moment), never posed for its own sake.",
    outfit: "bias-cut satin slip dress, thin straps, mid-thigh to knee length",
    hair: "soft waves, bedroom-undone",
    jewelry: "delicate gold chain",
    makeup: "soft glam",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["morning", "evening"],
    weather_affinity: ["indoor"],
    outfit_family: "slip_dress",
    cooldown_days: 6,
  },
  {
    id: "bra_top_open_shirt",
    label: "Bra-like top, open shirt",
    vibe: "A coordinated bra-like top under an open shirt — fashion-forward, IG-safe, deliberate.",
    outfit: "structured bralette-style top (fashion, not underwear-styled) + fully open oversized shirt, fitted bottoms",
    hair: "tousled waves",
    jewelry: "thin gold chain",
    makeup: "soft glam",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["morning", "evening"],
    weather_affinity: ["indoor"],
    outfit_family: "open_shirt_layer",
    cooldown_days: 6,
  },
  {
    id: "camisole_short_skirt",
    label: "Camisole, short skirt",
    vibe: "Fitted camisole and short skirt — getting-ready or just-back energy.",
    outfit: "fitted satin camisole + fitted short skirt",
    hair: "soft waves",
    jewelry: "delicate gold",
    makeup: "soft glam",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "camisole_set",
    cooldown_days: 6,
  },
  {
    id: "semi_sheer_blouse",
    label: "Semi-sheer blouse, opaque coverage",
    vibe: "Semi-sheer blouse over full opaque coverage — texture and silhouette, never explicit.",
    outfit: "semi-sheer blouse (chiffon/georgette) over an opaque fitted camisole or bra top, tucked into a skirt or trousers",
    hair: "soft waves",
    jewelry: "thin gold",
    makeup: "soft glam",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "sheer_top",
    cooldown_days: 6,
  },
  {
    id: "open_robe_safe_set",
    label: "Open robe over safe set",
    vibe: "An open robe over a safe fitted set — private, unhurried, IG-edge.",
    outfit: "silk or satin robe worn open over a fitted safe set (camisole + shorts), never fully undone",
    hair: "damp or tousled",
    jewelry: "none or thin chain",
    makeup: "fresh, dewy",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["morning"],
    weather_affinity: ["indoor"],
    cooldown_days: 6,
  },
  {
    id: "cover_up_swim_intimate",
    label: "Swimwear, cover-up (intimate)",
    vibe: "Swimwear or bodysuit with a cover-up — poolside private moment.",
    outfit: "fitted swimsuit or bodysuit + a sheer or open cover-up worn loose",
    hair: "damp, tousled",
    jewelry: "thin body chain",
    makeup: "bare, dewy",
    tier_affinity: ["intimate_aesthetic"],
    family_affinity: ["vacation_beach_water"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["outdoor_warm"],
    outfit_family: "swimwear_coverup",
    cooldown_days: 6,
  },
  {
    id: "evening_dress_getting_ready",
    label: "Evening dress, getting-ready/aftermath",
    vibe: "An evening dress mid getting-ready or aftermath — the moment before or after, not the event itself.",
    outfit: "fitted satin or bodycon evening dress, half-zipped or straps still down, heels not yet on",
    hair: "in-progress — half-styled waves",
    jewelry: "one piece being fastened",
    makeup: "in-progress glam",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "evening_dress",
    cooldown_days: 6,
  },
];

// sex_appeal_style_v1 (iteration 3) — incremental to MAGNETIC_STYLING_PROFILES, not a duplicate:
// iteration 2 already covers most of the sex-appeal archetype list (mini skirt, sheer blouse,
// camisole+skirt, blazer+bare legs, sports bra, swim cover-up, ...). This fills the remaining gaps
// the plan called out by name: bodycon/sheath/cocktail/high-slit dress shapes, a stockings-enhanced
// look, a sleek nightlife top, and a sculpting recovery set. Stockings-style looks get
// weather_affinity: ["indoor"] and no vacation_beach_water family_affinity by design (doplnenie #3
// guardrail) so the mechanical time/weather cascade in selectStylingSourcePool keeps them out of
// beach/pool days even before the LLM-side AVOID guidance or outfitArchetypeContextuallyPlausible
// validation ever run.
export const SEX_APPEAL_STYLING_PROFILES: StylingProfile[] = [
  {
    id: "bodycon_mini_dress",
    label: "Bodycon mini dress",
    vibe: "A bodycon mini dress — the shape does the talking, situation still comes first.",
    outfit: "fitted bodycon mini dress, stretch jersey or ribbed knit, hem mid-thigh",
    hair: "sleek waves",
    jewelry: "thin gold chain, small hoops",
    makeup: "defined, warm glam",
    tier_affinity: ["lived_moments", "intimate_aesthetic", "everyday_life"],
    family_affinity: ["friends_fun", "city_transit"],
    time_affinity: ["golden_hour", "evening"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "bodycon_dress",
    cooldown_days: 6,
  },
  {
    id: "fitted_sheath_dress",
    label: "Fitted sheath dress",
    vibe: "A fitted sheath dress — polished, body-conscious, understated confidence.",
    outfit: "fitted sheath or pencil dress, knee-length, structured through the waist and hip",
    hair: "sleek low bun or straight",
    jewelry: "delicate gold studs",
    makeup: "polished, neutral glam",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "sheath_pencil_dress",
    cooldown_days: 6,
  },
  {
    id: "high_slit_evening_dress",
    label: "High-slit evening dress",
    vibe: "An evening dress with a high slit — leg visibility built into the silhouette, not staged for it.",
    outfit: "fitted evening dress with a thigh-high slit, fitted through the bodice",
    hair: "soft glam waves",
    jewelry: "statement earrings",
    makeup: "full glam",
    tier_affinity: ["intimate_aesthetic", "luxe_car"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "high_slit_dress",
    cooldown_days: 7,
  },
  {
    id: "short_cocktail_dress",
    label: "Short cocktail dress",
    vibe: "A short cocktail dress — going-out energy, fitted and deliberate.",
    outfit: "fitted short cocktail dress, structured bodice, hem above the knee",
    hair: "voluminous waves",
    jewelry: "statement gold hoops",
    makeup: "full glam",
    tier_affinity: ["lived_moments", "luxe_car"],
    family_affinity: ["friends_fun"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "cocktail_dress",
    cooldown_days: 6,
  },
  {
    id: "stockings_enhanced_look",
    label: "Stockings-enhanced look",
    vibe: "Sheer stockings under a fitted hem — texture and leg line, private/indoor context only.",
    outfit: "fitted mini skirt or dress + sheer thigh-high stockings, garter detail optional",
    hair: "sleek waves",
    jewelry: "thin gold chain",
    makeup: "soft glam",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "stockings_look",
    cooldown_days: 8,
  },
  {
    id: "sleek_nightlife_top",
    label: "Sleek nightlife top",
    vibe: "A sleek fitted top built for going out — clean silhouette, no fuss.",
    outfit: "fitted satin or ribbed nightlife top (halter or cowl neck) + tailored trousers or a fitted skirt",
    hair: "sleek straight or low pony",
    jewelry: "delicate gold chain",
    makeup: "defined, dewy glam",
    tier_affinity: ["lived_moments", "luxe_car"],
    family_affinity: ["friends_fun", "city_transit"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "nightlife_top",
    cooldown_days: 6,
  },
  {
    id: "sculpting_leggings_recovery",
    label: "Sculpting leggings, recovery set",
    vibe: "A sculpting recovery set — body-conscious without being workout-literal.",
    outfit: "fitted sculpting leggings + fitted long-sleeve or zip top, seamless, no gym equipment in frame",
    hair: "sleek low pony",
    jewelry: "none or thin chain",
    makeup: "bare, fresh",
    tier_affinity: ["wellness_fitness", "everyday_life"],
    time_affinity: ["morning", "midday"],
    weather_affinity: ["indoor", "outdoor_cool"],
    outfit_family: "activewear",
    cooldown_days: 5,
  },
];

// luxury_seduction_v1 (iteration 4) — 6 genuinely new families (structured_blazer_dress,
// corset_pencil_skirt, silk_blouse_leather_skirt, fitted_bodysuit_trousers, fitted_jumpsuit,
// open_back_dress) PLUS second, stylistically distinct entries for families that previously had
// exactly ONE deck entry (slip_dress, swimwear_coverup, bodycon_dress, sheath_pencil_dress,
// cocktail_dress, evening_dress, stockings_look, nightlife_top). A single-entry family is a
// deterministic-rendering trap independent of anti-repeat: once outfitFamilyHint narrows the pool
// to that one entry, pickStylingProfile's cooldown-respecting cascade steps all resolve to the
// same lone item (`if (pool.length === 0) pool = sourcePool` is a no-op when sourcePool was
// already narrowed) — the actually-rendered wardrobe/hair/jewelry text was very likely
// byte-identical every time slip_dress/swimwear_coverup fired in the iteration-3 live run, not
// just word-similar. Every sibling entry below has genuinely distinct label/outfit/hair/jewelry/
// makeup text from its counterpart, not just a different tier.
export const LUXURY_SEDUCTION_STYLING_PROFILES: StylingProfile[] = [
  {
    id: "structured_blazer_dress_luxury",
    label: "Structured blazer dress",
    vibe: "A structured blazer dress — sharp tailoring worn as the whole outfit, nothing underneath needed.",
    outfit: "fitted structured blazer dress, strong shoulder line, cinched waist, hem mid-thigh",
    hair: "sleek low bun",
    jewelry: "statement earrings, thin gold cuff",
    makeup: "defined brow, matte glam",
    tier_affinity: ["luxe_car", "intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "structured_blazer_dress",
    cooldown_days: 7,
  },
  {
    id: "corset_pencil_skirt_luxury",
    label: "Corset top, pencil skirt",
    vibe: "A corset top over a pencil skirt — old-money tailoring with a sharp waist.",
    outfit: "structured corset-style top (fashion, not underwear-styled) + fitted pencil skirt, knee-length",
    hair: "sleek straight",
    jewelry: "delicate gold studs, thin necklace",
    makeup: "polished, defined lip",
    tier_affinity: ["luxe_car", "intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "corset_pencil_skirt",
    cooldown_days: 7,
  },
  {
    id: "silk_blouse_leather_skirt_luxury",
    label: "Silk blouse, leather skirt",
    vibe: "A silk blouse tucked into a leather mini skirt — soft fabric against structured leather.",
    outfit: "fitted silk blouse, top button undone, tucked into a fitted leather mini skirt",
    hair: "loose waves",
    jewelry: "thin gold chain, small hoops",
    makeup: "soft glam, defined lash",
    tier_affinity: ["luxe_car", "lived_moments"],
    family_affinity: ["city_transit", "friends_fun"],
    time_affinity: ["golden_hour", "evening"],
    weather_affinity: ["indoor"],
    outfit_family: "silk_blouse_leather_skirt",
    cooldown_days: 7,
  },
  {
    id: "fitted_bodysuit_trousers_luxury",
    label: "Fitted bodysuit, tailored trousers",
    vibe: "A fitted bodysuit under tailored trousers — clean line, quietly expensive.",
    outfit: "fitted long-sleeve or sleeveless bodysuit + high-waisted tailored trousers, no jacket",
    hair: "sleek low pony",
    jewelry: "delicate gold studs",
    makeup: "clean, dewy",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "fitted_bodysuit_trousers",
    cooldown_days: 6,
  },
  {
    id: "fitted_jumpsuit_luxury",
    label: "Fitted jumpsuit",
    vibe: "A fitted jumpsuit — one clean line from shoulder to ankle, no separates needed.",
    outfit: "fitted sleeveless or long-sleeve jumpsuit, deep but safe neckline, cinched waist",
    hair: "sleek waves",
    jewelry: "statement earrings",
    makeup: "defined, warm glam",
    tier_affinity: ["lived_moments", "luxe_car"],
    family_affinity: ["friends_fun"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "fitted_jumpsuit",
    cooldown_days: 6,
  },
  {
    id: "open_back_dress_luxury",
    label: "Open-back dress",
    vibe: "An open-back dress — the reveal is the spine line, not the neckline.",
    outfit: "fitted dress with a low open back, structured front, thin straps or halter",
    hair: "updo or half-up, keeping the back visible",
    jewelry: "delicate gold chain, small drop earrings",
    makeup: "soft glam",
    tier_affinity: ["luxe_car", "intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "open_back_dress",
    cooldown_days: 7,
  },
  {
    id: "cocktail_dress_sequin",
    label: "Sequin cocktail dress",
    vibe: "A sequin cocktail dress — catches the light differently from anything else in rotation.",
    outfit: "fitted short cocktail dress in a fine sequin or metallic knit, structured bodice",
    hair: "voluminous curls",
    jewelry: "statement drop earrings",
    makeup: "full glam, bold lip",
    tier_affinity: ["luxe_car", "lived_moments"],
    family_affinity: ["friends_fun"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "cocktail_dress",
    cooldown_days: 8,
  },
  {
    id: "evening_dress_halter",
    label: "Halter satin evening dress",
    vibe: "A halter-neck satin evening dress — long, fluid, the opposite silhouette of a mini.",
    outfit: "floor-length halter-neck satin evening dress, fitted through the waist, fluid skirt",
    hair: "sleek low bun",
    jewelry: "delicate drop earrings, thin bracelet",
    makeup: "polished, neutral glam",
    tier_affinity: ["luxe_car", "intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "evening_dress",
    cooldown_days: 8,
  },
  {
    id: "stockings_look_luxury",
    label: "Tights, leather skirt, heels",
    vibe: "Sheer tights under a leather skirt — texture layered on texture, private/indoor context only.",
    outfit: "fitted leather mini skirt + sheer tights + fitted top, heels",
    hair: "sleek straight",
    jewelry: "thin gold chain",
    makeup: "defined, matte",
    tier_affinity: ["intimate_aesthetic", "luxe_car"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "stockings_look",
    cooldown_days: 8,
  },
  {
    id: "bodycon_dress_luxury",
    label: "Bodycon dress, textured knit",
    vibe: "A bodycon dress in a textured metallic knit — same silhouette family, different material story.",
    outfit: "fitted bodycon dress in a ribbed metallic knit, long sleeve, hem mid-thigh",
    hair: "sleek center part",
    jewelry: "layered thin necklaces",
    makeup: "dewy, bold brow",
    tier_affinity: ["luxe_car", "lived_moments"],
    family_affinity: ["friends_fun"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "bodycon_dress",
    cooldown_days: 7,
  },
  {
    id: "sheath_pencil_dress_luxury",
    label: "Sheath dress, structured crepe",
    vibe: "A structured crepe sheath dress — architectural, not soft.",
    outfit: "fitted structured crepe sheath dress, sharp neckline, knee-length",
    hair: "sleek low ponytail",
    jewelry: "statement watch, thin gold band",
    makeup: "polished, understated",
    tier_affinity: ["everyday_life", "lived_moments"],
    family_affinity: ["city_transit"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["indoor", "outdoor_warm"],
    outfit_family: "sheath_pencil_dress",
    cooldown_days: 6,
  },
  {
    id: "nightlife_top_luxury",
    label: "Metallic knit nightlife top",
    vibe: "A metallic knit top built for going out — different texture story from the satin/ribbed version already in rotation.",
    outfit: "fitted metallic knit halter top + tailored trousers, no jacket",
    hair: "sleek straight",
    jewelry: "statement earrings",
    makeup: "defined, dewy glam",
    tier_affinity: ["luxe_car", "lived_moments"],
    family_affinity: ["friends_fun", "city_transit"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "nightlife_top",
    cooldown_days: 6,
  },
  {
    id: "slip_dress_luxury",
    label: "Slip dress, deep jewel tone",
    vibe: "A satin slip dress in a deep jewel tone — same silhouette, deliberately different colour story from the champagne-gold version already in rotation.",
    outfit: "bias-cut satin slip dress in emerald or burgundy, thin straps, mid-calf length",
    hair: "sleek center part",
    jewelry: "delicate gold drop earrings",
    makeup: "bold lip, soft eye",
    tier_affinity: ["intimate_aesthetic"],
    time_affinity: ["evening"],
    weather_affinity: ["indoor"],
    outfit_family: "slip_dress",
    cooldown_days: 7,
  },
  {
    id: "swimwear_coverup_luxury",
    label: "Structured swim set, sarong cover-up",
    vibe: "A structured swim set with a tied sarong cover-up — different silhouette story from the loose open-shirt version already in rotation.",
    outfit: "structured high-waisted swim set + a tied sarong or wrap cover-up at the hip",
    hair: "loose waves, sun-dried texture",
    jewelry: "thin gold anklet, small hoops",
    makeup: "bare, dewy, sun-kissed",
    tier_affinity: ["lived_moments", "intimate_aesthetic"],
    family_affinity: ["vacation_beach_water"],
    time_affinity: ["midday", "golden_hour"],
    weather_affinity: ["outdoor_warm"],
    outfit_family: "swimwear_coverup",
    cooldown_days: 7,
  },
];

function mapTimeOfDay(timeOfDay?: string): "morning" | "midday" | "golden_hour" | "evening" | undefined {
  if (!timeOfDay) return undefined;
  if (/^(dawn|morning)$/i.test(timeOfDay)) return "morning";
  if (/^midday$/i.test(timeOfDay)) return "midday";
  if (/^golden_hour$/i.test(timeOfDay)) return "golden_hour";
  if (/^(dusk|blue_hour|night|indoor_lamp|fluorescent)$/i.test(timeOfDay)) return "evening";
  return undefined;
}

function mapWeather(weather?: string): "indoor" | "outdoor_warm" | "outdoor_cool" | undefined {
  if (!weather) return undefined;
  if (/indoor/i.test(weather)) return "indoor";
  if (/rain|cold|snow|wind/i.test(weather)) return "outdoor_cool";
  return "outdoor_warm";
}

export interface StylingSituationContext {
  timeOfDay?: string;
  weather?: string;
}

// Pure — extracted specifically so it's unit-testable without a Supabase mock (pickStylingProfile
// itself is DB-bound throughout, same as pickTier). Does THREE things: (a) magnetic-pool
// substitution — excludes SAFE_TAME_IDS, adds MAGNETIC_STYLING_PROFILES (+ SEX_APPEAL_STYLING_PROFILES
// when useSexAppealPool), only when useMagneticPool; (b) an outfitFamilyHint cascade step (sex_appeal_style_v1,
// iteration 3 doplnenie #1) — narrows to profiles whose outfit_family matches the situation planner's
// declared sex_appeal_style.outfit_archetype, run BEFORE the time/weather filters since it's the most
// specific signal, falling back to the unfiltered pool if empty; (c) the iteration-2 soft time/weather
// compatibility filter (cascade — falls back to the previous step if a filter empties the pool, same
// fallback pattern as pickStylingProfile's existing tier/family cascade below). Sensual styling must
// never override real-world logic (an activity/weather-implausible outfit) — this is the mechanical half
// of that guarantee; the LLM-mediated half is buildStylingRule()'s "ACTIVITY/PHASE WINS" rule in
// lib/sceneBrief.ts.
export function selectStylingSourcePool(
  useMagneticPool?: boolean,
  situationContext?: StylingSituationContext,
  useSexAppealPool?: boolean,
  outfitFamilyHint?: string | null,
  useLuxurySeductionPool?: boolean
): StylingProfile[] {
  let pool: StylingProfile[] = useMagneticPool
    ? [
        ...STYLING_PROFILES.filter((p) => !SAFE_TAME_IDS.includes(p.id)),
        ...MAGNETIC_STYLING_PROFILES,
        ...(useSexAppealPool ? SEX_APPEAL_STYLING_PROFILES : []),
        ...(useLuxurySeductionPool ? LUXURY_SEDUCTION_STYLING_PROFILES : []),
      ]
    : STYLING_PROFILES;

  if (outfitFamilyHint) {
    const familyFiltered = pool.filter((p) => p.outfit_family === outfitFamilyHint);
    if (familyFiltered.length > 0) pool = familyFiltered;
  }

  if (!situationContext) return pool;

  const timeBucket = mapTimeOfDay(situationContext.timeOfDay);
  if (timeBucket) {
    const timeFiltered = pool.filter((p) => p.time_affinity.includes(timeBucket) || p.time_affinity.includes("any"));
    if (timeFiltered.length > 0) pool = timeFiltered;
  }

  const weatherBucket = mapWeather(situationContext.weather);
  if (weatherBucket) {
    const weatherFiltered = pool.filter((p) => !p.weather_affinity || p.weather_affinity.includes(weatherBucket) || p.weather_affinity.includes("any"));
    if (weatherFiltered.length > 0) pool = weatherFiltered;
  }

  return pool;
}

export async function pickStylingProfile(
  characterId: string,
  tier: string,
  family?: MomentFamily | null,
  useMagneticPool?: boolean,
  situationContext?: StylingSituationContext,
  useSexAppealPool?: boolean,
  outfitFamilyHint?: string | null,
  useLuxurySeductionPool?: boolean
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

  const sourcePool = selectStylingSourcePool(useMagneticPool, situationContext, useSexAppealPool, outfitFamilyHint, useLuxurySeductionPool);

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
    pool = sourcePool.filter(pred);
    if (pool.length > 0) break;
  }
  if (pool.length === 0) pool = sourcePool;

  return pool[Math.floor(Math.random() * pool.length)];
}
