import { describe, expect, it } from "vitest";
import { validateWrittenPrompt } from "./promptWriter";

// writeSoul2Prompt() itself is network-bound (claudeWithRetry) and per house convention is not
// unit tested (same as generateSceneBrief / generateStoryDayContent's live path). The pure
// validation gate is fully covered here — it is what guarantees a bad LLM rewrite can never
// reach Higgsfield (fallback to the deterministic F0 prompt instead).

const WARDROBE = "white matte-stretch swimsuit, off-white linen overshirt, barefoot";
const SPATIAL = "Rooftop pool terrace — wide pale sand-tone tiles along the pool edge.";

const GOOD_PROMPT =
  "She sits at the edge of a rooftop pool terrace, legs in the aquamarine water, wearing a white " +
  "matte-stretch swimsuit under an open off-white linen overshirt. Wide sand-tone tiles run along " +
  "the pool edge, the late-afternoon sun arriving low from camera-left and catching the linen. " +
  "Her posture is relaxed, one hand braced on the warm stone coping, gaze drifting toward the " +
  "skyline below. Natural skin texture, realistic fabric folds, golden hour warmth over the whole frame.";

describe("validateWrittenPrompt", () => {
  it("accepts a well-formed editorial prompt containing the wardrobe and environment anchors", () => {
    expect(validateWrittenPrompt(GOOD_PROMPT, WARDROBE, SPATIAL)).toHaveLength(0);
  });

  it("rejects a prompt that is too short", () => {
    const errors = validateWrittenPrompt("She stands by the pool in a swimsuit.", WARDROBE, SPATIAL);
    expect(errors.some((e) => e.includes("Word count"))).toBe(true);
  });

  it("rejects a prompt missing the wardrobe anchor garment", () => {
    const noGarment = GOOD_PROMPT.replace(/swimsuit/g, "outfit-piece");
    const errors = validateWrittenPrompt(noGarment, WARDROBE, SPATIAL);
    expect(errors.some((e) => e.includes("wardrobe anchor"))).toBe(true);
  });

  it("rejects a prompt missing the environment anchor", () => {
    const noEnv = GOOD_PROMPT.replace(/pool/g, "water feature").replace(/terrace/g, "deck-area");
    const errors = validateWrittenPrompt(noEnv, WARDROBE, SPATIAL);
    expect(errors.some((e) => e.includes("environment anchor"))).toBe(true);
  });

  it("rejects meta-leakage terms", () => {
    const leaked = GOOD_PROMPT.replace("golden hour warmth", "kling start frame energy");
    const errors = validateWrittenPrompt(leaked, WARDROBE, SPATIAL);
    expect(errors.some((e) => e.includes("Meta-leakage"))).toBe(true);
  });

  it("rejects list/markdown syntax", () => {
    const listy = `${GOOD_PROMPT}\n- one more line`;
    const errors = validateWrittenPrompt(listy, WARDROBE, SPATIAL);
    expect(errors.some((e) => e.includes("list syntax"))).toBe(true);
  });

  it("passes when no wardrobe/spatial locks are provided (nothing to anchor against)", () => {
    expect(validateWrittenPrompt(GOOD_PROMPT)).toHaveLength(0);
  });
});
