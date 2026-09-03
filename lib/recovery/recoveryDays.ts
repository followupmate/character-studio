import type { SceneBriefJson } from "@/lib/sceneBrief";
import { compileFirestarterReel, compileSimpleReel, type SimpleReelPrompt } from "./simpleReelCompiler";

// RECOVERY phase 5 — the five recovery days, PREPARED ONLY.
//
// Nothing here generates or publishes. These are five scene briefs written against the new
// structured schema (location_class / action_class / scene_entities / speech_is_the_point) and
// compiled through lib/recovery/simpleReelCompiler.ts so the exact prompts can be reviewed before
// a single credit is spent. Approval is a human step: see docs/RECOVERY-REELS.md.
//
// One variable is being tested — the motion/prompt layer. Captions, publishing time, styling and
// hashtags stay exactly as they are. Cadence drops to 4–5 reels per week, not daily. Stories
// continue unchanged in normal mode to keep follower touch while reel cadence is reduced.

export interface RecoveryDay {
  slot: 1 | 2 | 3 | 4 | 5;
  direction: string;
  /** Why this direction is in the set at all — so a result can be read against an intent. */
  rationale: string;
  brief: SceneBriefJson;
  /** Slot 1 uses the agreed firestarter shape verbatim rather than the action bank. */
  firestarter?: boolean;
  durationSec: 6 | 7;
}

// Shared across all five: Vivienne's sacred constants (thin gold chain, small gold hoops) appear in
// every wardrobe lock, which is what makes the wardrobe-anchored actions in the compiler's action
// bank legal in every one of these scenes without inventing a prop.
const CHAIN_AND_HOOPS = "thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm";

export const RECOVERY_DAYS: RecoveryDay[] = [
  {
    slot: 1,
    direction: "intimate / private + light motion",
    rationale:
      "The firestarter. Day 78 — the same tier, the same light-motion register, an eye-contact beat and a single hand gesture — is the best-performing reel in the whole window at 6.02s watch. This reproduces that shape deliberately instead of by accident.",
    firestarter: true,
    durationSec: 6,
    brief: {
      camera_language: "static handheld 50mm",
      color_palette: ["warm cream", "soft clay pink", "warm oak"],
      visual_rules: ["wardrobe never changes", "no mirrors", "no legible text", "one light source"],
      location_constraints: [
        "tall window 1.5m to her left, sheer linen curtain half-drawn, light entering at a low angle",
        "upholstered warm-taupe headboard directly behind her",
        "low cane bedside table to the right carrying a single lit lamp",
        "no signage, no text, no second face in frame",
      ],
      spatial_setup:
        "Her apartment bedroom — she sits on the edge of a queen bed with a rumpled ivory linen duvet, a warm-taupe upholstered headboard behind her, a low cane bedside table to her right with one switched-on lamp giving a warm amber glow, a tall window with a half-drawn linen curtain to her left, warm wood floor and a soft rug at the bed's base. No desk, no chair, no second table, no wardrobe, no TV, no overhead lighting active.",
      wardrobe_lock: `washed-cream ribbed cotton camisole (thin fixed straps, close to the body, no logo), soft charcoal knit lounge trousers (mid-rise, relaxed), bare feet, ${CHAIN_AND_HOOPS}, dark wavy hair loose past the shoulders, minimal makeup with a tinted lip`,
      allowed_props: [],
      lighting_state: "single bedside lamp from the right, directional, warm amber, plus low window fill from the left",
      time_of_day: "dusk",
      weather_implied: "indoor",
      location_class: "bedroom",
      action_class: "seated_still",
      scene_entities: [],
      speech_is_the_point: false,
    },
  },
  {
    slot: 2,
    direction: "wellness + gesture",
    rationale:
      "Wellness is the tier of Day 76 (watch 5.01s), the other clean performer. Gesture rather than the studio equipment: Day 92 showed the reformer pulls the prompt toward objects and physics that the scene cannot support.",
    durationSec: 6,
    brief: {
      camera_language: "static 50mm",
      color_palette: ["sage green", "warm cream", "warm concrete grey"],
      visual_rules: ["wardrobe never changes", "no legible text or signage", "one natural light source", "no second sharp face"],
      location_constraints: [
        "low rendered-concrete parapet wall at 1.0m height along the far edge",
        "city skyline of low-to-mid-rise rooftops beyond, soft in morning haze",
        "rolled yoga mat leaning against the parapet to her right",
        "no furniture of any kind, no gym equipment in frame",
      ],
      spatial_setup:
        "Boutique hotel rooftop terrace — an open-air platform of warm poured concrete roughly 8m across, a low rendered-concrete parapet along the far edge at 1.0m, a city skyline of low-to-mid-rise rooftops receding into soft morning haze beyond it, a rolled yoga mat leaning against the parapet to her right. No chairs, no table, no lounger, no planters, no gym equipment, no signage.",
      wardrobe_lock: `fitted ribbed sports bra in muted sage (wide underband, fully opaque, no logo), high-waisted full-length compression leggings in the same muted sage ribbed fabric, bare feet on warm concrete, ${CHAIN_AND_HOOPS}, sleek low ponytail slightly damp at the temples`,
      allowed_props: [],
      lighting_state: "early eastern sun from the left, hard on the shoulder, open sky fill on the right",
      time_of_day: "morning",
      weather_implied: "clear",
      location_class: "terrace_rooftop",
      action_class: "standing_still",
      scene_entities: ["rolled yoga mat"],
      speech_is_the_point: false,
    },
  },
  {
    slot: 3,
    direction: "living social / candid moment",
    rationale:
      "The one direction with real ambient life in frame. Tests whether a candid, populated setting holds attention as well as the private register — the account's whole recent output is solitary, and a validator that only ever sees empty rooms cannot tell us if that is the constraint.",
    durationSec: 7,
    brief: {
      camera_language: "static handheld 50mm",
      color_palette: ["terracotta", "warm cream", "faded denim blue"],
      visual_rules: ["wardrobe never changes", "one sharp face only, all others blurred", "no legible text or signage", "no foreground companion"],
      location_constraints: [
        "small round marble-topped café table 50cm in front of her, one espresso cup on it",
        "aged ochre plaster facade filling the midground 3m behind her",
        "blurred anonymous patrons at 6m depth, none sharp, none interacting with her",
        "no signage, no branded items, no menus in frame",
      ],
      spatial_setup:
        "A small neighbourhood café terrace in El Born, Barcelona — she sits at a round marble-topped table 50cm in front of her carrying one white ceramic espresso cup on a saucer, a bentwood chair beneath her, the aged ochre-yellow plaster facade of a four-storey building filling the midground 3m behind, a faded cream-and-sage canvas awning above casting one diagonal band of shade. A few blurred anonymous patrons sit at 6m depth in soft focus. No menus, no signage, no branded items, no second sharp face.",
      wardrobe_lock: `thin-strap cream ribbed cotton top (fixed narrow straps, scoop neck, no logo), faded straight-leg mid-blue jeans (high-rise), tan leather flat sandals, ${CHAIN_AND_HOOPS}, dark wavy hair loose, soft everyday makeup`,
      allowed_props: ["white ceramic espresso cup on a saucer, resting on the marble table 50cm in front of her"],
      lighting_state: "open daylight from the left through the awning gap, soft, warm midday white",
      time_of_day: "midday",
      weather_implied: "clear",
      location_class: "cafe_restaurant",
      action_class: "seated_still",
      scene_entities: ["white ceramic espresso cup", "saucer"],
      speech_is_the_point: false,
    },
  },
  {
    slot: 4,
    direction: "intimate variant — a second read on #1",
    rationale:
      "The same register as Reel 1 in a different room and a different light. If #1 works and #4 does not, the result is about that specific room; if both work, the register is what carries. n=1 on a direction is not a result.",
    durationSec: 6,
    brief: {
      camera_language: "static 50mm",
      color_palette: ["butter yellow", "warm cream", "deep olive"],
      visual_rules: ["wardrobe never changes", "no mirrors", "no legible text", "one light source"],
      location_constraints: [
        "tall window directly behind her, sheer curtain fully drawn, light diffusing through it",
        "deep-olive painted wall to the left with a single framed print",
        "warm oak floorboards, a low stack of books against the wall at floor level",
        "no furniture between her and the camera",
      ],
      spatial_setup:
        "The corner of her living room by the window — she sits on the floor with her back against a low pale-linen sofa, a tall window directly behind her with a sheer curtain fully drawn diffusing late-morning light, a deep-olive painted wall to the left carrying one framed print, warm oak floorboards, a low stack of books against the wall at floor level. No coffee table, no lamp, no plant, no TV, nothing between her and the camera.",
      wardrobe_lock: `oversized washed-white cotton shirt worn open over a fitted deep-olive ribbed tank, soft cream knit shorts, bare feet, ${CHAIN_AND_HOOPS}, dark wavy hair loose and slightly undone, bare skin makeup with a tinted lip`,
      allowed_props: [],
      lighting_state: "backlight through the sheer curtain behind her, soft, warm white, wrapping her outline",
      time_of_day: "morning",
      weather_implied: "indoor",
      location_class: "living_room",
      action_class: "seated_still",
      scene_entities: ["low stack of books"],
      speech_is_the_point: false,
    },
  },
  {
    slot: 5,
    direction: "challenger — free attempt outside the three directions",
    rationale:
      "Deliberately outside the tested set, and deliberately not a fourth variation on a quiet interior. A bright, high-colour, open-water frame — the closest thing in this set to the visual-motif layer that becomes the next tested variable if the prompt layer turns out not to have been the problem (see the 0-of-5 branch in recovery.json).",
    durationSec: 7,
    brief: {
      camera_language: "static handheld 50mm",
      color_palette: ["turquoise", "warm cream", "sun-bleached terracotta"],
      visual_rules: ["wardrobe never changes", "no legible text", "no second sharp face", "one natural light source"],
      location_constraints: [
        "limestone coping 30cm wide running along the near edge of the water",
        "turquoise-green mosaic-tile pool surface filling the lower midground",
        "bougainvillea over a 1m stone parapet to the left casting hard broken shadows",
        "no furniture, no sunbed, no umbrella, no towel rack",
      ],
      spatial_setup:
        "A private plunge pool on a limestone terrace — she sits on the brushed-limestone coping at the near edge with her feet in the water, the turquoise-green mosaic-tile pool surface filling the lower midground, a 1m stone parapet to the left covered in bougainvillea casting hard broken shadows across the pale stone, open high-summer sky above. No chairs, no table, no sunbed, no umbrella, no towel rack, no signage.",
      wardrobe_lock: `black high-waisted bikini (smooth matte fabric, full-coverage bandeau top, no logo), oversized white open-weave cotton shirt worn completely open over it, barefoot, ${CHAIN_AND_HOOPS}, wet-look dark hair pushed back, bare skin, no makeup beyond a tinted lip`,
      allowed_props: [],
      lighting_state: "hard overhead summer sun, single source, bounce off the water from below",
      time_of_day: "midday",
      weather_implied: "clear",
      location_class: "pool",
      action_class: "seated_still",
      scene_entities: [],
      speech_is_the_point: false,
    },
  },
];

export interface CompiledRecoveryDay extends RecoveryDay {
  compiled: SimpleReelPrompt;
}

/** Compiles all five. Throws if any of them fails its own validation — a brief that cannot produce
 *  a clean prompt is not ready for review. */
export function compileRecoveryDays(): CompiledRecoveryDay[] {
  return RECOVERY_DAYS.map((day) => {
    const args = {
      sceneBrief: day.brief,
      dayNumber: day.slot,
      durationSec: day.durationSec,
    };
    const compiled = day.firestarter ? compileFirestarterReel(args) : compileSimpleReel(args);
    if (compiled.validation.errors.length > 0) {
      throw new Error(
        `Recovery day ${day.slot} failed validation: ${compiled.validation.errors.map((e) => `[${e.rule}] ${e.detail}`).join(" | ")}`
      );
    }
    return { ...day, compiled };
  });
}
