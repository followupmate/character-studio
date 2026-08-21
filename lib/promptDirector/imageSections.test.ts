import { describe, expect, it } from "vitest";
import { buildAestheticSection, buildRealismSection, pickPhotoStyle, PHOTO_STYLE_DECK } from "./imageSections";
import type { PromptDirectorInput } from "./types";
import type { SceneBriefJson } from "@/lib/sceneBrief";
import type { SlotSpec } from "@/lib/archetypeDeck";

// F3 — aesthetic variability. Covers the tier-derived direction, the deterministic photo-style
// rotation, and the story_bts-only phone-exposure cue (feed/reel slots keep editorial realism).

const SCENE_BRIEF: SceneBriefJson = {
  camera_language: "static handheld 50mm",
  color_palette: ["terracotta"],
  visual_rules: ["no mirrors"],
  location_constraints: ["tall window to her right"],
  spatial_setup: "Her kitchen — pale oak counter along the window wall.",
  wardrobe_lock: "washed-white cotton tee, faded jeans",
  allowed_props: [],
  lighting_state: "window light from the left",
  time_of_day: "golden_hour",
  weather_implied: "clear",
};

function input(overrides: Partial<PromptDirectorInput> = {}, slotOverrides: Partial<SlotSpec> = {}): PromptDirectorInput {
  return {
    character: { id: "c1", name: "Vivienne", visualBrief: "late-20s woman", sacredDetails: null, soulId: "s1" },
    sceneBrief: SCENE_BRIEF,
    slot: { slot: "carousel_2", channel: "feed", type: "photo", sequence_index: 2, family: "subject", framing: "Mid shot.", ...slotOverrides },
    archetypeId: "wide_interior",
    archetypeGuidance: "Establish the room.",
    outputType: "image",
    generationMode: "text_to_image",
    targetModel: "soul2",
    ...overrides,
  };
}

describe("pickPhotoStyle", () => {
  it("is deterministic and cycles the whole deck", () => {
    expect(pickPhotoStyle(3)).toBe(pickPhotoStyle(3));
    expect(pickPhotoStyle(0)).toBe(PHOTO_STYLE_DECK[0]);
    expect(pickPhotoStyle(PHOTO_STYLE_DECK.length)).toBe(PHOTO_STYLE_DECK[0]);
    const styles = new Set(Array.from({ length: PHOTO_STYLE_DECK.length }, (_, i) => pickPhotoStyle(i)));
    expect(styles.size).toBe(PHOTO_STYLE_DECK.length);
  });

  it("handles negative and non-finite seeds", () => {
    expect(PHOTO_STYLE_DECK).toContain(pickPhotoStyle(-1));
    expect(pickPhotoStyle(NaN)).toBe(PHOTO_STYLE_DECK[0]);
  });
});

describe("buildAestheticSection — F3", () => {
  it("keeps the original fixed line when tier is absent (pre-F3 behavior)", () => {
    const [text] = buildAestheticSection(input());
    expect(text).toContain("candid social-media realism");
  });

  it("derives the direction from the tier", () => {
    const [text] = buildAestheticSection(input({ tier: "intimate_aesthetic" }));
    expect(text).toContain("quiet editorial intimacy");
    expect(text).not.toContain("candid social-media realism");
  });

  it("humanizes the time_of_day enum (no underscores)", () => {
    const [text] = buildAestheticSection(input());
    expect(text).not.toContain("golden_hour");
    expect(text).toContain("golden hour");
  });

  it("appends the day's photo style when dayNumber is set", () => {
    const [text] = buildAestheticSection(input({ tier: "everyday_life", dayNumber: 2 }));
    expect(text).toContain(pickPhotoStyle(2).split(",")[0]);
  });

  it("two different day numbers produce two different aesthetic lines", () => {
    const [a] = buildAestheticSection(input({ tier: "everyday_life", dayNumber: 1 }));
    const [b] = buildAestheticSection(input({ tier: "everyday_life", dayNumber: 2 }));
    expect(a).not.toBe(b);
  });
});

describe("buildRealismSection — F3 phone-exposure gating", () => {
  it("story_bts keeps the phone-exposure cue", () => {
    const [text] = buildRealismSection(input({}, { slot: "story_bts", channel: "story", family: "bts" }));
    expect(text).toContain("natural phone exposure");
  });

  it("feed slots get the editorial exposure cue instead", () => {
    const [text] = buildRealismSection(input());
    expect(text).not.toContain("phone exposure");
    expect(text).toContain("true-to-life exposure");
  });
});
