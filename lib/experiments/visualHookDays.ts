import type { SceneBriefJson } from "@/lib/sceneBrief";
import type { SimpleReelPrompt } from "@/lib/recovery/simpleReelCompiler";
import { compileVisualHookReel, compileVisualHookStartFrame, type VisualHookStartFrame } from "./visualHookCompiler";
import { VHD_TOTAL, VHD_VERSION, type VisualHookPlan } from "./visualHookPlan";

// VHD v1 — the five experiment briefs, PREPARED ONLY.
//
// Nothing here generates or publishes. Five scene briefs plus five VisualHookPlans, compiled so
// the exact prompts can be read before a credit is spent.
//
// WHAT IS BEING HELD CONSTANT, so that what moves can be attributed:
//   - the motion compiler (lib/recovery/simpleReelCompiler.ts), unchanged
//   - the duration: 8s on all five. Recovery mixed 8/7/8/7/8 and the two highest ratios came from
//     the 7s reels, so length is a live confound and is being pinned rather than varied.
//   - the publishing window, the caption engine, the hashtag rules, the scheduler, the stories
//   - CI scoring, which stays frozen
//
// WHAT IS BEING VARIED: the visual motif and the shape of the first two seconds. Nothing else.
//
// EVIDENCE BASE. Every number below is measured, from this account's own five recovery reels
// (published 2026-09-04 … 2026-09-08, read from chs_posts.engagement and
// chs_post_performance_snapshots on 2026-09-09):
//
//   #   direction                 ratio    24h reach
//   1   intimate bedroom          0.795    44
//   2   wellness rooftop          0.757    24
//   3   café, ambient patrons     0.704    19
//   4   intimate living room      0.868    28
//   5   bright pool, turquoise    0.753    (24h had not matured at time of writing)
//
// Retention is solved and distribution is not: an August window on the same account reached
// 155–445. That asymmetry is the whole reason this experiment exists.

export const VHD_DEFAULT_DURATION_SEC = 8;

/** A measured reference from the account's own history — why an arm is in the set. */
export interface VhdEvidence {
  source: string;
  watchRatio: number | null;
  reach24h: number | null;
  note: string;
}

export interface VisualHookDay {
  plan: VisualHookPlan;
  /** Short human name for the arm, shown in the UI and the report. */
  direction: string;
  objective: string;
  /** What the viewer sees in frame 0 — the thing that decides whether they stay. */
  firstFrameHook: string;
  /** The micro-reward that must land by plan.payoffSec. */
  payoff: string;
  /** Nearest archetype in chs_shot_archetypes. A label for pool telemetry, never a driver. */
  archetypeId: string;
  rationale: string;
  evidence: VhdEvidence;
  brief: SceneBriefJson;
  durationSec: number;
  /** Overrides the hook type's default payoff action when the scene calls for a specific one. */
  actionOverride?: string;
}

const CHAIN_AND_HOOPS =
  "thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm";

export const VISUAL_HOOK_DAYS: VisualHookDay[] = [
  {
    plan: {
      experimentIndex: 1,
      motifFamily: "intimate_face",
      framing: "close",
      faceDominance: "dominant",
      contrastLevel: "low",
      backgroundComplexity: "simple",
      socialPresence: "solo",
      hookType: "gaze_turn",
      hookStartSec: 0.4,
      payoffSec: 1.4,
      experimentRole: "control",
    },
    direction: "CONTROL — intimate face, gaze turn",
    objective:
      "Hold the recovery configuration fixed and measure it a third time, so the four challengers have something to be different FROM.",
    firstFrameHook: "A face close to the lens in one warm lamp, eyes held off to one side — visibly about to arrive.",
    payoff: "The eyes reach the lens and stay. Nothing else is asked of the frame.",
    archetypeId: "light_motion",
    rationale:
      "A challenger without a control measures the week, not the change. This arm reproduces exactly what recovery #1 and #4 did — intimate face, gaze turn, close crop, low contrast — in a third room. Those two are the account's two best watch ratios (0.795 and 0.868) and, at 44 and 28, its two best 24h reach figures in the recovery window. If this arm lands in that band again, the band is real and the challengers can be read against it. If it does not, the week itself moved and nothing else this sprint says can be trusted.",
    evidence: {
      source: "recovery #1 (2026-09-04) and #4 (2026-09-07)",
      watchRatio: 0.868,
      reach24h: 44,
      note: "Two independent reads of this exact configuration. Ratios 0.795 / 0.868, 24h reach 44 / 28 — the strongest pair on both axes.",
    },
    durationSec: VHD_DEFAULT_DURATION_SEC,
    brief: {
      camera_language: "static handheld 50mm",
      color_palette: ["warm amber", "warm cream", "warm taupe"],
      visual_rules: ["wardrobe never changes", "no mirrors", "no legible text", "one light source"],
      location_constraints: [
        "one lamp at bedside height to her right, the only light in the room",
        "warm-taupe upholstered headboard directly behind her",
        "linen curtain fully drawn across the window to her left",
        "no signage, no text, no second face in frame",
      ],
      spatial_setup:
        "Her apartment bedroom at night — she sits back against the warm-taupe upholstered headboard of the queen bed with an ivory linen duvet across her lap, a low cane bedside table to her right carrying one switched-on lamp with a warm amber shade, the tall window to her left with its linen curtain fully drawn, warm wood floor. No desk, no chair, no second table, no wardrobe, no TV, no overhead lighting active.",
      wardrobe_lock: `washed-cream ribbed cotton camisole (thin fixed straps, close to the body, no logo), soft charcoal knit lounge trousers (mid-rise, relaxed), bare feet, ${CHAIN_AND_HOOPS}, dark wavy hair loose past the shoulders, minimal makeup with a tinted lip`,
      allowed_props: [],
      lighting_state: "single bedside lamp from the right, warm amber, no other source",
      time_of_day: "night",
      weather_implied: "indoor",
      location_class: "bedroom",
      action_class: "seated_still",
      scene_entities: [],
      speech_is_the_point: false,
    },
  },
  {
    plan: {
      experimentIndex: 2,
      motifFamily: "bold_color",
      framing: "close_medium",
      faceDominance: "dominant",
      contrastLevel: "medium",
      backgroundComplexity: "empty",
      socialPresence: "solo",
      // Deliberately the CONTROL's hook. #2 is the only arm in the set that moves one variable.
      hookType: "gaze_turn",
      hookStartSec: 0.4,
      payoffSec: 1.4,
      experimentRole: "challenger",
    },
    direction: "bold colour block, gaze turn",
    objective:
      "Isolate the motif variable: same hook as the control, same crop discipline, one large saturated colour field behind her instead of a soft warm room.",
    firstFrameHook: "A flat wall of cobalt blue filling the frame behind a face — the colour registers before the face does.",
    payoff: "The eyes reach the lens and stay, exactly as in the control.",
    archetypeId: "light_motion",
    rationale:
      "This is the cleanest arm in the set and the only one that changes exactly one thing. Its hook is the control's hook, its crop is one notch wider and nothing else differs but the colour field. Every recovery reel was warm, low-saturation and soft-edged; a feed of them is visually one image. If a saturated block moves 24h reach while the hook is held fixed, that is attributable to the motif and to nothing else.",
    evidence: {
      source: "recovery #5 (2026-09-08), pool / turquoise",
      watchRatio: 0.753,
      reach24h: null,
      note:
        "The only high-colour frame in the recovery set. Its ratio held at 0.753, so colour does not cost retention; its 24h reach had not matured when this brief was written, and is the first number to read against this arm.",
    },
    durationSec: VHD_DEFAULT_DURATION_SEC,
    brief: {
      camera_language: "static 50mm",
      color_palette: ["cobalt blue", "warm cream", "brass"],
      visual_rules: ["wardrobe never changes", "no mirrors", "no legible text", "nothing mounted on the coloured wall"],
      location_constraints: [
        "flat unbroken cobalt-blue painted wall directly behind her, nothing mounted on it",
        "flat frontal daylight from an open doorway out of frame to the right",
        "no mirror, no picture, no shelf, no plant, no coat hook",
        "no signage, no text, no second face in frame",
      ],
      spatial_setup:
        "The far end of her living room, where the wall is painted a flat unbroken cobalt blue — she stands half a metre in front of it and the blue fills the entire wall behind her, warm oak floor underfoot, an open doorway out of frame to the right letting in flat daylight. No furniture, no mirror, no pictures, no plants, nothing at all mounted on the blue wall.",
      wardrobe_lock: `fitted warm-cream ribbed cotton long-sleeve top (crew neck, close to the body, no logo), soft cream wide-leg trousers (high-rise), bare feet, ${CHAIN_AND_HOOPS}, dark wavy hair loose, soft everyday makeup with a tinted lip`,
      allowed_props: [],
      lighting_state: "flat frontal daylight from an open doorway to the right, even, cool white",
      time_of_day: "midday",
      weather_implied: "indoor",
      location_class: "living_room",
      action_class: "standing_still",
      scene_entities: [],
      speech_is_the_point: false,
    },
  },
  {
    plan: {
      experimentIndex: 3,
      motifFamily: "hard_light_shadow",
      framing: "close_medium",
      faceDominance: "dominant",
      contrastLevel: "high",
      // NOT "simple": that setting blurs the background, and the shadow bars this arm is testing
      // fall ON the wall behind her. A motif cannot read through its own blur.
      backgroundComplexity: "textured",
      socialPresence: "solo",
      hookType: "light_shift",
      hookStartSec: 0.5,
      payoffSec: 1.6,
      experimentRole: "challenger",
    },
    direction: "hard light and shadow, shift into the light",
    objective:
      "Test whether contrast alone can carry a thumbnail-sized frame — and whether a hook made of light rather than of gaze holds the same.",
    firstFrameHook: "Hard parallel bars of shutter light across a plaster wall, half her face in shadow, eyes not yet lit.",
    payoff: "She shifts a few degrees and the light edge crosses her eyes — the frame resolves.",
    archetypeId: "light_motion",
    rationale:
      "Every recovery reel used soft, single-source, low-contrast light, which is flattering at full size and nearly invisible at thumbnail size. Hard light is the cheapest available increase in small-scale legibility, and it comes with its own hook: the payoff is the eyes becoming visible, which is a change a viewer can register before they have decided to watch. This arm moves the motif and the hook together, and cannot be attributed to either alone — that is the price of a hook that only exists in a hard-light scene, and it is stated rather than hidden.",
    evidence: {
      source: "recovery #1 (2026-09-04)",
      watchRatio: 0.795,
      reach24h: 44,
      note:
        "The best recovery reel, and lit with a single soft amber lamp. It is the ceiling of the soft-light configuration on this account: 0.795 ratio, 44 reach. Contrast is the untested axis.",
    },
    durationSec: VHD_DEFAULT_DURATION_SEC,
    brief: {
      camera_language: "static 50mm",
      color_palette: ["warm amber", "deep shadow brown", "warm cream"],
      visual_rules: ["wardrobe never changes", "no legible text", "one light source", "no second sharp face"],
      location_constraints: [
        "slatted timber blind half-closed across the window to her left, the only light source",
        "hard parallel bars of light and shadow falling across the pale plaster wall behind her",
        "no lamp switched on, no second light source",
        "no signage, no text, no second face in frame",
      ],
      spatial_setup:
        "Her kitchen in the late afternoon — she sits at the end of a pale oak table with the slatted timber blind half-closed across the window to her left, throwing hard parallel bars of light and shadow across her and across the pale plaster wall behind her, warm terracotta floor tiles underfoot. No lamp on, no clutter on the table, no chair between her and the camera, no plant.",
      wardrobe_lock: `oversized washed-white cotton shirt worn buttoned low over a fitted warm-cream ribbed tank, faded straight-leg mid-blue jeans (high-rise), bare feet, ${CHAIN_AND_HOOPS}, dark wavy hair loose and slightly undone, bare skin makeup with a tinted lip`,
      allowed_props: [],
      lighting_state: "hard low late-afternoon sun through a slatted blind from the left, sharp-edged, warm, single source",
      time_of_day: "late_afternoon",
      weather_implied: "clear",
      location_class: "kitchen",
      action_class: "seated_still",
      scene_entities: [],
      speech_is_the_point: false,
    },
  },
  {
    plan: {
      experimentIndex: 4,
      motifFamily: "social_depth",
      framing: "close_medium",
      faceDominance: "balanced",
      contrastLevel: "medium",
      backgroundComplexity: "populated",
      socialPresence: "ambient",
      hookType: "environment_reaction",
      hookStartSec: 0.5,
      payoffSec: 1.8,
      experimentRole: "challenger",
    },
    direction: "populated depth, reaction to the room",
    objective:
      "Re-test the social register with a construction the first attempt did not have: real depth behind her, and a hook that uses the room instead of ignoring it.",
    firstFrameHook: "A warm bar behind her with people moving in it, her attention already off to one side.",
    payoff: "Something further that way catches her, then her eyes come back to the lens.",
    archetypeId: "interaction_object",
    rationale:
      "This arm carries a negative prior and is in the set anyway. Recovery #3 was the social one and it finished last on both axes — 0.704 ratio, 19 reach, the worst of the five. But #3 was a daylight café terrace where the patrons sat at 6m in flat light and read as background texture rather than as people, and its hook was the same gaze turn used everywhere else, so the setting did no work. This version puts the life close enough to register and gives it something to do: the reaction hook is the only one in the set whose payoff depends on the room existing. If it finishes last again, the social register is genuinely wrong for this account and can be retired on two independent reads rather than one.",
    evidence: {
      source: "recovery #3 (2026-09-06), café terrace",
      watchRatio: 0.704,
      reach24h: 19,
      note: "Last of the five on both retention and reach. The prior is negative; this arm is a second, differently-built read of it rather than a repeat.",
    },
    durationSec: VHD_DEFAULT_DURATION_SEC,
    brief: {
      camera_language: "static handheld 50mm",
      color_palette: ["warm amber", "oxblood", "warm cream"],
      visual_rules: [
        "wardrobe never changes",
        "one sharp face only, all others blurred",
        "no legible text or signage",
        "no foreground companion",
      ],
      location_constraints: [
        "zinc counter running out of frame to her right",
        "warm-lit back bar of bottles and glassware two metres behind her, out of focus",
        "other patrons blurred at four metres and beyond, none sharp, none interacting with her",
        "no legible signage, no branded labels, no menus in frame",
      ],
      spatial_setup:
        "A small neighbourhood wine bar in the early evening — she stands at the end of a zinc counter that runs out of frame to her right, the warm-lit back bar of bottles and glassware two metres behind her and well out of focus, other patrons at the counter and at tables four metres back and beyond, all of them soft and none of them near her. No menus, no legible signage, no branded labels, no second sharp face.",
      wardrobe_lock: `fitted oxblood ribbed knit top (crew neck, close to the body, three-quarter sleeve, no logo), faded straight-leg mid-blue jeans (high-rise), tan leather flat sandals, ${CHAIN_AND_HOOPS}, dark wavy hair loose, soft everyday makeup with a tinted lip`,
      allowed_props: [],
      lighting_state: "warm low bar light from above and behind, plus a soft frontal bounce off the counter",
      time_of_day: "evening",
      weather_implied: "indoor",
      location_class: "bar",
      action_class: "standing_still",
      scene_entities: [],
      speech_is_the_point: false,
    },
  },
  {
    plan: {
      experimentIndex: 5,
      motifFamily: "graphic_environment",
      framing: "medium_graphic",
      faceDominance: "balanced",
      contrastLevel: "medium",
      backgroundComplexity: "textured",
      socialPresence: "implied",
      hookType: "micro_action",
      hookStartSec: 0.3,
      payoffSec: 1.5,
      experimentRole: "challenger",
    },
    direction: "graphic tiled wall, one readable micro-action",
    objective:
      "Test the only arm where the environment is allowed to share the frame — a strong repeating shape as the thing that reads first at thumbnail size.",
    firstFrameHook: "A deep-green grid of glazed tiles running straight across the frame, her hand already raised.",
    payoff: "The hand settles the chain and her eyes come up — the movement completes inside the grid.",
    archetypeId: "sitting_window",
    rationale:
      "Every other arm, and every recovery reel, asks the face to carry the frame alone. This one asks whether a strong graphic shape can do the first-glance work instead, with the face still sharp inside it. It is also the only test of whether the crop can open by a notch without collapsing into the slow establishing shot the recovery thesis was built against — which is why the frame still ends at the waist and the hook still starts almost immediately.",
    evidence: {
      source: "recovery #2 (2026-09-05), rooftop terrace",
      watchRatio: 0.757,
      reach24h: 24,
      note:
        "The only recovery reel with real architecture in frame — an open rooftop with a parapet and a skyline. It held retention (0.757) but the geometry was soft and distant; here it is hard, close and square to camera.",
    },
    durationSec: VHD_DEFAULT_DURATION_SEC,
    brief: {
      camera_language: "static 50mm",
      color_palette: ["deep green", "warm cream", "brass"],
      visual_rules: ["wardrobe never changes", "no legible text", "grid stays square to camera", "no second sharp face"],
      location_constraints: [
        "wall of large square glazed deep-green tiles directly behind her, the grid square to camera",
        "terrazzo floor underfoot",
        "even indirect daylight from an archway out of frame to the left",
        "no signage, no text, no letterboxes, nothing mounted on the tiled wall",
      ],
      spatial_setup:
        "The tiled entry passage of a 1930s apartment building — she stands centred against a wall of large square glazed tiles in a single deep green, the grid running straight and unbroken behind her, a terrazzo floor underfoot, even daylight arriving from an archway out of frame to the left. No furniture, no plants, no letterboxes, no signage, nothing mounted on the tiled wall.",
      wardrobe_lock: `fitted warm-cream ribbed cotton long-sleeve top (crew neck, close to the body, no logo), soft charcoal wide-leg trousers (high-rise), tan leather flat sandals, ${CHAIN_AND_HOOPS}, dark wavy hair loose, soft everyday makeup with a tinted lip`,
      allowed_props: [],
      lighting_state: "even indirect daylight from an archway to the left, soft, cool white",
      time_of_day: "morning",
      weather_implied: "indoor",
      location_class: "other",
      action_class: "standing_still",
      scene_entities: [],
      speech_is_the_point: false,
    },
  },
];

export interface CompiledVisualHookDay extends VisualHookDay {
  compiled: SimpleReelPrompt;
  startFrame: VisualHookStartFrame;
  /** Mirrors CompiledRecoveryDay.slot so both can feed the shared story-derivation helpers. */
  slot: number;
}

/**
 * Compiles all five. Throws if any of them fails plan validation, motif validation or the
 * scene-coherence validator — a brief that cannot produce a clean prompt is not ready for review.
 */
export function compileVisualHookDays(): CompiledVisualHookDay[] {
  if (VISUAL_HOOK_DAYS.length !== VHD_TOTAL) {
    throw new Error(`expected ${VHD_TOTAL} visual hook days, found ${VISUAL_HOOK_DAYS.length}`);
  }
  return VISUAL_HOOK_DAYS.map((day) => {
    const compiled = compileVisualHookReel({
      plan: day.plan,
      brief: day.brief,
      durationSec: day.durationSec,
      ...(day.actionOverride ? { action: day.actionOverride } : {}),
    });
    if (compiled.validation.errors.length > 0) {
      throw new Error(
        `VHD ${VHD_VERSION} #${day.plan.experimentIndex} failed validation: ` +
          compiled.validation.errors.map((e) => `[${e.rule}] ${e.detail}`).join(" | ")
      );
    }
    const startFrame = compileVisualHookStartFrame(day.plan, day.brief);
    return { ...day, compiled, startFrame, slot: day.plan.experimentIndex };
  });
}
