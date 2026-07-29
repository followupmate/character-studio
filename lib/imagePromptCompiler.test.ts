import { describe, it, expect } from "vitest";
import { compileImagePrompt, MAX_IMAGE_PROMPT_LENGTH, SINGLE_FRAME_LOCK, BANNED_COLLAGE_TERMS } from "./imagePromptCompiler";
import type { ShotDirection } from "./shotDirection";

function fixtureShot(overrides: Partial<ShotDirection> = {}): ShotDirection {
  return {
    source_step: "escalation",
    subject: "Vivienne, mid-20s, dark hair, slim athletic build",
    continuity: "same woman, same outfit and setting throughout, continuous night",
    location: "city street at night, beside a luxury car",
    spatial_zone: "fully inside the private continuation of the car interior, no longer visible from outside",
    visible_action: "she settles further in, the action or space shifting",
    pose: "stepping out of a car, one heel on the sill, half-turned",
    wardrobe_state: "backless halter bodysuit, tailored shorts — visibly more displaced than the opening moment",
    body_emphasis: "back and shoulders, bodycon silhouette",
    facial_expression: "teasing closed-mouth smile — engaged, holding eye contact",
    framing: "medium-close",
    camera_angle: "eye-level",
    camera_motion: "quick, energetic movement",
    lighting: "night, warm, clear, warm tone, vivid color",
    atmosphere: "electric, deliberate",
    ...overrides,
  };
}

describe("compileImagePrompt", () => {
  it("produces a non-empty prompt containing all 8 required content sections", () => {
    const prompt = compileImagePrompt(fixtureShot(), "warm cinematic contrast, dark night street");
    expect(prompt).toContain("Vivienne");
    expect(prompt).toContain("city street at night, beside a luxury car");
    expect(prompt).toContain("stepping out of a car");
    expect(prompt).toContain("backless halter bodysuit");
    expect(prompt).toContain("teasing closed-mouth smile");
    expect(prompt).toContain("medium-close shot");
    expect(prompt).toContain("night, warm, clear");
    expect(prompt).toContain(SINGLE_FRAME_LOCK);
  });

  it("ends with the exact positive single-frame lock", () => {
    const prompt = compileImagePrompt(fixtureShot(), "style");
    expect(prompt.endsWith(SINGLE_FRAME_LOCK)).toBe(true);
  });

  it("never contains any banned collage/panel term", () => {
    const prompt = compileImagePrompt(fixtureShot(), "style");
    for (const term of BANNED_COLLAGE_TERMS) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("never leaks Fanvue business vocabulary", () => {
    const prompt = compileImagePrompt(fixtureShot(), "style");
    for (const term of ["paid_promise", "content_level", "erotic_tease", "premium_sensual", "fanvue_tension"]) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("stays within MAX_IMAGE_PROMPT_LENGTH even for very verbose fields", () => {
    const verboseShot = fixtureShot({
      spatial_zone: "a".repeat(500),
      wardrobe_state: "b".repeat(500),
      lighting: "c".repeat(500),
    });
    const prompt = compileImagePrompt(verboseShot, "d".repeat(200));
    expect(prompt.length).toBeLessThanOrEqual(MAX_IMAGE_PROMPT_LENGTH);
  });

  it("truncation never cuts mid-sentence (always ends in . or the exact lock string)", () => {
    const verboseShot = fixtureShot({ spatial_zone: "a very long spatial zone description. ".repeat(20) });
    const prompt = compileImagePrompt(verboseShot, "style");
    expect(prompt.endsWith(".") || prompt.endsWith(SINGLE_FRAME_LOCK)).toBe(true);
    expect(prompt.endsWith("...")).toBe(false);
  });
});
