import { describe, it, expect } from "vitest";
import { extractSituation, translateSituationForSlotPrompt, compactSituationTranslation, situationContextForSceneBrief, SITUATION_OUTPUT_SPEC, situationSchemaBlock, normalizeOutfitArchetypeFamily, normalizePoseArchetype, classifyOutfitCategory, isQuietIndoorBeigeDay, GenerativeSituation, SensualVisualLanguage, SexAppealStyle, LuxurySeduction } from "./situationPlanner";
import type { PlayfulHotWorldProfile } from "./playfulHotWorldConfig";

function sensualFixture(): SensualVisualLanguage {
  return {
    wardrobe_signal: "a fitted mini dress with thin straps, hem sitting mid-thigh",
    body_emphasis: "legs",
    gesture_or_action: "crossing her legs as she leans back against the counter",
    camera_relationship: "close private-camera distance, direct knowing eye contact",
    exposure_boundary: "nothing above mid-thigh, no cleavage in frame",
  };
}

function sexAppealFixture(): SexAppealStyle {
  return {
    outfit_archetype: "a fitted bodycon mini dress, hem mid-thigh",
    silhouette_focus: "legs",
    leg_visibility: "fully visible, bare",
    facial_energy: "a teasing half-smile, direct eye contact",
    seduction_mode: "playful tease",
  };
}

function luxuryFixture(): LuxurySeduction {
  return {
    luxury_level: "premium",
    fashion_direction: "a fitted bodycon mini dress in a metallic knit",
    material_language: "metallic knit, structured crepe lining",
    accessory_language: "statement earrings, a structured clutch",
    footwear: "pointed heels",
    pose_archetype: "seated sideways with crossed legs",
    body_geometry: "elongated leg line, waist-to-hip curve",
    facial_seduction: "a confident half-smile",
    social_status_signal: "a reserved table with a place card and a waiting glass of champagne",
  };
}

function playfulFixture(): PlayfulHotWorldProfile {
  return {
    mood_temperature: "warm",
    vitality_level: "alive",
    social_pulse: "suggested_social",
    seasonality: "summer",
    color_energy: "fresh",
    fun_factor: "medium",
  };
}

function fixtureSituation(): GenerativeSituation {
  return {
    content_tier: "lived_moments",
    current_life_context: "she just landed after a short trip",
    life_domain: "hotels_and_travel",
    continuity_phase: "aftermath",
    desire_signal: "she wants a slow re-entry into her own space",
    trigger: "the flight landed early",
    activity: "unpacking by the window",
    reason: "she wants everything put away before unwinding",
    social_context: { mode: "alone", implication: "she is alone" },
    emotional_state: "unhurried",
    previous_consequence: null,
    next_implication: null,
    personality_signal: "she likes closing a loop before starting the next one",
    reality_detail: "one suitcase still half-open on the floor",
    magnetic_hook: "the private ordinariness of a morning after a trip",
    magnetism_reason: "private_access",
    sexual_energy: { level: "warm", expression: "an oversized shirt slipping off one shoulder as she leans over the case", boundary: "nothing below the waist visible" },
    fanvue_tension: { potential: "soft", continuation: "the rest of the suitcase unpacking", withheld_element: null },
    visual_execution: { location: "her bedroom by the window", time_of_day: "morning", weather: "indoor", action_visible: "leaning over an open suitcase", shot_intent: "candid, caught mid-task" },
  };
}

describe("extractSituation", () => {
  it("returns null for a story object with no scene at all (old row / flag-off day)", () => {
    expect(extractSituation({ location: "x" })).toBeNull();
  });

  it("returns null for a scene with no situation key", () => {
    expect(extractSituation({ scene: { time_of_day: "morning" } })).toBeNull();
  });

  it("returns null for a structurally incomplete situation (missing required fields), without throwing", () => {
    expect(() => extractSituation({ scene: { situation: { activity: "x" } } })).not.toThrow();
    expect(extractSituation({ scene: { situation: { activity: "x" } } })).toBeNull();
  });

  it("returns null for non-object input without throwing", () => {
    expect(extractSituation(null)).toBeNull();
    expect(extractSituation(undefined)).toBeNull();
    expect(extractSituation("a string")).toBeNull();
  });

  it("round-trips a structurally complete situation", () => {
    const situation = fixtureSituation();
    const extracted = extractSituation({ location: "her bedroom by the window", scene: { situation } });
    expect(extracted).not.toBeNull();
    expect(extracted?.activity).toBe(situation.activity);
    expect(extracted?.magnetism_reason).toBe("private_access");
  });
});

describe("translateSituationForSlotPrompt", () => {
  it("includes activity, sexual-energy expression, and visual_execution action/shot_intent", () => {
    const situation = fixtureSituation();
    const text = translateSituationForSlotPrompt(situation);
    expect(text).toContain(situation.activity);
    expect(text).toContain(situation.sexual_energy.expression);
    expect(text).toContain(situation.visual_execution.action_visible);
    expect(text).toContain(situation.visual_execution.shot_intent);
  });

  it("describes privacy/composition from social_context.mode without a second sharp face", () => {
    const alone = translateSituationForSlotPrompt(fixtureSituation());
    expect(alone).toMatch(/alone/i);

    const partial = translateSituationForSlotPrompt({
      ...fixtureSituation(),
      social_context: { mode: "partial_companion", implication: "a friend's hand in frame" },
    });
    expect(partial).toMatch(/never a second sharp face/i);
  });

  it("never emits identity/wardrobe-anchor language — that stays exclusively in sacredBlock/CHARACTER VISUAL BRIEF", () => {
    const text = translateSituationForSlotPrompt(fixtureSituation());
    expect(text).not.toMatch(/sacred_details|wardrobe_anchors|soul_id|visual_brief/i);
  });
});

describe("compactSituationTranslation", () => {
  it("is short (1-2 lines) and still carries activity + energy level", () => {
    const text = compactSituationTranslation(fixtureSituation());
    expect(text.split("\n").length).toBeLessThanOrEqual(2);
    expect(text).toContain("warm");
  });

  it("includes wardrobe/body/gesture when sensual_visual_language is present", () => {
    const situation = { ...fixtureSituation(), sensual_visual_language: sensualFixture() };
    const text = compactSituationTranslation(situation);
    expect(text).toContain(sensualFixture().wardrobe_signal);
    expect(text).toContain(sensualFixture().body_emphasis);
  });
});

// sensual_visual_language_v1 (iteration 2)
describe("translateSituationForSlotPrompt — sensual_visual_language", () => {
  it("includes all 5 sensual fields when present", () => {
    const situation = { ...fixtureSituation(), sensual_visual_language: sensualFixture() };
    const text = translateSituationForSlotPrompt(situation);
    const s = sensualFixture();
    expect(text).toContain(s.wardrobe_signal);
    expect(text).toContain(s.body_emphasis);
    expect(text).toContain(s.gesture_or_action);
    expect(text).toContain(s.camera_relationship);
    expect(text).toContain(s.exposure_boundary);
  });

  it("omits the sensual block entirely when sensual_visual_language is undefined (flag-off no-op)", () => {
    const text = translateSituationForSlotPrompt(fixtureSituation());
    expect(text).not.toMatch(/SENSUAL VISUAL LANGUAGE/);
  });
});

describe("situationSchemaBlock", () => {
  it("is a 'situation' key fragment meant to be embedded INSIDE the scene JSON block, not a top-level bullet", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful" });
    expect(block.trimStart().startsWith('"situation":')).toBe(true);
    expect(block).not.toMatch(/^- situation:/);
  });

  it("embeds the dictated sexual-energy level", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful" });
    expect(block).toContain("playful");
  });

  it("omits sensual_visual_language schema by default (iteration-1 byte-identical baseline)", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful" });
    expect(block).not.toMatch(/sensual_visual_language/);
  });

  it("includes sensual_visual_language schema with the allowed-directions list and generic-phrase ban when includeSensualVisualLanguage", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful", includeSensualVisualLanguage: true });
    expect(block).toMatch(/sensual_visual_language/);
    expect(block).toMatch(/wardrobe_signal/);
    expect(block).toMatch(/body_emphasis/);
    expect(block).toMatch(/gesture_or_action/);
    expect(block).toMatch(/camera_relationship/);
    expect(block).toMatch(/exposure_boundary/);
    expect(block).toMatch(/BANNED/);
  });
});

describe("SITUATION_OUTPUT_SPEC", () => {
  it("carries the tier's guidance text (RULE/guidance lines appended after the scene block)", () => {
    const spec = SITUATION_OUTPUT_SPEC({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful", sexualEnergyGuidance: "RANGE GUIDANCE MARKER" });
    expect(spec).toContain("RANGE GUIDANCE MARKER");
    expect(spec).toMatch(/RULE:/);
  });

  it("includes the retry note only when provided", () => {
    const withoutRetry = SITUATION_OUTPUT_SPEC({ tier: "lived_moments", dictatedSexualEnergyLevel: "warm" });
    expect(withoutRetry).not.toMatch(/PREVIOUS ATTEMPT REJECTED/);
    const withRetry = SITUATION_OUTPUT_SPEC({ tier: "lived_moments", dictatedSexualEnergyLevel: "warm", retryNote: "reason X, reason Y" });
    expect(withRetry).toMatch(/PREVIOUS ATTEMPT REJECTED/);
    expect(withRetry).toContain("reason X, reason Y");
  });
});

// sex_appeal_style_v1 (iteration 3)
describe("translateSituationForSlotPrompt — sex_appeal_style", () => {
  it("includes all 5 sex_appeal_style fields when present", () => {
    const situation = { ...fixtureSituation(), sex_appeal_style: sexAppealFixture() };
    const text = translateSituationForSlotPrompt(situation);
    const s = sexAppealFixture();
    expect(text).toContain(s.outfit_archetype);
    expect(text).toContain(s.silhouette_focus);
    expect(text).toContain(s.leg_visibility);
    expect(text).toContain(s.facial_energy);
    expect(text).toContain(s.seduction_mode);
  });

  it("omits the sex appeal style block entirely when sex_appeal_style is undefined (flag-off no-op)", () => {
    const text = translateSituationForSlotPrompt(fixtureSituation());
    expect(text).not.toMatch(/SEX APPEAL STYLE/);
  });
});

describe("compactSituationTranslation — sex_appeal_style", () => {
  it("includes outfit_archetype and facial_energy when sex_appeal_style is present", () => {
    const situation = { ...fixtureSituation(), sex_appeal_style: sexAppealFixture() };
    const text = compactSituationTranslation(situation);
    expect(text).toContain(sexAppealFixture().outfit_archetype);
    expect(text).toContain(sexAppealFixture().facial_energy);
  });
});

describe("situationSchemaBlock — sex_appeal_style", () => {
  it("omits sex_appeal_style schema by default (flag-off byte-identical baseline)", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful" });
    expect(block).not.toMatch(/sex_appeal_style/);
  });

  it("includes sex_appeal_style schema with all 5 fields and the generic-phrase ban when includeSexAppealStyle", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful", includeSexAppealStyle: true });
    expect(block).toMatch(/sex_appeal_style/);
    expect(block).toMatch(/outfit_archetype/);
    expect(block).toMatch(/silhouette_focus/);
    expect(block).toMatch(/leg_visibility/);
    expect(block).toMatch(/facial_energy/);
    expect(block).toMatch(/seduction_mode/);
    expect(block).toMatch(/BANNED/);
  });

  it("includes a homewear/robe/pyjama ban for luxe_car", () => {
    const block = situationSchemaBlock({ tier: "luxe_car", dictatedSexualEnergyLevel: "provocative", includeSexAppealStyle: true });
    expect(block).toMatch(/pyjama/i);
    expect(block).toMatch(/robe/i);
  });

  it("includes a pure-gym ban for intimate_aesthetic", () => {
    const block = situationSchemaBlock({ tier: "intimate_aesthetic", dictatedSexualEnergyLevel: "intimate", includeSexAppealStyle: true });
    expect(block).toMatch(/pure gym/i);
  });
});

describe("normalizeOutfitArchetypeFamily", () => {
  it("returns null for empty/missing input", () => {
    expect(normalizeOutfitArchetypeFamily(undefined)).toBeNull();
    expect(normalizeOutfitArchetypeFamily(null)).toBeNull();
    expect(normalizeOutfitArchetypeFamily("")).toBeNull();
  });

  it("returns null for an unrecognized phrase", () => {
    expect(normalizeOutfitArchetypeFamily("a completely unrelated description with no garment word")).toBeNull();
  });

  const cases: Array<[string, string]> = [
    ["a fitted bodycon mini dress", "bodycon_dress"],
    ["a fitted sheath dress", "sheath_pencil_dress"],
    ["a satin slip dress", "slip_dress"],
    ["a high-slit evening gown", "high_slit_dress"],
    ["a short cocktail dress", "cocktail_dress"],
    ["a fitted evening top", "evening_dress"],
    ["a fitted mini dress", "mini_dress"],
    ["a fitted mini skirt", "mini_skirt"],
    ["a semi-sheer blouse", "sheer_top"],
    ["a blazer with bare legs", "blazer_bare_legs"],
    ["sheer black thigh-high stockings", "stockings_look"],
    ["a sports bra with leggings", "activewear"],
    ["a swimsuit with an open cover-up", "swimwear_coverup"],
    ["a sleek nightlife outfit", "nightlife_top"],
    ["a fitted satin camisole", "camisole_set"],
    ["an open shirt over a fitted top", "open_shirt_layer"],
    ["fitted denim shorts", "shorts_look"],
  ];
  it.each(cases)("normalizes %s to %s", (phrase, expected) => {
    expect(normalizeOutfitArchetypeFamily(phrase)).toBe(expected);
  });

  // luxury_seduction_v1 (iteration 4) — regression cases for 3 real ordering collisions found
  // while widening the pattern table, plus the 6 genuinely new families.
  const iteration4Cases: Array<[string, string]> = [
    ["a structured blazer dress", "structured_blazer_dress"],
    ["a long sheer cover-up over premium swimwear", "swimwear_coverup"],
    ["stockings with blazer dress", "stockings_look"],
    ["tights with leather skirt and heels", "stockings_look"],
    ["corset top with pencil skirt", "corset_pencil_skirt"],
    ["silk blouse with leather mini skirt", "silk_blouse_leather_skirt"],
    ["fitted bodysuit with tailored trousers", "fitted_bodysuit_trousers"],
    ["a fitted jumpsuit", "fitted_jumpsuit"],
    ["an open-back knit dress", "open_back_dress"],
    ["a backless satin dress", "open_back_dress"],
    ["a short sequin cocktail dress", "cocktail_dress"],
    ["a halter-neck satin evening dress", "evening_dress"],
  ];
  it.each(iteration4Cases)("normalizes %s to %s (iteration 4)", (phrase, expected) => {
    expect(normalizeOutfitArchetypeFamily(phrase)).toBe(expected);
  });
});

// luxury_seduction_v1 (iteration 4)
describe("normalizePoseArchetype", () => {
  it("returns null for empty/missing/unrecognized input", () => {
    expect(normalizePoseArchetype(undefined)).toBeNull();
    expect(normalizePoseArchetype(null)).toBeNull();
    expect(normalizePoseArchetype("")).toBeNull();
    expect(normalizePoseArchetype("a completely unrelated description")).toBeNull();
  });

  const poseCases: Array<[string, string]> = [
    ["seated sideways with her legs crossed", "seated_crossed_legs"],
    ["leaning lightly against the bar", "leaning_bar"],
    ["turning back while walking away", "walking_away_glance"],
    ["one hand resting on her thigh", "hand_on_thigh"],
    ["adjusting an earring while looking at the photographer", "adjusting_earring"],
    ["stepping out of a car", "stepping_from_car"],
    ["standing in a doorway with one hip shifted", "doorway_hip_shift"],
    ["rising from a chair", "rising_from_chair"],
    ["sitting on the edge of the bed", "seated_chaise_edge"],
    ["one knee slightly bent", "one_knee_bent"],
    ["hand at her waist", "hand_at_waist"],
    ["leaning over a balcony rail with controlled posture", "balcony_lean"],
    ["resting one heel against the chair base", "heel_against_chair"],
    ["looking over the shoulder while removing a jacket", "over_shoulder_jacket_removal"],
    ["crossing the room with direct eye contact", "crossing_room_eye_contact"],
  ];
  it.each(poseCases)("normalizes %s to %s", (phrase, expected) => {
    expect(normalizePoseArchetype(phrase)).toBe(expected);
  });
});

describe("translateSituationForSlotPrompt — luxury_seduction", () => {
  it("includes all 9 luxury_seduction fields when present", () => {
    const situation = { ...fixtureSituation(), luxury_seduction: luxuryFixture() };
    const text = translateSituationForSlotPrompt(situation);
    const l = luxuryFixture();
    expect(text).toContain(l.luxury_level);
    expect(text).toContain(l.fashion_direction);
    expect(text).toContain(l.material_language);
    expect(text).toContain(l.accessory_language);
    expect(text).toContain(l.footwear);
    expect(text).toContain(l.pose_archetype);
    expect(text).toContain(l.body_geometry);
    expect(text).toContain(l.facial_seduction);
    expect(text).toContain(l.social_status_signal);
  });

  it("omits the luxury seduction block entirely when luxury_seduction is undefined (flag-off no-op)", () => {
    const text = translateSituationForSlotPrompt(fixtureSituation());
    expect(text).not.toMatch(/LUXURY SEDUCTION/);
  });
});

describe("compactSituationTranslation — luxury_seduction", () => {
  it("includes fashion_direction, pose_archetype and social_status_signal when luxury_seduction is present", () => {
    const situation = { ...fixtureSituation(), luxury_seduction: luxuryFixture() };
    const text = compactSituationTranslation(situation);
    expect(text).toContain(luxuryFixture().fashion_direction);
    expect(text).toContain(luxuryFixture().pose_archetype);
    expect(text).toContain(luxuryFixture().social_status_signal);
  });
});

describe("situationSchemaBlock — luxury_seduction", () => {
  it("omits luxury_seduction schema by default (flag-off byte-identical baseline)", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful" });
    expect(block).not.toMatch(/luxury_seduction/);
  });

  it("includes luxury_seduction schema with all 9 fields and the generic-phrase ban when includeLuxurySeduction", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful", includeLuxurySeduction: true });
    expect(block).toMatch(/luxury_seduction/);
    expect(block).toMatch(/luxury_level/);
    expect(block).toMatch(/fashion_direction/);
    expect(block).toMatch(/material_language/);
    expect(block).toMatch(/accessory_language/);
    expect(block).toMatch(/footwear/);
    expect(block).toMatch(/pose_archetype/);
    expect(block).toMatch(/body_geometry/);
    expect(block).toMatch(/facial_seduction/);
    expect(block).toMatch(/social_status_signal/);
    expect(block).toMatch(/BANNED/);
  });

  it("includes a positive nightlife/event styling requirement for luxe_car", () => {
    const block = situationSchemaBlock({ tier: "luxe_car", dictatedSexualEnergyLevel: "provocative", includeLuxurySeduction: true });
    expect(block).toMatch(/nightlife\/event/i);
  });

  it("includes a 'luxury does not require evening wear' clarification for everyday_life and wellness_fitness", () => {
    const everyday = situationSchemaBlock({ tier: "everyday_life", dictatedSexualEnergyLevel: "warm", includeLuxurySeduction: true });
    expect(everyday).toMatch(/does NOT require an evening dress or heels/i);
    const wellness = situationSchemaBlock({ tier: "wellness_fitness", dictatedSexualEnergyLevel: "warm", includeLuxurySeduction: true });
    expect(wellness).toMatch(/never through evening-wear/i);
  });
});

describe("situationContextForSceneBrief", () => {
  it("matches the original activity/reason/action_visible shape when no luxury_seduction is present (regression baseline)", () => {
    const situation = fixtureSituation();
    const text = situationContextForSceneBrief(situation);
    expect(text).toBe(`${situation.activity} — ${situation.reason}. ${situation.visual_execution.action_visible}`);
  });

  it("appends social_status_signal with a visually-grounded instruction when luxury_seduction is present", () => {
    const situation = { ...fixtureSituation(), luxury_seduction: luxuryFixture() };
    const text = situationContextForSceneBrief(situation);
    expect(text).toContain(luxuryFixture().social_status_signal);
    expect(text).toMatch(/visually grounded/i);
  });
});

// playful_hot_world_v1 (iteration 5)
describe("translateSituationForSlotPrompt — playful_hot_world", () => {
  it("includes all 6 playful_hot_world fields when present", () => {
    const situation = { ...fixtureSituation(), playful_hot_world: playfulFixture() };
    const text = translateSituationForSlotPrompt(situation);
    const p = playfulFixture();
    expect(text).toContain(p.mood_temperature);
    expect(text).toContain(p.vitality_level);
    expect(text).toContain(p.social_pulse);
    expect(text).toContain(p.seasonality);
    expect(text).toContain(p.color_energy);
    expect(text).toContain(p.fun_factor);
  });

  it("omits the playful/hot world block entirely when playful_hot_world is undefined (flag-off no-op)", () => {
    const text = translateSituationForSlotPrompt(fixtureSituation());
    expect(text).not.toMatch(/PLAYFUL\/HOT WORLD/);
  });
});

describe("compactSituationTranslation — playful_hot_world", () => {
  it("includes vitality_level, social_pulse and seasonality when playful_hot_world is present", () => {
    const situation = { ...fixtureSituation(), playful_hot_world: playfulFixture() };
    const text = compactSituationTranslation(situation);
    expect(text).toContain(playfulFixture().vitality_level);
    expect(text).toContain(playfulFixture().social_pulse);
    expect(text).toContain(playfulFixture().seasonality);
  });
});

describe("situationSchemaBlock — playful_hot_world", () => {
  it("omits playful_hot_world schema by default (flag-off byte-identical baseline)", () => {
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful" });
    expect(block).not.toMatch(/playful_hot_world/);
  });

  it("includes playful_hot_world schema with all 6 fields, each dictated as MUST be exactly, when includePlayfulHotWorld", () => {
    const dictated = playfulFixture();
    const block = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful", includePlayfulHotWorld: true, dictatedPlayfulHotWorld: dictated });
    expect(block).toMatch(/playful_hot_world/);
    expect(block).toMatch(new RegExp(`MUST be exactly \\\\"${dictated.mood_temperature}\\\\"`));
    expect(block).toMatch(new RegExp(`MUST be exactly \\\\"${dictated.vitality_level}\\\\"`));
    expect(block).toMatch(new RegExp(`MUST be exactly \\\\"${dictated.social_pulse}\\\\"`));
    expect(block).toMatch(new RegExp(`MUST be exactly \\\\"${dictated.seasonality}\\\\"`));
    expect(block).toMatch(new RegExp(`MUST be exactly \\\\"${dictated.color_energy}\\\\"`));
    expect(block).toMatch(new RegExp(`MUST be exactly \\\\"${dictated.fun_factor}\\\\"`));
  });

  it("does not change LUXURY_SEDUCTION_SCHEMA output when includePlayfulHotWorld is omitted/false (regression baseline for iteration 4 alone)", () => {
    const withoutFlag = situationSchemaBlock({ tier: "luxe_car", dictatedSexualEnergyLevel: "provocative", includeLuxurySeduction: true });
    const withFalseFlag = situationSchemaBlock({ tier: "luxe_car", dictatedSexualEnergyLevel: "provocative", includeLuxurySeduction: true, includePlayfulHotWorld: false });
    expect(withFalseFlag).toBe(withoutFlag);
    expect(withoutFlag).not.toMatch(/beach club/i);
  });

  it("expands the luxury preferred-context list (rooftop/beach club/etc) only when includePlayfulHotWorld is true", () => {
    const dictated = playfulFixture();
    const withFlag = situationSchemaBlock({ tier: "luxe_car", dictatedSexualEnergyLevel: "provocative", includeLuxurySeduction: true, includePlayfulHotWorld: true, dictatedPlayfulHotWorld: dictated });
    expect(withFlag).toMatch(/beach club/i);
    expect(withFlag).toMatch(/rooftop/i);
  });

  it("extends the pose_archetype allowed-directions text with playful poses only when includePlayfulHotWorld is true", () => {
    const dictated = playfulFixture();
    const withFlag = situationSchemaBlock({ tier: "lived_moments", dictatedSexualEnergyLevel: "playful", includeLuxurySeduction: true, includePlayfulHotWorld: true, dictatedPlayfulHotWorld: dictated });
    expect(withFlag).toMatch(/mirror-selfie confidence/i);
    expect(withFlag).toMatch(/adjusting a bikini strap/i);
  });
});

describe("classifyOutfitCategory", () => {
  it("returns null for missing/unknown family", () => {
    expect(classifyOutfitCategory(null)).toBeNull();
    expect(classifyOutfitCategory(undefined)).toBeNull();
    expect(classifyOutfitCategory("not_a_real_family")).toBeNull();
  });

  const cases: Array<[string, string]> = [
    ["mini_skirt", "casual_sexy"],
    ["shorts_look", "casual_sexy"],
    ["fitted_bodysuit_trousers", "casual_sexy"],
    ["mini_dress", "casual_sexy"],
    ["open_shirt_layer", "casual_sexy"],
    ["sheath_pencil_dress", "casual_sexy"],
    ["swimwear_coverup", "swim_pool"],
    ["activewear", "body_confidence_active"],
    ["slip_dress", "intimate_private"],
    ["stockings_look", "intimate_private"],
    ["camisole_set", "intimate_private"],
    ["sheer_top", "intimate_private"],
    ["blazer_bare_legs", "social_evening"],
    ["evening_dress", "social_evening"],
    ["bodycon_dress", "social_evening"],
    ["cocktail_dress", "social_evening"],
    ["nightlife_top", "social_evening"],
    ["structured_blazer_dress", "social_evening"],
    ["corset_pencil_skirt", "social_evening"],
    ["silk_blouse_leather_skirt", "social_evening"],
    ["fitted_jumpsuit", "social_evening"],
    ["open_back_dress", "social_evening"],
    ["high_slit_dress", "social_evening"],
  ];
  it.each(cases)("classifies %s as %s", (family, expected) => {
    expect(classifyOutfitCategory(family)).toBe(expected);
  });

  it("covers all 23 known outfit_family tags exactly once", () => {
    expect(cases.length).toBe(23);
  });
});

describe("isQuietIndoorBeigeDay", () => {
  it("is false when playful_hot_world is undefined", () => {
    expect(isQuietIndoorBeigeDay(fixtureSituation())).toBe(false);
  });

  it("is false for calm+private but a vivid color_energy and no quiet-indoor text correlate", () => {
    const situation = {
      ...fixtureSituation(),
      social_context: { mode: "alone" as const, implication: "alone" },
      activity: "sitting in her apartment",
      playful_hot_world: { ...playfulFixture(), vitality_level: "calm" as const, social_pulse: "private" as const, color_energy: "vivid" as const },
    };
    expect(isQuietIndoorBeigeDay(situation)).toBe(false);
  });

  it("is true for calm+private+muted in an indoor/home context with no outdoor/social keyword", () => {
    const situation = {
      ...fixtureSituation(),
      social_context: { mode: "alone" as const, implication: "alone" },
      activity: "reading quietly in her apartment",
      visual_execution: { ...fixtureSituation().visual_execution, location: "her bedroom" },
      playful_hot_world: { ...playfulFixture(), vitality_level: "calm" as const, social_pulse: "private" as const, color_energy: "muted" as const },
    };
    expect(isQuietIndoorBeigeDay(situation)).toBe(true);
  });

  it("is false when the location reads as outdoor/social even with calm+private+muted", () => {
    const situation = {
      ...fixtureSituation(),
      social_context: { mode: "alone" as const, implication: "alone" },
      activity: "sitting quietly at a rooftop bar",
      visual_execution: { ...fixtureSituation().visual_execution, location: "a rooftop terrace" },
      playful_hot_world: { ...playfulFixture(), vitality_level: "calm" as const, social_pulse: "private" as const, color_energy: "muted" as const },
    };
    expect(isQuietIndoorBeigeDay(situation)).toBe(false);
  });

  it("does not fire on a legitimate wellness_fitness gym day even if vitality/social happen to be calm/private", () => {
    const situation = {
      ...fixtureSituation(),
      content_tier: "wellness_fitness" as const,
      social_context: { mode: "alone" as const, implication: "alone" },
      activity: "a quiet solo gym session, post-workout",
      visual_execution: { ...fixtureSituation().visual_execution, location: "the gym" },
      playful_hot_world: { ...playfulFixture(), vitality_level: "calm" as const, social_pulse: "private" as const, color_energy: "muted" as const },
    };
    // "gym" is not in INDOOR_HOME_CONTEXT_PATTERN, so this should not classify as quiet-indoor-beige.
    expect(isQuietIndoorBeigeDay(situation)).toBe(false);
  });
});

describe("normalizePoseArchetype — playful_hot_world additions (iteration 5)", () => {
  it("does not steal 'turning back while walking away' matches from walking_away_glance", () => {
    expect(normalizePoseArchetype("turning back while walking away")).toBe("walking_away_glance");
  });

  const playfulPoseCases: Array<[string, string]> = [
    ["stepping forward with confidence", "stepping_forward"],
    ["adjusting her sunglasses", "adjusting_sunglasses"],
    ["mirror-selfie confidence", "mirror_selfie_confidence"],
    ["adjusting a bikini strap", "adjusting_bikini_strap"],
    ["lifting her hem lightly in motion", "lifting_hem_in_motion"],
    ["turning forward while walking with energy", "turning_forward_walking"],
  ];
  it.each(playfulPoseCases)("normalizes %s to %s", (phrase, expected) => {
    expect(normalizePoseArchetype(phrase)).toBe(expected);
  });
});
