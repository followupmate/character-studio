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

/**
 * One historical post from this account's own data, cited as the reason a direction is in the set.
 * Every number is measured, not estimated: views/reach/watch come from the Meta Insights API, and
 * `actualDurationSec` is read from the PUBLISHED reel file's MP4 header (probed 2026-09-03) —
 * Meta exposes no duration field, so this is the only way to get it.
 */
export interface EvidenceRef {
  sourceDay: number;
  postedAt: string;
  views: number;
  reach: number;
  avgWatchSec: number;
  actualDurationSec: number;
  /** avgWatchSec / actualDurationSec — see lib/creativeIntelligence/watchMetrics.ts. */
  watchRatio: number;
  note: string;
}

export interface RecoveryDay {
  slot: 1 | 2 | 3 | 4 | 5;
  objective: string;
  direction: string;
  /** Nearest archetype in chs_shot_archetypes — recorded on the media row for pool telemetry.
   *  The compiler itself is archetype-free by design; this is a label, not a driver. */
  archetypeId: string;
  /** What the viewer sees in frame 0 — the thing that decides whether they stay. */
  firstFrameHook: string;
  /** The single micro-reward that lands inside 0–3s. */
  payoff: string;
  loopLogic: string;
  /** Why this direction is in the set at all — so a result can be read against an intent. */
  rationale: string;
  evidence: EvidenceRef;
  brief: SceneBriefJson;
  /** Slot 1 uses the agreed firestarter shape verbatim rather than the action bank. */
  firestarter?: boolean;
  /** Explicit beat, when the action bank has nothing that fits the scene honestly. */
  actionOverride?: string;
  durationSec: 6 | 7;
}

// Shared across all five: Vivienne's sacred constants (thin gold chain, small gold hoops) appear in
// every wardrobe lock, which is what makes the wardrobe-anchored actions in the compiler's action
// bank legal in every one of these scenes without inventing a prop.
const CHAIN_AND_HOOPS = "thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm";

export const RECOVERY_DAYS: RecoveryDay[] = [
  {
    slot: 1,
    objective:
      "Reprodukovať tvar najlepšieho reelu v okne, zámerne a nie náhodou.",
    archetypeId: "light_motion",
    firstFrameHook:
      "Close-medium, tvár blízko kamery, pohľad mimo objektív — divák vidí, že sa o chvíľu pozrie naňho.",
    payoff:
      "~1,5 s: oči nájdu objektív + veľmi jemný asymetrický úsmev. To je celá odmena.",
    loopLogic:
      "Posledný frame = otvárací postoj a pohľad mimo objektív, takže slučka nemá šev.",
    evidence: {
      sourceDay: 78,
      postedAt: "2026-08-17",
      views: 312,
      reach: 209,
      avgWatchSec: 6.28,
      actualDurationSec: 8.13,
      watchRatio: 0.772,
      note:
        "Najvyšší watch time a najvyšší watch ratio v celom okne. Rovnaký tier, rovnaký light-motion register, eye-contact beat + jediné gesto rukou k retiazke.",
    },
    direction: "intimate / private + light motion",
    rationale:
      "The firestarter. Day 78 — the same tier, the same light-motion register, an eye-contact beat and a single hand gesture — is the best-performing reel in the whole window: 6.28s watch on an 8.13s file, ratio 0.772. This reproduces that shape deliberately instead of by accident.",
    firestarter: true,
    durationSec: 7,
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
    objective:
      "Overiť, či wellness register drží pozornosť bez studiového vybavenia v zábere.",
    archetypeId: "gesture_motion",
    firstFrameHook:
      "Otvorená strešná terasa, ranné slnko zboku, postava blízko kamery — svetlo a priestor, nie cvičebné náradie.",
    payoff:
      "~1,5 s: oči na objektív, potom jedno zastrčenie prameňa vlasov za ucho.",
    loopLogic:
      "Vráti sa do rovnakého postoja a pohľadu mimo objektív.",
    evidence: {
      sourceDay: 76,
      postedAt: "2026-08-15",
      views: 218,
      reach: 187,
      avgWatchSec: 4.92,
      actualDurationSec: 8.13,
      watchRatio: 0.605,
      note:
        "Druhý najlepší wellness reel; jediná akcia (zdvihnutie retiazky) + návrat pohľadu na objektív. Deň 92 v tom istom tieri, ale s reformerom v scéne, spadol na 2,89 s — náradie ťahá prompt k objektom a fyzike, ktoré scéna neunesie.",
    },
    direction: "wellness + gesture",
    rationale:
      "Wellness is the tier of Day 76 (measured: 4.92s watch on 8.13s, ratio 0.605), the other clean performer. Gesture rather than the studio equipment: Day 92 showed the reformer pulls the prompt toward objects and physics that the scene cannot support.",
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
    objective:
      "Otestovať, či scéna so živým pozadím drží rovnako ako súkromný register — celý posledný obsah je samota.",
    archetypeId: "interaction_object",
    firstFrameHook:
      "Kaviarenská terasa, teplá ochre fasáda za ňou, rozostrení ľudia v hĺbke — okamžite čitateľné miesto.",
    payoff:
      "~2 s: oči na objektív a jeden pomalý dúšok z espressa, ktoré je v scéne uzamknuté.",
    loopLogic:
      "Šálka sa vráti na stôl do východiskovej polohy, pohľad ide mimo objektív.",
    evidence: {
      sourceDay: 71,
      postedAt: "2026-08-10",
      views: 511,
      reach: 445,
      avgWatchSec: 6.36,
      actualDurationSec: 8.13,
      watchRatio: 0.783,
      note:
        "Najviac views aj najvyšší watch ratio z celých 24 reelov. Ukazuje, že strop účtu je výrazne nad súčasnými číslami — nie je to problém dosahu, je to problém udržania.",
    },
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
      action_class: "eating_drinking",
      scene_entities: ["white ceramic espresso cup", "saucer"],
      speech_is_the_point: false,
    },
  },
  {
    slot: 4,
    objective:
      "Druhé čítanie smeru #1 v inej miestnosti a inom svetle — n=1 na smer nie je výsledok.",
    archetypeId: "light_motion",
    firstFrameHook:
      "Protisvetlo cez záclonu za ňou, obrys vysvietený — mäkký, okamžite čitateľný portrét.",
    payoff:
      "~1,5 s: oči na objektív, potom ruka k retiazke na kľúčnej kosti.",
    loopLogic:
      "Ruka klesne, pohľad ide mimo objektív — zhoda s prvým framom.",
    evidence: {
      sourceDay: 70,
      postedAt: "2026-08-09",
      views: 241,
      reach: 155,
      avgWatchSec: 5.83,
      actualDurationSec: 8.13,
      watchRatio: 0.717,
      note:
        "Tretí najvyšší watch time, ten istý intimate_aesthetic tier ako #1 ale iná miestnosť. Dva nezávislé dôkazy, že register drží naprieč lokáciami — presne to, čo #4 testuje.",
    },
    direction: "intimate variant — a second read on #1",
    // #4 exists to re-read #1 in a different room, so it must repeat #1's BEAT, not rotate off it.
    // Left to the day-number rotation it drew "shifts her weight", which would have made the two
    // reels test two different things and the comparison meaningless.
    actionOverride: "her hand comes up and she adjusts the thin gold chain at her collarbone",
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
    objective:
      "Zámerne mimo troch smerov — najbližší bod k vizuálnej motívovej vrstve, ktorá je ďalšia testovaná premenná pri výsledku 0/5.",
    archetypeId: "sitting_window",
    firstFrameHook:
      "Tyrkysová voda a tvrdé letné svetlo — jediný jasný, vysoko farebný frame v celej päťke.",
    payoff:
      "~2 s: oči na objektív, potom ruka von z vody a späť.",
    loopLogic:
      "Ruka sa vráti do vody, pohľad mimo objektív.",
    evidence: {
      sourceDay: 74,
      postedAt: "2026-08-13",
      views: 246,
      reach: 209,
      avgWatchSec: 4.37,
      actualDurationSec: 10.04,
      watchRatio: 0.435,
      note:
        "Jediný 10s reel v dátach. Watch 4,37 s tesne pod prahom pri najnižšom ratio z porovnateľných — dôkaz, že samotná dĺžka watch time negarantuje; ratio je to, čo treba zdvihnúť.",
    },
    direction: "challenger — free attempt outside the three directions",
    actionOverride: "she lifts one hand out of the water and lets it fall back",
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
      ...(day.actionOverride ? { action: day.actionOverride } : {}),
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
