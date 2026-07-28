import type {
  StoryTier,
  SexualEnergyLevel,
  MagnetismReason,
  ContinuityPhase,
  FanvueTensionPotential,
  SocialContextMode,
} from "@/types";
import { MAGNETISM_REASONS } from "@/lib/sexualEnergyConfig";
import type { PlayfulHotWorldProfile } from "@/lib/playfulHotWorldConfig";

// open_life_generation_v1 — assembly + translation. Cross-cutting concern that neither
// lib/storyTier.ts (tier SELECTION + prose) nor lib/lifeState.ts (numeric life continuity)
// owns: this module turns a chosen tier + memory/micro-event context into the OUTPUT FORMAT
// prompt fragment, and later turns the resulting structured GenerativeSituation into the
// slot-prompt translation lib/slotPrompts.ts consumes.

export interface SocialContext {
  mode: SocialContextMode;
  implication: string;
}

export interface SexualEnergySpec {
  level: SexualEnergyLevel;
  expression: string;
  boundary: string;
}

export interface FanvueTensionSpec {
  potential: FanvueTensionPotential;
  continuation: string | null;
  withheld_element: string | null;
}

export interface VisualExecution {
  location: string;
  time_of_day: string;
  weather: string;
  action_visible: string;
  shot_intent: string;
}

// sensual_visual_language_v1 (iteration 2) — the concrete visual grammar of sexuality. A
// production dry-run showed sexual_energy.level="provocative" + expression="confident eye
// contact" was validation-legal but rendered as a neutral sweater/wine scene: the metadata
// existed but nothing FORCED it into what the image generator actually draws. Every field here
// must be a concrete, visually executable signal — never an abstract adjective like "attractive
// outfit" or "sensual styling" (enforced in lib/situationValidation.ts's noGenericWardrobeSignal).
export interface SensualVisualLanguage {
  wardrobe_signal: string;
  body_emphasis: string;
  gesture_or_action: string;
  camera_relationship: string;
  exposure_boundary: string;
}

// sex_appeal_style_v1 (iteration 3) — a live 14-day run showed sensual_visual_language greatly
// improving concreteness (real garments, real body emphasis), but the product review judged the
// result still reads as an attractive lifestyle profile, not a sexually magnetic one driving
// Fanvue conversion. This layer adds the explicit ARCHETYPE of the outfit, silhouette/shot-intent
// compatibility, mandatory facial energy at playful/provocative/intimate, and hard tier bans
// (no pure-gym intimate_aesthetic, no homewear luxe_car). Hard-prerequisite on
// sensual_visual_language_v1 (see lib/storyGeneration.ts's sexAppealStyleOn).
export interface SexAppealStyle {
  outfit_archetype: string;
  silhouette_focus: string;
  leg_visibility: string;
  facial_energy: string;
  seduction_mode: string;
}

// luxury_seduction_v1 (iteration 4) — a live 14-day run of sex_appeal_style_v1 validated but
// still read as "attractive lifestyle profile", with outfit rotation collapsing onto a narrow
// set of short strappy dresses (slip_dress/swimwear_coverup each repeated 3x/14 despite soft
// anti-repeat). This layer widens the fashion/pose/material/status vocabulary and — critically —
// upgrades outfit/pose anti-repeat from a soft prompt-text nudge to a hard validation block (see
// lib/situationValidation.ts's fashionDirectionFamilyNotOverused/poseArchetypeFamilyNotOverused).
// Hard-prerequisite on sex_appeal_style_v1 (see lib/storyGeneration.ts's luxurySeductionOn).
// Field-priority contract (doplnenie #11): fashion_direction is the primary fashion concept;
// sex_appeal_style.outfit_archetype must normalize to the SAME family; sensual_visual_language's
// wardrobe_signal is the concrete visible detail of that same concept; body_geometry drives pose,
// silhouette_focus drives framing; facial_seduction refines (never contradicts) facial_energy. A
// conflict between any of these must retry the situation, never reach the provider as contradictory
// instructions — see lib/situationValidation.ts's luxuryConceptCoherence.
export interface LuxurySeduction {
  luxury_level: "polished" | "premium" | "high_luxury";
  fashion_direction: string;
  material_language: string;
  accessory_language: string;
  footwear: string;
  pose_archetype: string;
  body_geometry: string;
  facial_seduction: string;
  social_status_signal: string;
}

export interface ActiveMicroEventContext {
  life_event_id?: string;
  premise: string;
  phase: ContinuityPhase;
  social_implication?: string | null;
  location_implication?: string | null;
  unresolved_choice?: string | null;
}

export interface GenerativeSituation {
  content_tier: StoryTier;
  current_life_context: string;
  life_domain: string;
  continuity_phase: ContinuityPhase;
  desire_signal: string;
  trigger: string;
  activity: string;
  reason: string;
  social_context: SocialContext;
  emotional_state: string;
  previous_consequence: string | null;
  next_implication: string | null;
  personality_signal: string;
  reality_detail: string;
  magnetic_hook: string;
  magnetism_reason: MagnetismReason;
  sexual_energy: SexualEnergySpec;
  fanvue_tension: FanvueTensionSpec;
  visual_execution: VisualExecution;
  active_micro_event?: ActiveMicroEventContext;
  sexual_cliches?: string[]; // self-tagged by the LLM call, consumed by lib/situationMemory.ts
  sensual_visual_language?: SensualVisualLanguage; // sensual_visual_language_v1 — optional, undefined when that flag is off (safe no-op downstream)
  sex_appeal_style?: SexAppealStyle; // sex_appeal_style_v1 — optional, undefined when that flag is off (safe no-op downstream)
  luxury_seduction?: LuxurySeduction; // luxury_seduction_v1 — optional, undefined when that flag is off (safe no-op downstream)
  playful_hot_world?: PlayfulHotWorldProfile; // playful_hot_world_v1 — optional, undefined when that flag is off (safe no-op downstream)
}

// Diagnostic sibling persisted alongside `situation` when validation never fully passed —
// see lib/storyGeneration.ts. `situation` itself stays null downstream (safe no-op for
// translateSituationForSlotPrompt / sceneBrief / fanvueUnlock); this is measurement only.
export interface SituationPlannerMeta {
  status: "validated" | "validation_exhausted";
  attempts: number;
  blocking_errors: string[];
  warnings: string[];
}

export interface SituationPlanningContext {
  tier: StoryTier;
  // Pre-picked by lib/sexualEnergyConfig.ts's pickSexualEnergyLevel() BEFORE this call, the
  // same way lived_moments' family/magnetism are pre-picked and dictated (not left to the LLM
  // to freely interpret a percentage table — LLMs do not reliably hit target distributions from
  // prose alone; see lib/storyTier.ts's momentFamilyGuidance/magnetismGuidance for precedent).
  dictatedSexualEnergyLevel: SexualEnergyLevel;
  sexualEnergyGuidance?: string;
  memoryGuidance?: string;
  microEventSpec?: string; // precomputed by lib/lifeState.ts's microEventOutputSpec()
  retryNote?: string; // "previous attempt's situation failed: ..." — set on retries only
  includeSensualVisualLanguage?: boolean; // sensual_visual_language_v1 — appends the schema block below
  includeSexAppealStyle?: boolean; // sex_appeal_style_v1 — appends the sex_appeal_style schema block below
  includeLuxurySeduction?: boolean; // luxury_seduction_v1 — appends the luxury_seduction schema block below
  includePlayfulHotWorld?: boolean; // playful_hot_world_v1 — appends the playful_hot_world schema block below
  dictatedPlayfulHotWorld?: PlayfulHotWorldProfile; // pre-picked by lib/playfulHotWorldConfig.ts's pickPlayfulHotWorldProfile() BEFORE this call, same dictation precedent as dictatedSexualEnergyLevel
  playfulHotWorldGuidance?: string; // precomputed by lib/playfulHotWorldConfig.ts's playfulHotWorldGuidance()
}

// The `situation` JSON key-schema fragment ONLY (no leading "- situation: object" bullet).
// MUST be embedded AS A KEY inside the existing `scene: {...}` object in the OUTPUT FORMAT —
// chs_story_days.scene is the ONE jsonb column this nests into (see extractSituation() below,
// which reads rawStory.scene.situation). Emitting `situation` as a top-level sibling of `scene`
// instead of a key inside it is a real regression to watch for: extractSituation() would then
// never find it and every attempt would fail validation as "missing", silently, for every day.
// sensual_visual_language_v1 — the "situation" key's sensual_visual_language sub-block.
// Explicit ALLOWED DIRECTIONS (inspiration, not an exhaustive whitelist) per the product spec,
// plus an explicit ban on generic adjectives — lib/situationValidation.ts's
// noGenericWardrobeSignal re-checks this at validation time, this is the prompt-side half.
const SENSUAL_VISUAL_LANGUAGE_SCHEMA = `,
        "sensual_visual_language": {
          "wardrobe_signal": "a CONCRETE, visually executable garment/cut description — name the piece and how it sits. Allowed directions (inspiration, not a whitelist): short fitted dress, mini skirt, high-slit skirt or dress, fitted shorts, cropped top exposing the waist, deep but IG-safe neckline, thin-strap top, semi-sheer fabric over opaque coverage, open shirt over swimwear or a fitted top, satin slip dress, oversized blazer with bare legs, sports bra and fitted bottoms, swimsuit with an open cover-up. BANNED — do not write generic labels with no garment named: 'attractive outfit', 'feminine styling', 'sensual clothing', 'nice look'.",
          "body_emphasis": "ONE or at most TWO dominant silhouette elements the shot is built around: legs, bare thighs, waist, collarbone and neckline, shoulders and back, hips through fitted clothing, athletic midriff, or silhouette through safe semi-sheer material. Must be renderable together with visual_execution.shot_intent below — do not choose legs/thighs/waist/hips emphasis and then a face-only close-up shot_intent.",
          "gesture_or_action": "translate the sexual energy into a natural, IG-safe ACTIVITY, not a static pose label — e.g. crossing or uncrossing her legs, adjusting the hem of a short dress, removing heels after an evening out, letting a shirt fall from one shoulder, resting a hand naturally on her thigh, running fingers through wet hair, fastening jewellery while getting ready, sitting at the pool edge with legs in the water, choosing between two bolder outfits, turning back toward a close photographer. Inspiration, not a whitelist.",
          "camera_relationship": "define the relationship with the viewer/photographer — e.g. close private-camera distance, direct knowing eye contact, photographed from a doorway by someone familiar, candid side angle followed by a glance, full-body framing that clearly shows legs and outfit, close crop that includes face, neckline and body posture.",
          "exposure_boundary": "what stays IG-safe and exactly what is deliberately left out of frame — restate the tier's SAFE RULES ceiling in the context of THIS specific wardrobe_signal/body_emphasis, do not leave this generic"
        }`;

// sex_appeal_style_v1 — tier-specific AVOID/PREFER guidance, embedded directly in the schema
// text (LLM-mediated primary prevention — same "ACTIVITY/PHASE WINS" two-layer philosophy as
// iteration 2; lib/situationValidation.ts's intimateAestheticNotPureGymScene/luxeCarNoHomewear
// are the deterministic backstop, not the primary mechanism).
function sexAppealTierGuidance(tier: StoryTier): string {
  if (tier === "intimate_aesthetic") {
    return "TIER RULE (intimate_aesthetic): must NOT be a pure gym scene, an active workout, a fitness machine as the dominant environment, or generic sport documentation. Activewear is allowed ONLY in a post-workout transition, private recovery, changing area, hotel wellness, shower aftermath, or returning-home-after-training context. Prefer: fitted mini or sheath dress, satin slip dress, fitted camisole, sheer blouse with opaque coverage, blazer with bare legs, short evening dress, swimwear with an open cover-up, getting-ready or aftermath styling.";
  }
  if (tier === "luxe_car") {
    return "TIER RULE (luxe_car): must NEVER use pyjama-coded styling, a robe, sleepwear, homewear, a shapeless cozy outfit, an oversized sweater, or a lounge set. Prefer: short evening dress, bodycon mini dress, satin dress, fitted nightlife top, blazer with bare legs, tights or stockings where appropriate, sleek after-party styling, fitted cocktail outfit. The car is a transition between real events, never a random backdrop.";
  }
  if (tier === "wellness_fitness") {
    return "TIER GUIDANCE (wellness_fitness): prefer sports bra, sculpting leggings, fitted athletic shorts, cropped active top, fitted dancewear, swimsuit, body-conscious recoverywear. Avoid shapeless gymwear, an oversized sweater, or a plain loose top with no body-confidence intent.";
  }
  if (tier === "everyday_life") {
    return "TIER GUIDANCE (everyday_life): can be calmer, but must not slip into a plain cozy diary. Prefer fitted tank, mini skirt, short shorts, open shirt over a fitted top, casual fitted dress, blazer with bare legs, satin camisole, fitted jeans with a strong neckline, after-event outfit.";
  }
  if (tier === "lived_moments") {
    return "TIER GUIDANCE (lived_moments): prefer short summer dress, mini skirt, fitted social outfit, beach or pool styling, open cover-up, body-conscious eveningwear, playful leg visibility, social-event styling.";
  }
  return "";
}

const SEX_APPEAL_STYLE_SCHEMA = (tier: StoryTier): string => `,
        "sex_appeal_style": {
          "outfit_archetype": "a CONCRETE, visually executable outfit archetype. Allowed directions (inspiration, not a whitelist): bodycon mini dress, fitted sheath dress, fitted pencil dress, satin slip dress, mini skirt with fitted top, fitted camisole with short skirt, sheer blouse over an opaque underlayer, blazer with bare legs, short dress with stockings or tights, fitted shorts with a body-conscious top, sports bra with sculpting leggings, cropped athletic top with fitted shorts, swimsuit with an open cover-up, fitted evening top with silhouette-emphasizing bottoms, high-slit evening dress, short cocktail dress, sleek nightlife outfit. BANNED — generic labels with no garment named: 'attractive outfit', 'feminine styling', 'sexy clothing', 'elegant look', 'stylish clothes', 'flattering outfit'. Must also make sense for today's weather/time/life_domain/activity — never choose stockings/tights or a blazer-bare-legs look for a beach, pool or active-gym situation just to hit a higher energy level. ${sexAppealTierGuidance(tier)}",
          "silhouette_focus": "ONE or at most TWO dominant elements: legs, bare thighs, waist, hips, neckline, collarbone, shoulders, back, athletic midriff, bodycon silhouette. MUST be compatible with visual_execution.shot_intent — legs/bare thighs/bodycon need medium-full or full-body framing; waist/hips need a medium shot; neckline/collarbone are compatible with a medium close-up; back/shoulders need a side or over-the-shoulder angle. Reject internally if the framing you chose cannot actually show the declared emphasis.",
          "leg_visibility": "how the legs/lower silhouette specifically show: seated with visible bare legs, crossed legs in a short dress, mini-skirt silhouette, blazer with bare legs, stockings-enhanced leg line, tights with a fitted short dress, heels removed after an evening event, pool-edge framing with visible legs, walking pose showing leg line, doorway pose showing full silhouette. May be 'not dominant' ONLY when silhouette_focus targets a different body area.",
          "facial_energy": "REQUIRED when sexual_energy.level is playful, provocative or intimate (may be omitted for subtle/warm). Allowed directions: teasing smile, soft seductive smile, confident playful smile, flirtatious half-smile, intimate knowing look, amused private smile, direct inviting eye contact, playful side glance, subtle provocative smile, confident closed-mouth smile. At provocative/intimate, the result must never read as neutral, sad or documentary UNLESS explicitly justified by a mystery/reveal concept. MUST cohere with emotional_state/seduction_mode/continuity_phase above — a teasing smile paired with an exhausted or grieving emotional_state is invalid, mechanical-feeling. BANNED: 'neutral expression', 'calm face', 'natural expression', 'slight smile'.",
          "seduction_mode": "one concrete magnetism type: playful tease, private access, elegant seduction, nightlife allure, body confidence, after-dark intimacy, soft provocative femininity, girlfriend-like closeness, controlled reveal, knowing camera flirt."
        }`;

// luxury_seduction_v1 — tier-specific AVOID/PREFER guidance, same two-layer philosophy as
// sexAppealTierGuidance above (LLM-mediated primary prevention; lib/situationValidation.ts's
// luxeCarRequiresNightlifeStyling/intimateAestheticNotPureGymScene are the deterministic backstop).
// playful_hot_world_v1 (iteration 5, doplnenie #7) — optional playfulOn param, gated behind its
// OWN flag: appends an expanded preferred-context list (rooftop/beach club/pool lounge/etc,
// de-prioritizing suite/corridor/seated-bar-interior/static-candle-table AS THE ONLY context)
// ONLY when playfulOn is true. luxury_seduction_v1-only characters (flag on, playful flag off)
// get byte-identical iteration-4 guidance — each layer's behavior change requires its own flag.
function luxurySeductionTierGuidance(tier: StoryTier, playfulOn?: boolean): string {
  const expandedContext = playfulOn
    ? " Luxury does NOT mean only a quiet hotel — prefer contexts with real energy and daylight/social life: rooftop, beach club, pool lounge, resort terrace, boutique street, ocean-side promenade, yacht or boat deck, hotel breakfast light, nightlife district, premium daytime city. Avoid defaulting to a suite, corridor, seated-bar interior, or a static candle/table setup as the ONLY context — those are fine occasionally, not the default."
    : "";
  if (tier === "luxe_car") {
    return "TIER RULE (luxe_car): MUST have a nightlife/event fashion_direction, heels or elegant/strappy footwear (barefoot ONLY when continuity_phase is aftermath — e.g. heels removed, driving home after the event), a clutch or evening-bag accessory_language, and a pose_archetype tied to arrival, departure or the decision to continue the night (stepping out of a car, doorway with a shifted hip, turning back while walking away, removing a jacket over the shoulder, rising from a chair, crossing the room with direct eye contact). NEVER pyjama/robe/sleepwear/homewear/shapeless cozy/oversized sweater/lounge set, and never a random idle sitting pose with no arrival/departure logic. The car is a transition between real events, never a random backdrop." + expandedContext;
  }
  if (tier === "intimate_aesthetic") {
    return "TIER GUIDANCE (intimate_aesthetic): prefer a hotel or private suite, a dressing/undressing moment, a balcony, after-event, private pool, morning-after, elegant home interior, boutique changing room, boat cabin, or spa recovery. Should NOT be gym as the primary environment (activewear only in a genuine post-workout/recovery transition)." + expandedContext;
  }
  if (tier === "lived_moments") {
    return "TIER GUIDANCE (lived_moments): luxury can show through a spontaneous invitation, an elegant brunch, a rooftop, a beach club, boutique shopping, dinner, a hotel transit moment, or a concert/event." + expandedContext;
  }
  if (tier === "everyday_life") {
    return "TIER GUIDANCE (everyday_life): should read as contrastingly polished, not a generic casual baseline every other day — silk camisole, fitted knit dress, tailored shorts, elegant bodysuit, an open blazer, or after-event styling. luxury_level premium/high_luxury here does NOT require an evening dress or heels — it is expressed through fabric quality, tailoring, grooming and discreet premium accessories in an otherwise casual context." + expandedContext;
  }
  if (tier === "wellness_fitness") {
    return "TIER GUIDANCE (wellness_fitness): keep this genuinely light — a spa lounge, recovery context, premium athleisure, or an elegant post-workout transition. This tier's identity is athletic authenticity, not status display: luxury_level premium/high_luxury is expressed only through fabric quality/fit/grooming/a single discreet accessory, never through evening-wear, heels or a lavish setting." + expandedContext;
  }
  return "";
}

// playful_hot_world_v1 (iteration 5, doplnenie #5) — additive pose_archetype allowed-directions
// text, appended to the base deck only when playfulOn. New phrases beyond the 15 canonical
// families already covered: "stepping forward", "adjusting sunglasses", "mirror-selfie
// confidence", "adjusting a bikini strap", "lifting a hem lightly in motion" (genuinely new
// families — see POSE_ARCHETYPE_PATTERNS below); "turning forward while walking" (new family,
// distinct from the existing "turning back while walking away"); "looking back mid-step" and
// "balcony lean with energy" are folded into the EXISTING walking_away_glance/balcony_lean
// families' own text below, not minted as new patterns (doplnenie #5). "playful side glance" is
// deliberately NOT added here — it already exists as a facial_energy/facial_seduction value
// (an expression/gaze cue, not a body movement).
const PLAYFUL_POSE_ADDENDUM = ", stepping forward with playful momentum, adjusting sunglasses, mirror-selfie confidence, adjusting a bikini strap, lifting a hem lightly in motion, turning forward while walking with energy, looking back mid-step (a variant of turning back while walking away), a more energetic balcony lean with visible motion";

const LUXURY_SEDUCTION_SCHEMA = (tier: StoryTier, playfulOn?: boolean): string => `,
        "luxury_seduction": {
          "luxury_level": "one of: polished | premium | high_luxury. IMPORTANT: premium/high_luxury does NOT automatically mean an evening dress, heels or a lavish setting — in everyday_life/wellness_fitness it is expressed through fabric quality, tailoring, grooming and discreet premium accessories, not formality.",
          "fashion_direction": "the MAIN fashion concept for today — a CONCRETE, visually executable archetype, wider than a repeated mini dress. Allowed directions (inspiration, not a whitelist): structured blazer dress, one-shoulder fitted mini dress, asymmetric cocktail dress, backless satin dress, high-slit fitted midi dress, corset top with pencil skirt, silk blouse with leather mini skirt, fitted bodysuit with tailored trousers, short sequin cocktail dress, sheer-sleeve dress with opaque coverage, tailored shorts with a structured sensual top, fitted jumpsuit, stockings with blazer dress, tights with leather skirt and heels, halter-neck satin evening dress, open-back knit dress, long sheer cover-up over premium swimwear, genuine hotel/private-context loungewear. BANNED — generic labels with no garment named: 'generic mini dress', 'elegant outfit', 'sexy clothing', 'nice look'. sex_appeal_style.outfit_archetype and sensual_visual_language.wardrobe_signal MUST describe the SAME concept as this field, never a different garment. ${luxurySeductionTierGuidance(tier, playfulOn)}",
          "material_language": "name the ACTUAL material, not just an adjective — satin, silk, velvet, fine sheer mesh, structured crepe, leather, metallic knit, sequins, tailored fabric, soft cashmere only as a deliberate contrast. Not every look needs to be shiny, but the material must read as deliberate, not generic 'nice fabric'.",
          "accessory_language": "concrete accessories only — delicate gold jewellery, statement earrings, a thin layered necklace, an elegant watch, a structured clutch or small evening bag, a refined bracelet, a subtle ring stack. No aggressive logo or brand language.",
          "footwear": "situationally concrete — pointed heels, strappy evening sandals, knee-high boots, sleek ankle boots, elegant flats only as a deliberate contrast. Barefoot is permitted ONLY in a logical private/pool/aftermath context (see lib/situationValidation.ts's barefootOnlyInPrivateContext) — never as a default.",
          "pose_archetype": "ONE pose from a rotating deck — seated sideways with crossed legs, leaning lightly against a bar, turning back while walking away, one hand resting on the thigh, adjusting an earring while looking at the photographer, stepping out of a car, standing in a doorway with one hip shifted, rising from a chair, sitting on the edge of a bed or chaise, one knee slightly bent, hand at the waist, leaning over a balcony rail with controlled posture, resting one heel against the chair base, looking over the shoulder while removing a jacket, crossing the room with direct eye contact${playfulOn ? PLAYFUL_POSE_ADDENDUM : ""}. This has a cooldown (lib/situationMemory.ts) — do not repeat the same pose family the recent history already used when a fresh one is plausible for today's activity. Must be compatible with today's activity, outfit, silhouette_focus and shot_intent.",
          "body_geometry": "the geometric line the pose/body should express — elongated leg line, asymmetrical hip line, waist-to-hip curve, open shoulder line, elegant back line, controlled seated thigh visibility, long neck and collarbone line, fitted silhouette with one bent knee. Not just 'show legs' — describe the actual line. Must be renderable in the same shot as sex_appeal_style.silhouette_focus (both must be compatible with visual_execution.shot_intent).",
          "facial_seduction": "confident half-smile, teasing closed-mouth smile, slow knowing gaze, amused eye contact, subtle lip-parted expression, private smile toward someone close, controlled serious seduction, playful side glance. Not every image needs a smile — luxury sexuality can be controlled and more serious. Refines sex_appeal_style.facial_energy above, must never contradict emotional_state.",
          "social_status_signal": "the scene must imply a higher standard of living FROM HER ACTUAL LIFE CIRCUMSTANCE, not a random expensive backdrop — table already reserved, driver waiting, private hotel corridor, rooftop access, premium cocktail service, boutique fitting room, boat deck, hotel suite, spa lounge, valet arrival, private pool area, invitation-only event implication. This must have a CONCRETE VISUAL CORRELATE stated in the same sentence (an object, a gesture, a spatial detail) — a bare declaration like 'reserved table' or 'private access' with nothing else describing what is visible is not enough; it must be something spatial_setup/allowed_props can actually render."
        }`;

// playful_hot_world_v1 (iteration 5) — the 6-field world-energy schema. Every field's text says
// "MUST be exactly" — same dictation phrasing as sexual_energy.level — because these values are
// pre-picked by lib/playfulHotWorldConfig.ts's pickPlayfulHotWorldProfile() BEFORE this call, not
// left to free LLM choice (a static weighted pick alone can't guarantee 14-day aggregate
// floors/ceilings; see lib/situationValidation.ts's playfulHotWorldMatchesDictated for the
// equality-check backstop on vitality_level/social_pulse/seasonality).
const PLAYFUL_HOT_WORLD_SCHEMA = (dictated: PlayfulHotWorldProfile): string => `,
        "playful_hot_world": {
          "mood_temperature": "MUST be exactly \\"${dictated.mood_temperature}\\" — already selected for today by the planner, do not choose a different one",
          "vitality_level": "MUST be exactly \\"${dictated.vitality_level}\\" — already selected for today by the planner, do not choose a different one",
          "social_pulse": "MUST be exactly \\"${dictated.social_pulse}\\" — already selected for today by the planner, do not choose a different one",
          "seasonality": "MUST be exactly \\"${dictated.seasonality}\\" — already selected for today by the planner, do not choose a different one",
          "color_energy": "MUST be exactly \\"${dictated.color_energy}\\" — already selected for today by the planner, do not choose a different one",
          "fun_factor": "MUST be exactly \\"${dictated.fun_factor}\\" — already selected for today by the planner, do not choose a different one"
        }`;

export function situationSchemaBlock(ctx: SituationPlanningContext): string {
  return `"situation": {
        "content_tier": "${ctx.tier}",
        "current_life_context": "one clause — what is going on in her life right now that this moment belongs to",
        "life_domain": "a short domain tag, e.g. 'nightlife_and_social_events', 'beach_pool_water', 'hotels_and_travel', 'home_and_private_life', 'wellness_and_body', 'fashion_and_self_presentation', 'movement_and_transit', 'friendship_and_celebration', 'playful_and_impulsive', 'personal_interests', 'unexpected_everyday' — invent a new one if none fits, this is a tag not a whitelist",
        "continuity_phase": "one of: standalone | setup | event | aftermath",
        "desire_signal": "what SHE wants or decides right now — she is never a passive object placed into a scene",
        "trigger": "one clause — what set this moment in motion",
        "activity": "the concrete thing she is doing",
        "reason": "MANDATORY — why she is doing it. An activity with no reason is not a valid situation",
        "social_context": {
          "mode": "one of: alone | off_camera_person | ambient_public | partial_companion",
          "implication": "one clause — NEVER implies a second sharp/recognizable face in frame"
        },
        "emotional_state": "1 to 4 words",
        "previous_consequence": "OPTIONAL one clause carried from a prior day, or null",
        "next_implication": "OPTIONAL one clause hinting forward, or null",
        "personality_signal": "what this situation shows about her personality, WITHOUT stating a trait word",
        "reality_detail": "ONE concrete physical detail that logically follows from the situation (e.g. damp hair, one shoe by the door, an unopened suitcase, a hotel key card still in hand) — never random decoration",
        "magnetic_hook": "the concrete reason a viewer stops scrolling — NEVER reducible to just 'she is attractive'",
        "magnetism_reason": "one of: ${MAGNETISM_REASONS.join(" | ")}",
        "sexual_energy": {
          "level": "MUST be exactly \\"${ctx.dictatedSexualEnergyLevel}\\" — this level was already selected for today by the planner (tier range + anti-repeat + continuity phase); do not choose a different one",
          "expression": "HOW the energy shows in THIS situation — posture, proximity, gaze, a decision she made — never just a measure of how much skin is visible",
          "boundary": "what stays IG-safe and what is deliberately left out of frame"
        },
        "fanvue_tension": {
          "potential": "one of: none | soft | clear | strong",
          "continuation": "if potential is not 'none': the logical private continuation of THIS SAME event/location/outfit-logic — never an unrelated lingerie/bedroom swap. Otherwise null",
          "withheld_element": "REQUIRED if potential is 'strong': the specific thing Instagram deliberately does not show. Otherwise null"
        },
        "visual_execution": {
          "location": "MUST equal the top-level 'location' field of this response — the same concrete micro-location",
          "time_of_day": "dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp | fluorescent",
          "weather": "short factual atmospheric state (or 'indoor')",
          "action_visible": "the concrete visible action/pose in one clause",
          "shot_intent": "what the shot is trying to capture — one clause"
        },
        "sexual_cliches": ["0 to 2 short snake_case tags for any dominant visual mechanism this situation leans on, e.g. 'mirror_selfie' — omit or leave empty if none apply; invent a new tag if a real mechanism applies but isn't in any known list"]${ctx.includeSensualVisualLanguage ? SENSUAL_VISUAL_LANGUAGE_SCHEMA : ""}${ctx.includeSexAppealStyle ? SEX_APPEAL_STYLE_SCHEMA(ctx.tier) : ""}${ctx.includeLuxurySeduction ? LUXURY_SEDUCTION_SCHEMA(ctx.tier, ctx.includePlayfulHotWorld) : ""}${ctx.includePlayfulHotWorld ? PLAYFUL_HOT_WORLD_SCHEMA(ctx.dictatedPlayfulHotWorld!) : ""}
      }`;
}

// RULE lines + guidance text appended in the OUTPUT FORMAT section, AFTER the scene block (the
// schema itself lives in situationSchemaBlock() above, embedded inside scene). Parallel in
// spirit to lib/lifeState.ts's LIFE_OUTPUT_SPEC (same LLM call, no extra call — see
// lib/storyGeneration.ts).
export function SITUATION_OUTPUT_SPEC(ctx: SituationPlanningContext): string {
  return `RULE: scene.situation.content_tier, scene.situation.visual_execution.location and the top-level 'location' field must all agree — do not describe one place in the situation and render a different one.
RULE: a situation whose only magnetic_hook is "she is attractive" or whose activity has no reason is INVALID — regenerate internally before outputting.
${ctx.sexualEnergyGuidance ? `\n${ctx.sexualEnergyGuidance}` : ""}
${ctx.memoryGuidance ? `\n${ctx.memoryGuidance}` : ""}
${ctx.microEventSpec ? `\n${ctx.microEventSpec}` : ""}
${ctx.playfulHotWorldGuidance ? `\n${ctx.playfulHotWorldGuidance}` : ""}
${ctx.retryNote ? `\nPREVIOUS ATTEMPT REJECTED — fix these specific problems in this attempt: ${ctx.retryNote}` : ""}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Defensive parse — never throws. Returns null for old rows, flag-off days, or a
// structurally incomplete `situation` block (missing the minimum fields downstream
// consumers need). Does NOT run the 15-point validation — that is lib/situationValidation.ts's
// job; this function only answers "is there a situation object shaped enough to read".
export function extractSituation(rawStory: unknown): GenerativeSituation | null {
  if (!isRecord(rawStory)) return null;
  const scene = rawStory.scene;
  if (!isRecord(scene)) return null;
  const situation = scene.situation;
  if (!isRecord(situation)) return null;

  const activity = situation.activity;
  const reason = situation.reason;
  const magneticHook = situation.magnetic_hook;
  const magnetismReason = situation.magnetism_reason;
  const sexualEnergy = situation.sexual_energy;
  const fanvueTension = situation.fanvue_tension;
  const visualExecution = situation.visual_execution;

  if (
    typeof activity !== "string" || !activity ||
    typeof reason !== "string" || !reason ||
    typeof magneticHook !== "string" || !magneticHook ||
    typeof magnetismReason !== "string" ||
    !isRecord(sexualEnergy) || typeof sexualEnergy.level !== "string" ||
    !isRecord(fanvueTension) || typeof fanvueTension.potential !== "string" ||
    !isRecord(visualExecution) || typeof visualExecution.location !== "string"
  ) {
    return null;
  }

  return situation as unknown as GenerativeSituation;
}

// The core "translation" function (spec point 9 / point 1): turns activity/reason/
// social_context/reality_detail/magnetic_hook/sexual_energy.*/fanvue_tension/
// visual_execution.action_visible+shot_intent into body-language/camera-distance/eye-contact/
// pose/outfit-intent/composition/privacy-level/visible-action/shot-boundary prompt text.
// MUST NEVER emit identity/wardrobe-anchor content — that stays exclusively in
// sacredBlock()/CHARACTER VISUAL BRIEF/SOUL ID (lib/slotPrompts.ts) and SUBJECT_ANCHOR
// (app/api/characters/generate-higgsfield/route.ts). Pure; unit-tested directly.
export function translateSituationForSlotPrompt(situation: GenerativeSituation): string {
  const privacyLevel =
    situation.social_context.mode === "alone"
      ? "fully private — she is alone in this moment"
      : situation.social_context.mode === "off_camera_person"
      ? "a private moment with someone present but never rendered in frame"
      : situation.social_context.mode === "partial_companion"
      ? "one companion may appear PARTLY (out of focus, back-to-camera, a hand/shoulder only) — never a second sharp face"
      : "a public/ambient setting — background people may appear blurred and anonymous, never a second sharp face";

  return `SITUATION (today's real context — translate into body language, not into narration or captions):
- What is happening and why: ${situation.activity} — ${situation.reason}
- Personality signal (show, do not caption): ${situation.personality_signal}
- Visible action / pose: ${situation.visual_execution.action_visible}
- Shot intent: ${situation.visual_execution.shot_intent}
- Reality detail (must be physically visible somewhere in this batch, not narrated): ${situation.reality_detail}
- Magnetic hook (the concrete reason to stop scrolling — express visually, never write it as text): ${situation.magnetic_hook}

SEXUAL ENERGY FOR TODAY — level: ${situation.sexual_energy.level}:
- Expression (how it shows physically — posture, proximity to camera, gaze, a garment choice, NOT a measure of skin shown): ${situation.sexual_energy.expression}
- IG-safe boundary (what stays out of frame): ${situation.sexual_energy.boundary}
${situation.sensual_visual_language ? `
SENSUAL VISUAL LANGUAGE (mandatory, concrete — this is what must actually be visible in the frame, not just implied by the energy level above):
- Wardrobe signal (render exactly this garment/cut, not a generic outfit): ${situation.sensual_visual_language.wardrobe_signal}
- Body emphasis (the shot's dominant silhouette element — compose around it): ${situation.sensual_visual_language.body_emphasis}
- Gesture / action (the concrete physical action carrying the sensuality): ${situation.sensual_visual_language.gesture_or_action}
- Camera relationship (distance, angle, eye contact — the relationship with whoever is behind the lens): ${situation.sensual_visual_language.camera_relationship}
- Exposure boundary (exactly what stays IG-safe and out of frame): ${situation.sensual_visual_language.exposure_boundary}
` : ""}${situation.sex_appeal_style ? `
SEX APPEAL STYLE (explicit — outfit archetype, silhouette, expression; must actually appear in the frame, not just be implied):
- Outfit archetype: ${situation.sex_appeal_style.outfit_archetype}
- Silhouette focus: ${situation.sex_appeal_style.silhouette_focus}
- Leg visibility: ${situation.sex_appeal_style.leg_visibility}
- Facial energy: ${situation.sex_appeal_style.facial_energy || "(not required at this sexual-energy level)"}
- Seduction mode: ${situation.sex_appeal_style.seduction_mode}
` : ""}${situation.luxury_seduction ? `
LUXURY SEDUCTION (explicit — the main fashion concept, material, accessories, footwear, pose, body line, expression and status context for today; must actually appear in the frame, not just be implied):
- Luxury level: ${situation.luxury_seduction.luxury_level}
- Fashion direction: ${situation.luxury_seduction.fashion_direction}
- Material language: ${situation.luxury_seduction.material_language}
- Accessory language: ${situation.luxury_seduction.accessory_language}
- Footwear: ${situation.luxury_seduction.footwear}
- Pose archetype: ${situation.luxury_seduction.pose_archetype}
- Body geometry: ${situation.luxury_seduction.body_geometry}
- Facial seduction: ${situation.luxury_seduction.facial_seduction}
- Social status signal: ${situation.luxury_seduction.social_status_signal}
` : ""}${situation.playful_hot_world ? `
PLAYFUL/HOT WORLD (explicit — today's dictated mood/vitality/social-pulse/season/color/fun; must show in the actual scene, not just be implied):
- Mood temperature: ${situation.playful_hot_world.mood_temperature}
- Vitality level: ${situation.playful_hot_world.vitality_level}
- Social pulse: ${situation.playful_hot_world.social_pulse}
- Seasonality: ${situation.playful_hot_world.seasonality}
- Color energy: ${situation.playful_hot_world.color_energy}
- Fun factor: ${situation.playful_hot_world.fun_factor}
` : ""}
PRIVACY / COMPOSITION: ${privacyLevel}. Social implication: ${situation.social_context.implication}

CAMERA + EYE CONTACT: let ${situation.visual_execution.shot_intent} drive camera distance and whether she meets the lens directly or is absorbed in the activity — follow the situation, do not default to a generic pose.`;
}

// Shorter variant for lib/slotPrompts.ts's captionBody() — that path deliberately keeps
// context minimal (see the comment above captionBody()), so this stays 1-2 lines.
export function compactSituationTranslation(situation: GenerativeSituation): string {
  const sensual = situation.sensual_visual_language
    ? ` Wardrobe: ${situation.sensual_visual_language.wardrobe_signal}. Emphasis: ${situation.sensual_visual_language.body_emphasis}. ${situation.sensual_visual_language.gesture_or_action}.`
    : "";
  const sexAppeal = situation.sex_appeal_style
    ? ` Outfit archetype: ${situation.sex_appeal_style.outfit_archetype}. ${situation.sex_appeal_style.facial_energy ? `Expression: ${situation.sex_appeal_style.facial_energy}.` : ""}`
    : "";
  const luxury = situation.luxury_seduction
    ? ` Fashion direction: ${situation.luxury_seduction.fashion_direction}. Pose: ${situation.luxury_seduction.pose_archetype}. Status: ${situation.luxury_seduction.social_status_signal}.`
    : "";
  const playful = situation.playful_hot_world
    ? ` Vibe: ${situation.playful_hot_world.vitality_level}, ${situation.playful_hot_world.social_pulse}, ${situation.playful_hot_world.seasonality}.`
    : "";
  return `SITUATION: ${situation.activity} (${situation.reason}). Sexual energy ${situation.sexual_energy.level} — ${situation.sexual_energy.expression}.${sensual}${sexAppeal}${luxury}${playful} ${situation.social_context.mode === "alone" ? "Alone." : situation.social_context.implication}`;
}

// sex_appeal_style_v1 (iteration 3, doplnenie #1) — normalizes free-text outfit_archetype into
// a small family tag so lib/stylingDeck.ts's selectStylingSourcePool() can actually pick a
// StylingProfile that MATCHES what the situation planner declared, rather than the two staying
// independent (the exact gap a live 14-day run exposed: "satin slip dress" repeating 6/14 days
// because outfit_archetype had no influence on which StylingProfile got selected). Also feeds
// lib/situationMemory.ts's anti-repeat tracking and lib/dailyBatch.ts's performance logging.
// Order matters — more specific patterns are checked before broader ones.
const OUTFIT_FAMILY_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: "bodycon_dress", pattern: /\bbodycon\b/i },
  { family: "sheath_pencil_dress", pattern: /\b(sheath|pencil)\s+dress\b/i },
  // luxury_seduction_v1 (iteration 4) — unique keyword, no collision risk regardless of position.
  { family: "corset_pencil_skirt", pattern: /\bcorset\b/i },
  { family: "slip_dress", pattern: /\bslip\s+dress\b/i },
  { family: "high_slit_dress", pattern: /\bhigh[- ]slit\b/i },
  { family: "cocktail_dress", pattern: /\bcocktail\s+dress\b/i },
  { family: "evening_dress", pattern: /\bevening\s+(dress|top)\b/i },
  { family: "mini_dress", pattern: /\bmini\s+dress\b/i },
  // Requires BOTH "blouse" and "leather" nearby (not just "leather skirt") so "tights with
  // leather skirt and heels" still resolves to stockings_look below, not here.
  { family: "silk_blouse_leather_skirt", pattern: /\bblouse\b.{0,20}\bleather\b|\bleather\b.{0,20}\bblouse\b/i },
  { family: "mini_skirt", pattern: /\bmini[- ]?skirt\b/i },
  // Checked before the generic sheer_top pattern below — "sheer stockings"/"sheer tights" is
  // the SEX_APPEAL_STYLING_PROFILES stockings_enhanced_look profile's own wording, and stockings
  // is the more specific/actionable family tag (a real 14-day run's outfit_archetype text
  // commonly pairs "sheer" with stockings, which would otherwise mis-tag as sheer_top).
  { family: "stockings_look", pattern: /\b(stockings?|tights)\b/i },
  // Moved before sheer_top (iteration 4 fix) — "long sheer cover-up over premium swimwear" was
  // resolving to sheer_top under the old order even though swimwear_coverup is the intended,
  // more specific family for anything naming swimsuit/swimwear/bikini/cover-up.
  { family: "swimwear_coverup", pattern: /\b(swimsuit|swimwear|bikini|cover-?up)\b/i },
  { family: "sheer_top", pattern: /\bsheer\b/i },
  // Must be checked before the generic blazer_bare_legs pattern below, or "structured blazer
  // dress" would resolve to blazer_bare_legs (bare substring match on "blazer").
  { family: "structured_blazer_dress", pattern: /\bblazer\s+dress\b/i },
  { family: "blazer_bare_legs", pattern: /\bblazer\b/i },
  { family: "fitted_bodysuit_trousers", pattern: /\bbodysuit\b.*\btrousers?\b/i },
  { family: "fitted_jumpsuit", pattern: /\bjumpsuit\b/i },
  { family: "open_back_dress", pattern: /\b(open[- ]back|backless)\b/i },
  { family: "activewear", pattern: /\b(sports?\s*bra|leggings|athletic|activewear|dancewear)\b/i },
  { family: "nightlife_top", pattern: /\bnightlife\b/i },
  { family: "camisole_set", pattern: /\bcamisole\b/i },
  { family: "open_shirt_layer", pattern: /\bopen\s+shirt\b/i },
  { family: "shorts_look", pattern: /\bshorts\b/i },
];

export function normalizeOutfitArchetypeFamily(outfitArchetype: string | undefined | null): string | null {
  const text = outfitArchetype?.trim() ?? "";
  if (!text) return null;
  for (const { family, pattern } of OUTFIT_FAMILY_PATTERNS) {
    if (pattern.test(text)) return family;
  }
  return null;
}

// playful_hot_world_v1 (iteration 5, doplnenie #4) — a mäkký (soft) nudge only, never a hard
// block: one day cannot verify a 14-day aggregate outfit-mix quota. Maps each of the 23 existing
// outfit_family tags (verified 1:1 against lib/stylingDeck.ts's outfit_family values and
// OUTFIT_FAMILY_PATTERNS above) into one of the 5 spec buckets. Two entries are genuinely
// low-confidence and documented rather than silently guessed:
// - sheath_pencil_dress: doesn't cleanly fit any bucket (daytime tailored/office-polish, not
//   evening-sexy, not casual-sexy in the crop-top/shorts sense) — defaults to casual_sexy.
// - high_slit_dress: the family conflates two materially different deck entries (a casual daytime
//   slit dress vs. an intimate/luxe evening slit dress) — defaults to social_evening. Splitting
//   the tag is explicitly out of scope for this iteration (see plan's "Neriešiť").
export type OutfitCategory = "social_evening" | "casual_sexy" | "swim_pool" | "body_confidence_active" | "intimate_private";

const OUTFIT_CATEGORY_MAP: Record<string, OutfitCategory> = {
  mini_skirt: "casual_sexy",
  shorts_look: "casual_sexy",
  fitted_bodysuit_trousers: "casual_sexy",
  mini_dress: "casual_sexy",
  open_shirt_layer: "casual_sexy",
  sheath_pencil_dress: "casual_sexy", // low confidence, see comment above
  swimwear_coverup: "swim_pool",
  activewear: "body_confidence_active",
  slip_dress: "intimate_private",
  stockings_look: "intimate_private",
  camisole_set: "intimate_private",
  sheer_top: "intimate_private",
  blazer_bare_legs: "social_evening",
  evening_dress: "social_evening",
  bodycon_dress: "social_evening",
  cocktail_dress: "social_evening",
  nightlife_top: "social_evening",
  structured_blazer_dress: "social_evening",
  corset_pencil_skirt: "social_evening",
  silk_blouse_leather_skirt: "social_evening",
  fitted_jumpsuit: "social_evening",
  open_back_dress: "social_evening",
  high_slit_dress: "social_evening", // low confidence, see comment above
};

export function classifyOutfitCategory(family: string | null | undefined): OutfitCategory | null {
  if (!family) return null;
  return OUTFIT_CATEGORY_MAP[family] ?? null;
}

// playful_hot_world_v1 (iteration 5, doplnenie #3, schválené sprísnenie) — strict, multi-signal
// "sad beige girl indoors" detector. Deliberately does NOT fire on every interior (a legitimate
// wellness_fitness gym day, or an intentionally cozy but otherwise fine scene, must not trip
// this) — requires ALL of: calm vitality, private social pulse, AND (muted color energy OR an
// explicit beige/quiet/static text correlate), AND the location/activity reading as indoor/home/
// hotel-room rather than pool/beach/rooftop/terrace/street even when visual_execution.weather
// says "indoor". Exported (along with the two location patterns) so both
// lib/situationValidation.ts's hard-cap check AND lib/situationMemory.ts's rolling-window
// snapshot can share one definition — living here, not in situationValidation.ts, avoids a
// situationMemory.ts <-> situationValidation.ts import cycle (situationValidation.ts already
// imports WeeklyBalanceNudges FROM situationMemory.ts).
const QUIET_INDOOR_TEXT_PATTERN = /\b(beige|cream interior|quiet room|sitting alone|soft morning indoors|neutral lounge|static private scene)\b/i;
export const INDOOR_HOME_CONTEXT_PATTERN = /\b(apartment|bedroom|bathroom|living room|kitchen|hotel room|indoor|home)\b/i;
export const OUTDOOR_OR_SOCIAL_LOCATION_PATTERN = /\b(pool|beach|rooftop|terrace|balcony|street|promenade|club|bar|restaurant|deck|garden|park)\b/i;
export function isQuietIndoorBeigeDay(situation: GenerativeSituation): boolean {
  const phw = situation.playful_hot_world;
  if (!phw) return false;
  if (phw.vitality_level !== "calm" || phw.social_pulse !== "private") return false;
  const text = `${situation.activity ?? ""} ${situation.reality_detail ?? ""} ${situation.visual_execution?.location ?? ""} ${situation.luxury_seduction?.social_status_signal ?? ""}`;
  const hasColorOrTextCorrelate = phw.color_energy === "muted" || QUIET_INDOOR_TEXT_PATTERN.test(text);
  if (!hasColorOrTextCorrelate) return false;
  const locationContext = `${situation.activity ?? ""} ${situation.visual_execution?.location ?? ""}`;
  if (OUTDOOR_OR_SOCIAL_LOCATION_PATTERN.test(locationContext)) return false;
  return INDOOR_HOME_CONTEXT_PATTERN.test(locationContext);
}

// luxury_seduction_v1 (iteration 4) — same normalization pattern as normalizeOutfitArchetypeFamily,
// applied to pose_archetype instead of a garment: free text → one of the 15 canonical pose
// families. Feeds lib/situationMemory.ts's anti-repeat tracking and lib/situationValidation.ts's
// hard poseArchetypeFamilyNotOverused/poseArchetypeRendersInShot blocking checks. No collisions
// between these 15 patterns (verified — each keys off a distinct, non-overlapping keyword/phrase).
const POSE_ARCHETYPE_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: "seated_crossed_legs", pattern: /\b(seated|sitting)\b.{0,25}\bcrossed\s+legs?\b|\bcrossed\s+legs?\b|\blegs?\s+crossed\b/i },
  { family: "leaning_bar", pattern: /\blean(ing)?\b.{0,20}\bagainst\s+(a\s+|the\s+)?bar\b/i },
  { family: "walking_away_glance", pattern: /\b(turning\s+back|glanc\w*\s+back).{0,25}walk\w*\s+away\b|\bwalking\s+away\b/i },
  { family: "hand_on_thigh", pattern: /\bhand\b.{0,15}(resting\s+)?on\s+(her\s+)?thigh\b/i },
  { family: "adjusting_earring", pattern: /\badjusting\s+(an?\s+)?earring\b/i },
  { family: "stepping_from_car", pattern: /\bstepping\s+out\s+of\s+(a\s+)?car\b/i },
  { family: "doorway_hip_shift", pattern: /\bdoorway\b.{0,20}\bhip\b|\bshifted\s+hip\b/i },
  { family: "rising_from_chair", pattern: /\brising\s+from\s+(a\s+)?chair\b/i },
  { family: "seated_chaise_edge", pattern: /\b(chaise|bed)[- ]?edge\b|\bsitting\s+on\s+(the\s+)?(chaise|edge\s+of\s+the\s+bed)\b/i },
  { family: "one_knee_bent", pattern: /\bone\s+knee\b.{0,15}\bbent\b/i },
  { family: "hand_at_waist", pattern: /\bhand\s+at\s+(her\s+)?waist\b/i },
  { family: "balcony_lean", pattern: /\bbalcony\b/i },
  { family: "heel_against_chair", pattern: /\bheel\b.{0,20}\bchair\b/i },
  { family: "over_shoulder_jacket_removal", pattern: /\bremoving\s+(a\s+)?jacket\b|\bover[- ](the[- ])?shoulder\b.{0,25}\bjacket\b/i },
  { family: "crossing_room_eye_contact", pattern: /\bcrossing\s+(the\s+)?room\b/i },
  // playful_hot_world_v1 (iteration 5, doplnenie #5) — genuinely new families, verified against
  // all 15 patterns above for collisions. "turning_forward_walking" is deliberately checked AFTER
  // walking_away_glance and requires the literal word "forward" so it can never steal a match
  // from "turning back while walking away" (which has no "forward" anywhere in it).
  { family: "stepping_forward", pattern: /\bstepping\s+forward\b/i },
  { family: "adjusting_sunglasses", pattern: /\badjusting\s+(her\s+)?sunglasses\b/i },
  { family: "mirror_selfie_confidence", pattern: /\bmirror[- ]selfie\b/i },
  { family: "adjusting_bikini_strap", pattern: /\badjusting\s+(a\s+|her\s+)?bikini\s+strap\b/i },
  { family: "lifting_hem_in_motion", pattern: /\blifting\s+(a\s+|her\s+)?hem\b/i },
  { family: "turning_forward_walking", pattern: /\bturning\s+forward\b.{0,20}\bwalking\b|\bwalking\b.{0,20}\bturning\s+forward\b/i },
];

export function normalizePoseArchetype(poseArchetype: string | undefined | null): string | null {
  const text = poseArchetype?.trim() ?? "";
  if (!text) return null;
  for (const { family, pattern } of POSE_ARCHETYPE_PATTERNS) {
    if (pattern.test(text)) return family;
  }
  return null;
}

// Pose families whose framing/logic naturally implies arrival, departure, or a deliberate
// decision to continue — used by lib/situationValidation.ts's luxeCarRequiresNightlifeStyling to
// check the day's pose_archetype fits luxe_car's arrival/departure requirement.
export const LUXE_CAR_TRANSITION_POSE_FAMILIES = [
  "stepping_from_car",
  "doorway_hip_shift",
  "walking_away_glance",
  "over_shoulder_jacket_removal",
  "rising_from_chair",
  "crossing_room_eye_contact",
];

// luxury_seduction_v1 (iteration 4, doplnenie #12) — pure "situation → scene-brief prose"
// builder, replacing the inline template literal that used to live in lib/dailyBatch.ts. Same
// base as before (activity/reason/action_visible); when luxury_seduction.social_status_signal is
// present, appends it with an explicit instruction that it must be visually grounded in
// spatial_setup/allowed_props, not just declared as text — the mechanism that lets a status
// signal like "reserved table" actually have a chance to reach the scene brief's structured
// output. lib/sceneBrief.ts itself is untouched; only this string, fed as its situationContext arg.
export function situationContextForSceneBrief(situation: GenerativeSituation): string {
  const base = `${situation.activity} — ${situation.reason}. ${situation.visual_execution.action_visible}`;
  if (!situation.luxury_seduction?.social_status_signal) return base;
  return `${base} Status context (must be visually grounded in spatial_setup/allowed_props, not just declared): ${situation.luxury_seduction.social_status_signal}.`;
}
