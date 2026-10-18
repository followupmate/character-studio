/**
 * Phase 2 — reel recipes: `ootd_stop` and `grwm_loading`.
 * Phase 8 — "moment" recipes: `reveal_object`, `outfit_reveal`, `surprise_reaction`, `playful_camera`.
 *   Built around one clear event inside the first ~1–3 seconds plus a payoff and an end pose (the
 *   sweater-and-mug reel insight: reels where something HAPPENS beat "looks into camera, half
 *   body"). They dominate the rotation (7 of every 10 days, see recipeIdForDay) and never run two
 *   days in a row. Some recipes carry scene-gated VARIANTS (e.g. the mug reveal only when the scene
 *   brief really contains a cup/mug — the semantic validator's prop_coherence rule).
 *
 * A recipe is the complete, curated definition of one repeatable reel shape:
 *   - the motion clauses that plug into compileSimpleReel's seams (openingState, hookBeat, action,
 *     closingBeat, negativePrompt) — the compiler itself is NOT forked;
 *   - the pool of burned-in hook strings (lib/video/hookOverlay). Hook text comes ONLY from this
 *     pool: curated, lowercase, <= 6 words, validated by hookTextValidator in the test suite. It is
 *     never produced by an LLM, because a typo or a banned term burned into the pixels cannot be
 *     fixed after posting;
 *   - which scene action classes it can legitimately run on (FORMAT_REQUIRED_ACTIONS mirrors this);
 *   - the chs_shot_archetypes row it needs (id === recipe id; see the Phase 2 SQL migration).
 *
 * Feature gating lives in the callers: reel_recipes_v1 (character flag) / REEL_RECIPES_ENABLED env.
 */
import type { SceneBriefJson } from "@/lib/sceneBrief";
import type { ActionClass } from "@/lib/sceneSemantics";
import { resolveSceneSemantics } from "@/lib/sceneSemantics";
import {
  compileSimpleReel,
  DEFAULT_REEL_NEGATIVES,
  type ReelFraming,
  type SimpleReelPrompt,
} from "./simpleReelCompiler";

export const CLASSIC_RECIPE_IDS = ["ootd_stop", "grwm_loading"] as const;
export const MOMENT_RECIPE_IDS = ["reveal_object", "outfit_reveal", "surprise_reaction", "playful_camera"] as const;
export const REEL_RECIPE_IDS = [...CLASSIC_RECIPE_IDS, ...MOMENT_RECIPE_IDS] as const;
/**
 * Classic recipes that the daily rotation / scene fallback may pick. grwm_loading is deliberately
 * NOT here: it became the fallback on almost every stationary day (ootd_stop needs locomotion) and
 * burned "grwm, almost ready" onto reel after reel. The recipe stays defined only so old
 * chs_media rows / the chs_shot_archetypes FK still resolve; it is never chosen for a new day.
 */
export const ROTATION_CLASSIC_IDS = ["ootd_stop"] as const;
/**
 * Series recipes: never in the daily rotation / scene fallback / REEL_RECIPE_LIST — only forced for a
 * date by feature_flags.reel_hook_overrides[date].recipe (e.g. the "tries everything once" test).
 */
export const SERIES_RECIPE_IDS = ["tries_episode"] as const;
export const ALL_REEL_RECIPE_IDS = [...REEL_RECIPE_IDS, ...SERIES_RECIPE_IDS] as const;
export type ReelRecipeId = (typeof ALL_REEL_RECIPE_IDS)[number];

/**
 * One concrete way to play a recipe. `when` gates it on the scene (entityText = allowed_props +
 * wardrobe_lock + spatial_setup, lowercased) so a recipe never asks Kling to handle an object the
 * scene does not contain. A variant without `when` is always eligible (every variant-carrying
 * recipe has at least one, so the recipe never dead-ends on a scene its action class allows).
 */
export interface ReelRecipeVariant {
  id: string;
  when?: (entityText: string) => boolean;
  openingState: string;
  hookBeat: string;
  action: string;
  closingBeat: string;
  /** Overlay pool matched to this action. lowercase, <= 6 words, validated in the tests. */
  hookTextPool: ReadonlyArray<string>;
}

export interface ReelRecipe {
  /** Also the chs_shot_archetypes.id and chs_media.shot_archetype value. */
  id: ReelRecipeId;
  label: string;
  /** Scene action classes the recipe may run on. Anything else -> recipe is skipped for the day. */
  requiredActionClasses: ReadonlyArray<ActionClass>;
  framing: ReelFraming;
  durationSec: number;
  openingState: string;
  hookBeat: string;
  action: string;
  closingBeat: string;
  /** FULL replacement for the default negative prompt. */
  negativePrompt: string;
  /** Curated overlay strings. lowercase, <= 6 words, validated in reelRecipes.test.ts. */
  hookTextPool: ReadonlyArray<string>;
  /** Static action for lib/reelArchetypeAction.ts (start-frame pose prep). */
  archetypeAction: string;
  /** chs_shot_archetypes.guidance */
  archetypeGuidance: string;
  // ReelFormat-shaped fields (lib/reelFormats.ts) used by the discovery-mode deck framing.
  coverCue: string;
  videoDirective: string;
  overlayStyle: string;
  /** Phase 8: "moment" recipes (an event + payoff) vs the classic ootd/grwm shapes. */
  kind?: "classic" | "moment";
  /** Phase 8: scene-gated variants; when present the top-level beats/pool are the default variant's. */
  variants?: ReadonlyArray<ReelRecipeVariant>;
  /** Where the burned hook goes. Default top third; "lower" = just above the IG caption zone. */
  overlayPosition?: "top" | "lower";
}

// ── Phase 8 moment recipes ─────────────────────────────────────────────────────────────────────
// Prompt rules these strings obey (all enforced by validateSceneCoherence / the tests):
//   * no digits followed by s/sec/second — the validator reads the FIRST such number as the clip
//     duration, so timing is written in words ("within the first second", "for a beat");
//   * no "she walks / steps forward" (locomotion_coherence on stationary scenes);
//   * no manipulation verbs on a cup/keys/phone unless the variant is gated on that prop;
//   * no "— verb-ing, verb-ing, verb-ing" alternative lists (auto_reel_single_action);
//   * close / close-medium framing only, face toward the lens at the end (identity anchor).
const has = (re: RegExp) => (t: string) => re.test(t);
const VESSEL = /\b(cup|mug|coffee|espresso|latte|tea)\b/i;
const KEYS = /\b(keys?|key ring|keyring)\b/i;
const SLEEVED_KNIT = /\b(sweater|jumper|pullover|cardigan|knit|hoodie|long[- ]sleeved?)\b/i;
const OUTER_LAYER = /\b(coat|trench|jacket|blazer|cardigan|overshirt)\b/i;
const SUNGLASSES = /\b(sunglasses|shades)\b/i;

const MOMENT_NEGATIVES = [
  ...DEFAULT_REEL_NEGATIVES,
  "no scene change",
  "no extra hands",
  "no extra fingers",
  "no object morphing",
  "no full body",
  "no camera roll",
].join(", ");

const REVEAL_VARIANTS: ReelRecipeVariant[] = [
  {
    id: "mug",
    when: has(VESSEL),
    openingState: "facing the lens with one hand hidden behind her back and a mischievous half-smile, looking straight at the camera",
    hookBeat: "Within the first second her hidden hand swings out from behind her back holding her ceramic mug, steam rising.",
    action: "she brings the mug up beside her face, eyebrows raised as if to say this is for you, and a slow smile spreads",
    closingBeat: "She ends holding the mug next to her cheek, eyes on the lens, smiling, on a clean still frame.",
    hookTextPool: ["wait for it", "coffee’s ready, come here", "made you one", "okay, close your eyes", "guess what’s behind my back"],
  },
  {
    id: "letter_sleeve",
    when: has(SLEEVED_KNIT),
    openingState: "facing the lens, both hands pulled inside her long sleeves, looking straight at the camera with a secret smile",
    hookBeat: "Within the first second she draws a small folded letter out of her sleeve like a magic trick.",
    action: "she holds the letter up between two fingers toward the lens and her smile breaks into a quiet laugh",
    closingBeat: "She ends with the letter pressed to her chest, eyes on the lens, on a clean still frame.",
    hookTextPool: ["wait for it", "this one’s for you", "wrote you something", "okay, don’t laugh", "read it later"],
  },
  {
    id: "keys",
    when: has(KEYS),
    openingState: "facing the lens with one hand hidden behind her back, eyebrows raised, looking straight at the camera",
    hookBeat: "Within the first second her hand swings out from behind her back and dangles her keys in front of the lens.",
    action: "she tilts her head toward the door with a grin that says get in, we are going",
    closingBeat: "She ends with the keys held up beside her face, grinning at the lens, on a clean still frame.",
    hookTextPool: ["wait for it", "get in, we’re going", "you’re coming with me", "no plans? now there are", "guess where we’re going"],
  },
  {
    id: "flowers",
    openingState: "facing the lens with both hands hidden behind her back and a shy smile, looking straight at the camera",
    hookBeat: "Within the first second her hands come out from behind her back holding a small bunch of fresh flowers.",
    action: "she lifts the flowers up next to her face and breathes them in, her eyes closing for a beat, then opening on the lens",
    closingBeat: "She ends holding the flowers under her chin, smiling at the lens, on a clean still frame.",
    hookTextPool: ["wait for it", "picked these for you", "okay, close your eyes", "guess what’s behind my back", "for you, obviously"],
  },
];

const OUTFIT_VARIANTS: ReelRecipeVariant[] = [
  {
    id: "sunglasses_on",
    when: has(SUNGLASSES),
    openingState: "close to the lens, sunglasses held folded in one hand at her collarbone, looking straight at the camera",
    hookBeat: "Within the first second she flicks the sunglasses open with one hand.",
    action: "she slides them on in one smooth move, pushes them up her nose with a fingertip and her chin lifts",
    closingBeat: "She ends in the sunglasses with a slow confident smile at the lens, on a clean still frame.",
    hookTextPool: ["okay, now we’re ready", "and just like that", "main character loading", "one second, the glasses", "now we can go"],
  },
  {
    id: "coat_off",
    when: has(OUTER_LAYER),
    openingState: "close to the lens, hands at the front edges of her outer layer, looking straight at the camera",
    hookBeat: "Within the first second she shrugs her outer layer back off both shoulders in one fluid move.",
    action: "the layer slips down her arms, revealing her outfit underneath, and she rolls her shoulders back",
    closingBeat: "She ends with the outfit fully readable from the chest up and a satisfied half-smile at the lens, on a clean still frame.",
    hookTextPool: ["wait for the reveal", "okay, the real outfit", "underneath, though", "and just like that", "the reveal, one second"],
  },
  {
    id: "hair_up",
    openingState: "close to the lens, both hands gathering her hair at the nape of her neck, looking straight at the camera",
    hookBeat: "Within the first second she sweeps her hair up off her neck with both hands.",
    action: "she twists it into a loose knot on top of her head, revealing her neckline and the thin gold chain, and lets her hands fall",
    closingBeat: "She ends with her hair up and a soft smile at the lens, on a clean still frame.",
    hookTextPool: ["wait for the reveal", "and just like that", "hair up, different person", "okay, now we’re ready", "one move, that’s it"],
  },
];

const SURPRISE_VARIANTS: ReelRecipeVariant[] = [
  {
    id: "laugh_offcamera",
    openingState: "close to the lens, composed and serious, looking straight at the camera",
    hookBeat: "Within the first second something off camera to her left catches her attention and she turns her head toward it.",
    action: "a real laugh breaks out of her, her hand comes up to her mouth and her shoulders shake once",
    closingBeat: "She turns back to the lens still laughing and ends on a wide smile, on a clean still frame.",
    hookTextPool: ["tried to stay serious", "take one, failed", "okay, who did that", "take two, still laughing", "attempt number four"],
  },
  {
    id: "turn_to_sound",
    openingState: "close to the lens, calm, gaze resting just past the camera",
    hookBeat: "Within the first second she reacts to a sound off camera, eyebrows shooting up and her head turning sharply toward it.",
    action: "she holds there for a beat, then her surprise melts into a slow knowing smile",
    closingBeat: "She ends turned back to the lens with the knowing smile, on a clean still frame.",
    hookTextPool: ["wait, did you hear that", "okay, plot twist", "wait, that sound", "not what you expected", "wait for it"],
  },
  {
    id: "caught",
    openingState: "close to the lens, lost in thought, gaze down and away from the camera",
    hookBeat: "Within the first second she notices the camera and startles, eyes going wide.",
    action: "she covers a laugh with one hand, shakes her head, and relaxes into a smile",
    closingBeat: "She ends looking right into the lens, smiling, caught, on a clean still frame.",
    hookTextPool: ["you weren’t supposed to see", "okay, caught", "how long were you there", "pretend you saw nothing", "not ready, but hi"],
  },
];

const PLAYFUL_VARIANTS: ReelRecipeVariant[] = [
  {
    id: "hand_cup",
    when: has(VESSEL),
    openingState: "close to the lens with her cup cradled in both hands at chest height, looking straight at the camera",
    hookBeat: "Within the first second she leans toward the lens and offers the cup out toward the camera, as if handing it to you.",
    action: "she holds the offer for a beat with raised eyebrows, then draws it back to herself with a teasing smile",
    closingBeat: "She ends cradling the cup under her chin, smiling at the lens, on a clean still frame.",
    hookTextPool: ["this one’s yours", "here, made you one", "come sit with me", "okay, your turn", "careful, it’s hot"],
  },
  {
    id: "cover_lens",
    openingState: "close to the lens, playful look, one hand already raised toward the camera",
    hookBeat: "Within the first second her palm comes up and covers the lens, the frame going dark for a beat.",
    action: "her hand slides away to reveal her grinning at the lens, eyebrows up",
    closingBeat: "She ends on the grin, face fully visible and turned to the lens, on a clean still frame.",
    hookTextPool: ["no, you can’t see yet", "okay, now look", "not yet, not yet", "okay, hello again", "wait for it"],
  },
  {
    id: "tap_lens",
    openingState: "close to the lens, chin resting on one hand, looking straight at the camera",
    hookBeat: "Within the first second she reaches out and taps the lens once with a fingertip, as if checking you are there.",
    action: "she pulls her hand back and laughs softly, tucking her hair behind her ear",
    closingBeat: "She ends with her chin back on her hand, smiling at the lens, on a clean still frame.",
    hookTextPool: ["hello, are you there", "just checking on you", "you’re still here?", "hi, it’s me again", "okay, you stayed"],
  },
];

function momentRecipe(
  id: ReelRecipeId,
  label: string,
  requiredActionClasses: ActionClass[],
  variants: ReelRecipeVariant[],
  extra: Pick<ReelRecipe, "archetypeAction" | "archetypeGuidance" | "coverCue" | "videoDirective" | "overlayStyle">
): ReelRecipe {
  const d = variants[variants.length - 1]; // the always-eligible default variant is listed last
  const pool = [...new Set(variants.flatMap((v) => v.hookTextPool))];
  return {
    id,
    label,
    kind: "moment",
    requiredActionClasses,
    framing: "close_medium",
    durationSec: 8,
    openingState: d.openingState,
    hookBeat: d.hookBeat,
    action: d.action,
    closingBeat: d.closingBeat,
    negativePrompt: MOMENT_NEGATIVES,
    hookTextPool: pool,
    variants,
    ...extra,
  };
}

const STATIONARY_PLUS: ActionClass[] = ["gesture", "seated_still", "standing_still", "eating_drinking", "other"];

export const REEL_RECIPES: Record<ReelRecipeId, ReelRecipe> = {
  ootd_stop: {
    id: "ootd_stop",
    label: "OOTD stop",
    kind: "classic",
    requiredActionClasses: ["locomotion", "standing_still"],
    framing: "medium",
    durationSec: 8,
    // Mid-stride on purpose: image-to-video cannot "walk in" from outside the start frame, so the
    // start frame already catches her arriving. No sentence below may trip the validator's
    // locomotion rule (she walks / steps forward / strides forward) — it fires on stationary scenes.
    openingState: "mid-stride, arriving toward the camera",
    hookBeat: "She slows to a stop and her eyes find the lens.",
    action: "one hand smooths the front of her outfit once and her weight settles onto one hip",
    closingBeat: "She holds the pose, outfit fully readable, and the clip ends on a clean still frame.",
    negativePrompt: [
      "no speech",
      "no text",
      "no captions",
      "no watermark",
      "no zoom",
      "no cuts",
      "no jump cuts",
      "no scene change",
      "no outfit change",
      "no second person in frame",
      "no face morphing",
      "no sliding feet",
    ].join(", "),
    hookTextPool: [
      "ootd, one second",
      "stop scrolling, it’s the fit",
      "today’s fit, one take",
      "wait for the outfit",
      "how’s the fit",
      "the fit, no filter",
    ],
    archetypeAction: "she comes to a stop, one hand smoothing the front of her outfit as her eyes find the lens",
    archetypeGuidance:
      "OOTD stop — outfit-readable medium shot (knees up). She arrives into the frame mid-stride, slows to a stop and settles into one relaxed pose; wardrobe fully visible, face clearly readable, clean space in the top third for a text overlay. One take, no cuts.",
    coverCue:
      "Mid-stride arrival, outfit fully readable from the knees up, face visible and turned toward the lens. Clean negative space in the top third for the overlay.",
    videoDirective:
      "She arrives mid-stride, slows to a stop, one small outfit gesture, holds the pose and the look. One take, no cuts, ends on a clean still frame.",
    overlayStyle: "Short lowercase OOTD line — 'ootd, one second', 'how’s the fit'. Top third.",
  },
  grwm_loading: {
    id: "grwm_loading",
    label: "GRWM loading",
    kind: "classic",
    requiredActionClasses: ["grooming", "gesture", "seated_still", "standing_still"],
    framing: "close_medium",
    durationSec: 8,
    openingState: "mid get-ready, one hand already raised toward her hair, looking toward the mirror just off camera",
    hookBeat: "Within the first second she glances to the lens as if to say it is still loading.",
    action: "she finishes one small get-ready touch and her shoulders drop into a satisfied half-smile",
    closingBeat: "She holds the look, finished, and the last frame matches the first so it loops.",
    negativePrompt: [...DEFAULT_REEL_NEGATIVES, "no outfit change", "no fast movement"].join(", "),
    // No "grwm" / "almost ready" lines (user feedback 13.10: it was on every reel). Retired recipe.
    hookTextPool: [
      "getting ready, slowly",
      "one more touch and done",
      "the last little detail",
      "hair first, then coffee",
      "slow morning routine",
    ],
    archetypeAction: "she finishes one small get-ready touch and her shoulders drop into a satisfied half-smile",
    archetypeGuidance:
      "GRWM loading — close-medium, mid get-ready (hair, jewellery, collar). One small finishing touch, a glance to the lens, a satisfied half-smile; the clip should read like a progress bar completing. Clean space in the top third for a text overlay.",
    coverCue:
      "Unfinished, in-process get-ready moment — hand raised to hair or collar, face visible, relaxed and real. Clean negative space in the top third for the overlay.",
    videoDirective:
      "One finishing touch, a glance to the lens, a satisfied half-smile — like a progress bar completing. 2 beats, loops on the half-smile.",
    overlayStyle: "Short lowercase get-ready line — 'one more touch and done'. Top third.",
  },
  reveal_object: momentRecipe("reveal_object", "Reveal object", STATIONARY_PLUS, REVEAL_VARIANTS, {
    archetypeAction: "she faces the lens with one hand hidden behind her back, about to reveal something, a mischievous half-smile",
    archetypeGuidance:
      "Reveal object — close-medium, face to the lens. Start: one hand hidden behind her back (or inside a long sleeve). Within the first second the hand comes out with a small object that exists in the scene (her mug, keys) or a small bunch of flowers / a folded letter; payoff: she presents it beside her face and smiles. One take, no cuts, ends on a still frame.",
    coverCue: "Close-medium, face to the lens, one hand hidden behind her back, a mischievous half-smile — the object withheld. Clean space in the top third for the overlay.",
    videoDirective: "Hidden hand -> reveal inside the first second -> she presents the object beside her face -> smile -> still end pose. One take.",
    overlayStyle: "Short lowercase tease matched to the object — 'wait for it', 'made you one'. Top third.",
  }),
  outfit_reveal: momentRecipe("outfit_reveal", "Outfit / accessory reveal", ["gesture", "seated_still", "standing_still", "locomotion", "grooming", "other"], OUTFIT_VARIANTS, {
    archetypeAction: "she faces the lens with both hands raised to her hair or collar, about to change one thing about her look",
    archetypeGuidance:
      "Outfit / accessory reveal — close-medium, face to the lens. Within the first second one quick look change: sunglasses go on, an outer layer slides off the shoulders, or her hair sweeps up to reveal neckline and chain; payoff: the new look and a confident smile. Never full body. One take, no cuts.",
    coverCue: "Close-medium 'before' state — hands at sunglasses, collar or hair, the change withheld, face to the lens. Clean space in the top third for the overlay.",
    videoDirective: "One quick accessory/layer change inside the first second, then the new look lands with a confident smile and a still end pose.",
    overlayStyle: "Short lowercase reveal line — 'and just like that', 'wait for the reveal'. Top third.",
  }),
  surprise_reaction: momentRecipe("surprise_reaction", "Surprise reaction", ["gesture", "seated_still", "standing_still", "reclining", "grooming", "eating_drinking", "other"], SURPRISE_VARIANTS, {
    archetypeAction: "she sits composed close to the lens, a moment before something off camera catches her attention",
    archetypeGuidance:
      "Surprise reaction — close-medium, face to the lens. Within the first second something off camera (a sound, someone out of frame) breaks her composure: she turns toward it, laughs or startles; payoff: she turns back to the lens smiling. Nobody else enters the frame. One take, no cuts.",
    coverCue: "Close-medium, composed, face to the lens a moment before the surprise. Clean space in the top third for the overlay.",
    videoDirective: "Composed -> off-camera surprise inside the first second -> real laugh or startle -> back to the lens smiling, still end pose.",
    overlayStyle: "Short lowercase blooper line — 'tried to stay serious', 'okay, caught'. Top third.",
  }),
  playful_camera: momentRecipe("playful_camera", "Playful to camera", ["gesture", "seated_still", "standing_still", "reclining", "eating_drinking", "other"], PLAYFUL_VARIANTS, {
    archetypeAction: "she leans close to the lens with a playful look, one hand starting to reach toward the camera",
    archetypeGuidance:
      "Playful to camera — close, face to the lens. Within the first second she interacts with the camera itself: offers her cup to the viewer, covers the lens with her palm, or taps it with a fingertip; payoff: a grin straight into the lens. One take, no cuts, no zoom.",
    coverCue: "Close, playful, face to the lens, one hand reaching toward the camera. Clean space in the top third for the overlay.",
    videoDirective: "She interacts with the lens inside the first second (offer, cover, tap), then a grin straight into the lens and a still end pose.",
    overlayStyle: "Short lowercase direct-address line — 'this one’s yours', 'okay, now look'. Top third.",
  }),
  // "Vivienne tries everything once" — first attempt at a new activity: real motion, a wobble/laugh
  // as the event, payoff = close face + eye contact. Runs on ANY action class (horse riding, pole,
  // boxing, surfing...). The overlay comes from the date override; the pool is only a fallback.
  tries_episode: {
    id: "tries_episode",
    label: "Tries everything once — episode",
    kind: "moment",
    requiredActionClasses: ["locomotion", "seated_still", "standing_still", "reclining", "gesture", "grooming", "eating_drinking", "exercise", "swimming", "other"],
    framing: "close_medium",
    durationSec: 8,
    openingState: "mid-attempt at something she has never done before, concentrating hard, her body already in motion",
    hookBeat: "Within the first second the attempt wobbles and she breaks into a surprised, genuine laugh.",
    action: "she steadies herself and tries the same movement once more, this time with more confidence",
    closingBeat: "She turns her face close to the lens, slightly breathless and proud, holds eye contact with a small smile, and the clip ends on a clean still frame.",
    negativePrompt: [...DEFAULT_REEL_NEGATIVES, "no scene change", "no extra hands", "no extra fingers", "no object morphing", "no camera roll", "no second person's face", "no social media interface"].join(", "),
    hookTextPool: ["first time, be nice", "never done this before", "okay, harder than it looks", "day one, no idea"],
    archetypeAction: "she is mid-attempt at a new activity, concentrating, body in motion, face visible and close to the lens",
    archetypeGuidance:
      "Tries everything once — close-medium, face clearly visible. She is mid-attempt at an activity she has never done (the scene names it); within the first second a small wobble or misstep makes her laugh; she tries once more with more confidence; payoff: she turns close to the lens, breathless and proud, eye contact. Elegant styling in contrast with the setting. One take, no cuts.",
    coverCue: "Close-medium, mid-movement in the new activity, face visible, concentration about to break into a laugh. Her face sits in the upper-middle of the frame with a little headroom above her head; keep the lower third uncluttered for the overlay.",
    videoDirective: "Mid-attempt -> wobble and a real laugh inside the first second -> one more confident try -> close to the lens, eye contact, still end pose. One take.",
    overlayStyle: "Numbered series line — 'day 1: horse riding. never done this'. Lower third, above the caption zone.",
    overlayPosition: "lower",
  },
};

export const REEL_RECIPE_LIST: ReelRecipe[] = REEL_RECIPE_IDS.map((id) => REEL_RECIPES[id]);

export function getReelRecipe(id: string | null | undefined): ReelRecipe | undefined {
  return id && (ALL_REEL_RECIPE_IDS as readonly string[]).includes(id) ? REEL_RECIPES[id as ReelRecipeId] : undefined;
}

export function isReelRecipeId(id: string | null | undefined): id is ReelRecipeId {
  return !!getReelRecipe(id);
}

/** Recipes are on when the character has reel_recipes_v1 or REEL_RECIPES_ENABLED=true (kill switch: "false"). */
export function reelRecipesEnabled(flagOn: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const e = env.REEL_RECIPES_ENABLED;
  if (e === "false") return false;
  return e === "true" || flagOn;
}

/** Normalised for comparison (case, curly quotes, trailing ellipsis/punctuation). */
export function normalizeHookText(t: string): string {
  return t.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[.…!?,\s]+$/g, "").replace(/\s+/g, " ").trim();
}

/** Lines never burned into a reel any more (they ran on every reel before 13.10). */
export const BANNED_HOOK_PATTERNS: ReadonlyArray<RegExp> = [/\bgrwm\b/i, /almost ready/i];

export function isBannedHookText(t: string): boolean {
  return BANNED_HOOK_PATTERNS.some((re) => re.test(t));
}

/**
 * Deterministic hook text that advances EVERY day (pool[day % len]), skips banned lines, and skips
 * any line in `avoid` (the last few reels' burned-in texts) so the same phrase never runs on
 * consecutive days. If everything is excluded it falls back to the plain day pick of the allowed pool.
 */
export function pickHookText(
  recipe: ReelRecipe,
  dayNumber: number | null | undefined,
  pool: ReadonlyArray<string> = recipe.hookTextPool,
  avoid: ReadonlyArray<string | null | undefined> = []
): string {
  const n = Number.isFinite(dayNumber) ? Math.abs(Math.trunc(dayNumber as number)) : 0;
  const allowed = pool.filter((t) => !isBannedHookText(t));
  const base = allowed.length > 0 ? allowed : pool;
  const avoidSet = new Set(avoid.filter((a): a is string => typeof a === "string" && !!a.trim()).map(normalizeHookText));
  for (let i = 0; i < base.length; i++) {
    const t = base[(n + i) % base.length];
    if (!avoidSet.has(normalizeHookText(t))) return t;
  }
  return base[n % base.length];
}

/* ── Phase 8 rotation ──────────────────────────────────────────────────────────────────────────
 * A fixed 10-day pattern: 7 moment days (M), 3 classic days (C), never two C in a row, including
 * across the wrap (it ends on C and starts on M). Moment days walk the 4 moment recipes in order
 * and classic days alternate ootd/grwm, each with a running counter across cycles, so two
 * consecutive days can never get the same recipe (consecutive M days differ because 4 > 1;
 * a C day is always flanked by M days).
 * Kill switch: REEL_MOMENT_RECIPES=false -> the pre-phase-8 classic alternation.
 */
export const ROTATION_PATTERN = ["M", "M", "C", "M", "M", "M", "C", "M", "M", "C"] as const;
const M_PER_CYCLE = ROTATION_PATTERN.filter((x) => x === "M").length;
const C_PER_CYCLE = ROTATION_PATTERN.length - M_PER_CYCLE;

export function momentRecipesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REEL_MOMENT_RECIPES !== "false";
}

export function recipeIdForDay(seed: number, env: Record<string, string | undefined> = process.env): ReelRecipeId {
  const s = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  if (!momentRecipesEnabled(env)) {
    return ROTATION_CLASSIC_IDS[((s % ROTATION_CLASSIC_IDS.length) + ROTATION_CLASSIC_IDS.length) % ROTATION_CLASSIC_IDS.length];
  }
  const L = ROTATION_PATTERN.length;
  const cycle = Math.floor(s / L);
  const pos = s - cycle * L; // 0..L-1, also for negative seeds
  const before = ROTATION_PATTERN.slice(0, pos);
  if (ROTATION_PATTERN[pos] === "M") {
    const k = cycle * M_PER_CYCLE + before.filter((x) => x === "M").length;
    return MOMENT_RECIPE_IDS[((k % MOMENT_RECIPE_IDS.length) + MOMENT_RECIPE_IDS.length) % MOMENT_RECIPE_IDS.length];
  }
  const k = cycle * C_PER_CYCLE + before.filter((x) => x === "C").length;
  return ROTATION_CLASSIC_IDS[((k % ROTATION_CLASSIC_IDS.length) + ROTATION_CLASSIC_IDS.length) % ROTATION_CLASSIC_IDS.length];
}

/** Variants of `recipe` that the scene can carry (always >= 1 for variant recipes). */
export function eligibleVariants(recipe: ReelRecipe, entityText: string): ReelRecipeVariant[] {
  return (recipe.variants ?? []).filter((v) => !v.when || v.when(entityText));
}

/**
 * Scene-gated variants win when present (the mug reveal beats flowers whenever there IS a mug —
 * that is the reel that worked); among several gated ones, or among the ungated ones, rotate by day.
 */
export function pickVariant(recipe: ReelRecipe, entityText: string, dayNumber: number | null | undefined): ReelRecipeVariant | undefined {
  const all = eligibleVariants(recipe, entityText);
  if (all.length === 0) return undefined;
  const gated = all.filter((v) => !!v.when);
  const pool = gated.length > 0 ? gated : all;
  const n = Number.isFinite(dayNumber) ? Math.abs(Math.trunc(dayNumber as number)) : 0;
  return pool[Math.floor(n / REEL_RECIPE_IDS.length) % pool.length];
}

export function recipeSupportsActionClass(recipe: ReelRecipe, cls: ActionClass): boolean {
  return recipe.requiredActionClasses.includes(cls);
}

/** Persisted under chs_media.visual_signature.reel_recipe — read back by video-async. */
export interface ReelRecipeMarker {
  id: ReelRecipeId;
  hook_text: string;
  negative_prompt: string;
  target_duration_sec: number;
  /** Phase 8: which variant of a moment recipe ran (e.g. "mug"). */
  variant?: string;
  /** Set by video-async: "applied" | "render_failed" | "needs_review" | "skipped". */
  overlay_status?: string;
  overlay_detail?: string;
  /** Experiment tag (reel_hook_overrides), e.g. "controversy_v1". */
  experiment?: string;
  /** Burned overlay placement (recipe overlayPosition). Absent = top third. */
  overlay_position?: "top" | "lower";
}

export function readReelRecipeMarker(signature: unknown): ReelRecipeMarker | null {
  if (!signature || typeof signature !== "object") return null;
  const m = (signature as { reel_recipe?: unknown }).reel_recipe;
  if (!m || typeof m !== "object") return null;
  const r = m as Partial<ReelRecipeMarker>;
  if (!isReelRecipeId(r.id as string) || typeof r.hook_text !== "string" || !r.hook_text.trim()) return null;
  return {
    id: r.id as ReelRecipeId,
    hook_text: r.hook_text,
    negative_prompt: typeof r.negative_prompt === "string" ? r.negative_prompt : "",
    target_duration_sec: typeof r.target_duration_sec === "number" ? r.target_duration_sec : 8,
    ...(typeof r.variant === "string" && r.variant ? { variant: r.variant } : {}),
    ...(r.overlay_status ? { overlay_status: r.overlay_status } : {}),
    ...(r.overlay_detail ? { overlay_detail: r.overlay_detail } : {}),
    ...(typeof r.experiment === "string" && r.experiment ? { experiment: r.experiment } : {}),
    ...(r.overlay_position === "lower" || r.overlay_position === "top" ? { overlay_position: r.overlay_position } : {}),
  };
}

export interface RecipeReelInput {
  sceneBrief: SceneBriefJson;
  sceneLocation?: string | null;
  activityHint?: string | null;
  dayNumber?: number | null;
  /** Hook texts burned into the most recent reels — never repeated (consecutive-day guard). */
  avoidHookTexts?: ReadonlyArray<string | null | undefined>;
  /** Series day (reel_hook_overrides[date].action): the concrete activity, gerund phrase
   *  ("riding a calm chestnut horse at a walk"). Only the tries_episode recipe uses it. */
  activity?: string | null;
}

export interface CompiledRecipeReel extends SimpleReelPrompt {
  recipe: ReelRecipe;
  hookText: string;
  marker: ReelRecipeMarker;
  variant?: ReelRecipeVariant;
}

/** Goes through compileSimpleReel's seams only; throws on semantic errors (retry logic keys on the message). */
export function compileRecipeReel(recipe: ReelRecipe, input: RecipeReelInput): CompiledRecipeReel {
  let variant: ReelRecipeVariant | undefined;
  if (recipe.variants && recipe.variants.length > 0) {
    const sem = resolveSceneSemantics(input.sceneBrief, { sceneLocation: input.sceneLocation, activityHint: input.activityHint });
    variant = pickVariant(recipe, sem.entityText, input.dayNumber);
  }
  const act = recipe.id === "tries_episode" ? input.activity?.trim().replace(/[.\s]+$/, "") : undefined;
  const beats = act
    ? {
        openingState: `mid-attempt at ${act} for the very first time, concentrating hard, her body already in motion`,
        hookBeat: recipe.hookBeat,
        action: `she steadies herself and keeps ${act}, this time with more confidence`,
        closingBeat: recipe.closingBeat,
      }
    : variant ?? recipe;
  const compiled = compileSimpleReel({
    sceneBrief: input.sceneBrief,
    sceneLocation: input.sceneLocation,
    activityHint: input.activityHint,
    dayNumber: input.dayNumber,
    durationSec: recipe.durationSec,
    framing: recipe.framing,
    openingState: beats.openingState,
    hookBeat: beats.hookBeat,
    action: beats.action,
    closingBeat: beats.closingBeat,
    negativePrompt: recipe.negativePrompt,
  });
  if (!recipeSupportsActionClass(recipe, compiled.semantics.actionClass)) {
    throw new Error(
      `Semantic validation failed for reel_video (${recipe.id}): [format_coherence] recipe requires an action class in [${recipe.requiredActionClasses.join(", ")}] but this scene's action class is "${compiled.semantics.actionClass}"`
    );
  }
  if (compiled.validation.errors.length > 0) {
    throw new Error(
      `Semantic validation failed for reel_video (${recipe.id}): ${compiled.validation.errors.map((e) => `[${e.rule}] ${e.detail}`).join(" | ")}`
    );
  }
  const hookText = pickHookText(recipe, input.dayNumber, variant?.hookTextPool ?? recipe.hookTextPool, input.avoidHookTexts ?? []);
  return {
    ...compiled,
    recipe,
    hookText,
    ...(variant ? { variant } : {}),
    marker: {
      id: recipe.id,
      hook_text: hookText,
      negative_prompt: compiled.negativePrompt,
      target_duration_sec: recipe.durationSec,
      ...(variant ? { variant: variant.id } : {}),
      ...(recipe.overlayPosition ? { overlay_position: recipe.overlayPosition } : {}),
    },
  };
}
