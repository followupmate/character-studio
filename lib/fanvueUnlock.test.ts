import { describe, it, expect } from "vitest";
import { buildFanvuePrompt, SituationFanvueTension } from "./fanvueUnlock";
import type { SensualVisualLanguage, SexAppealStyle, LuxurySeduction } from "./situationPlanner";
import type { PlayfulHotWorldProfile } from "./playfulHotWorldConfig";

const STORY_DAY = {
  tier: "intimate_aesthetic",
  moment_family: null,
  magnetism_level: null,
  location: "a hotel room",
  mood: "unhurried",
  ig_caption: null,
  hook_text: null,
};

describe("buildFanvuePrompt", () => {
  it("without a situationTension, produces the original prompt shape unchanged", () => {
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong");
    expect(prompt).toContain('Soul set for "Room 407"');
    expect(prompt).toContain("a hotel room");
    expect(prompt).toContain("silk robe");
    expect(prompt).toContain("Intensity strong");
    expect(prompt).not.toContain("withheld from Instagram");
  });

  it("with a situationTension (potential !== none), threads continuation + withheld_element into the prompt", () => {
    const tension: SituationFanvueTension = { potential: "strong", continuation: "the rest of the getting-ready sequence", withheld_element: "the moment she chose the dress" };
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", tension);
    expect(prompt).toContain("the rest of the getting-ready sequence");
    expect(prompt).toContain("withheld from Instagram: the moment she chose the dress");
  });

  it("potential 'none' never injects a continuation clause, even if continuation happens to be set", () => {
    const tension: SituationFanvueTension = { potential: "none", continuation: "should be ignored", withheld_element: null };
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", tension);
    expect(prompt).not.toContain("should be ignored");
  });

  it("a soft/clear potential with no continuation text falls back to the base prompt (no situation clause)", () => {
    const tension: SituationFanvueTension = { potential: "soft", continuation: null, withheld_element: null };
    const withTension = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "soft", tension);
    const withoutTension = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "soft");
    expect(withTension).toBe(withoutTension);
  });
});

// sensual_visual_language_v1 (iteration 2) — Fanvue continuation carries the FULL object, not
// just wardrobe/body, so the private set stays behaviorally continuous with today's IG moment.
describe("buildFanvuePrompt — sensualVisualLanguage", () => {
  const sensual: SensualVisualLanguage = {
    wardrobe_signal: "a satin slip dress, thin straps",
    body_emphasis: "legs",
    gesture_or_action: "crossing her legs as she leans back",
    camera_relationship: "close private-camera distance",
    exposure_boundary: "nothing above mid-thigh",
  };

  it("with a full sensualVisualLanguage object, includes gesture_or_action, camera_relationship AND exposure_boundary (not just wardrobe/body)", () => {
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, sensual);
    expect(prompt).toContain(sensual.wardrobe_signal);
    expect(prompt).toContain(sensual.body_emphasis);
    expect(prompt).toContain(sensual.gesture_or_action);
    expect(prompt).toContain(sensual.camera_relationship);
    expect(prompt).toContain(sensual.exposure_boundary);
  });

  it("without it, output is identical to iteration 1 (byte-identical)", () => {
    const withoutSensual = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong");
    const withUndefinedSensual = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, undefined);
    expect(withUndefinedSensual).toBe(withoutSensual);
  });

  it("combines with situationTension in the same prompt", () => {
    const tension: SituationFanvueTension = { potential: "strong", continuation: "the rest of the evening", withheld_element: "what happens after" };
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", tension, sensual);
    expect(prompt).toContain("the rest of the evening");
    expect(prompt).toContain(sensual.camera_relationship);
  });
});

// sex_appeal_style_v1 (iteration 3) — same "thread the full declared style forward" pattern,
// one layer deeper (archetype/silhouette/leg visibility/facial energy/mode).
describe("buildFanvuePrompt — sexAppealStyle", () => {
  const sexAppeal: SexAppealStyle = {
    outfit_archetype: "a fitted bodycon mini dress",
    silhouette_focus: "legs",
    leg_visibility: "fully visible, bare",
    facial_energy: "a teasing half-smile",
    seduction_mode: "playful tease",
  };

  it("with a sexAppealStyle object, includes outfit_archetype, silhouette_focus, facial_energy AND seduction_mode", () => {
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, undefined, sexAppeal);
    expect(prompt).toContain(sexAppeal.outfit_archetype);
    expect(prompt).toContain(sexAppeal.silhouette_focus);
    expect(prompt).toContain(sexAppeal.facial_energy);
    expect(prompt).toContain(sexAppeal.seduction_mode);
  });

  it("without it, output is identical to iteration 2 (byte-identical)", () => {
    const withoutSexAppeal = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong");
    const withUndefinedSexAppeal = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, undefined, undefined);
    expect(withUndefinedSexAppeal).toBe(withoutSexAppeal);
  });

  it("combines with sensualVisualLanguage and situationTension in the same prompt", () => {
    const sensual: SensualVisualLanguage = {
      wardrobe_signal: "a satin slip dress, thin straps",
      body_emphasis: "legs",
      gesture_or_action: "crossing her legs as she leans back",
      camera_relationship: "close private-camera distance",
      exposure_boundary: "nothing above mid-thigh",
    };
    const tension: SituationFanvueTension = { potential: "strong", continuation: "the rest of the evening", withheld_element: "what happens after" };
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", tension, sensual, sexAppeal);
    expect(prompt).toContain("the rest of the evening");
    expect(prompt).toContain(sensual.camera_relationship);
    expect(prompt).toContain(sexAppeal.seduction_mode);
  });
});

// luxury_seduction_v1 (iteration 4) — same "thread the full declared style forward" pattern,
// one layer deeper (fashion direction/material/accessories/footwear/pose/body geometry/status).
describe("buildFanvuePrompt — luxurySeduction", () => {
  const luxury: LuxurySeduction = {
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

  it("with a luxurySeduction object, includes fashion_direction, material_language, pose_archetype, body_geometry AND social_status_signal", () => {
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, undefined, undefined, luxury);
    expect(prompt).toContain(luxury.fashion_direction);
    expect(prompt).toContain(luxury.material_language);
    expect(prompt).toContain(luxury.pose_archetype);
    expect(prompt).toContain(luxury.body_geometry);
    expect(prompt).toContain(luxury.social_status_signal);
  });

  it("without it, output is identical to iteration 3 (byte-identical)", () => {
    const withoutLuxury = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong");
    const withUndefinedLuxury = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, undefined, undefined, undefined);
    expect(withUndefinedLuxury).toBe(withoutLuxury);
  });

  it("combines with sensualVisualLanguage, sexAppealStyle and situationTension in the same prompt", () => {
    const sensual: SensualVisualLanguage = {
      wardrobe_signal: "a satin slip dress, thin straps",
      body_emphasis: "legs",
      gesture_or_action: "crossing her legs as she leans back",
      camera_relationship: "close private-camera distance",
      exposure_boundary: "nothing above mid-thigh",
    };
    const sexAppeal: SexAppealStyle = {
      outfit_archetype: "a fitted bodycon mini dress",
      silhouette_focus: "legs",
      leg_visibility: "fully visible, bare",
      facial_energy: "a teasing half-smile",
      seduction_mode: "playful tease",
    };
    const tension: SituationFanvueTension = { potential: "strong", continuation: "the rest of the evening", withheld_element: "what happens after" };
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", tension, sensual, sexAppeal, luxury);
    expect(prompt).toContain("the rest of the evening");
    expect(prompt).toContain(sensual.camera_relationship);
    expect(prompt).toContain(sexAppeal.seduction_mode);
    expect(prompt).toContain(luxury.social_status_signal);
  });
});

// playful_hot_world_v1 (iteration 5) — same "thread forward" pattern, carrying the day's vibe
// (mood/vitality/social pulse/season) so the Fanvue set stays tonally continuous.
describe("buildFanvuePrompt — playfulHotWorld", () => {
  const playful: PlayfulHotWorldProfile = {
    mood_temperature: "hot",
    vitality_level: "electric",
    social_pulse: "party_adjacent",
    seasonality: "high_summer",
    color_energy: "vivid",
    fun_factor: "high",
  };

  it("with a playfulHotWorld object, includes mood_temperature, vitality_level, social_pulse AND seasonality", () => {
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, undefined, undefined, undefined, playful);
    expect(prompt).toContain(playful.mood_temperature);
    expect(prompt).toContain(playful.vitality_level);
    expect(prompt).toContain(playful.social_pulse);
    expect(prompt).toContain(playful.seasonality);
  });

  it("without it, output is identical to iteration 4 (byte-identical)", () => {
    const withoutPlayful = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong");
    const withUndefinedPlayful = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", undefined, undefined, undefined, undefined, undefined);
    expect(withUndefinedPlayful).toBe(withoutPlayful);
  });

  it("combines with sensualVisualLanguage, sexAppealStyle, luxurySeduction and situationTension in the same prompt", () => {
    const sensual: SensualVisualLanguage = {
      wardrobe_signal: "a satin slip dress, thin straps",
      body_emphasis: "legs",
      gesture_or_action: "crossing her legs as she leans back",
      camera_relationship: "close private-camera distance",
      exposure_boundary: "nothing above mid-thigh",
    };
    const sexAppeal: SexAppealStyle = {
      outfit_archetype: "a fitted bodycon mini dress",
      silhouette_focus: "legs",
      leg_visibility: "fully visible, bare",
      facial_energy: "a teasing half-smile",
      seduction_mode: "playful tease",
    };
    const luxury: LuxurySeduction = {
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
    const tension: SituationFanvueTension = { potential: "strong", continuation: "the rest of the evening", withheld_element: "what happens after" };
    const prompt = buildFanvuePrompt("Room 407", STORY_DAY, "silk robe", "strong", tension, sensual, sexAppeal, luxury, playful);
    expect(prompt).toContain("the rest of the evening");
    expect(prompt).toContain(sensual.camera_relationship);
    expect(prompt).toContain(sexAppeal.seduction_mode);
    expect(prompt).toContain(luxury.social_status_signal);
    expect(prompt).toContain(playful.social_pulse);
  });
});
