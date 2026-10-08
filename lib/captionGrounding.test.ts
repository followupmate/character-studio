import { describe, it, expect } from "vitest";
import { groundCaption, findUngroundedReferences, hasPositiveMention, reelGroundingText, GROUNDING_TERMS } from "./captionGrounding";
import { REEL_SHARE_LINES, ensureReelShareCta } from "./captionTemplate";

// Phase 6 — 2026-10-08 regression: the published reel (start frame regenerated with a close-up
// promptOverride) showed no cat, no egg and both straps on, yet the caption said all three.
const CAPTION_1008 = "the cat is supervising. one strap is already off. the egg is probably fine.";
const OVERRIDE_PROMPT_1008 = "Tight head-and-shoulders close-up portrait, cropped just below the collarbones. Her face fills the upper half of the vertical frame; waist, hips and legs are out of frame. Camera level at her eye height, about 60 cm from her face, 85mm lens look, upright and correctly oriented, horizon level.\n\nOne woman alone in her El Born galley kitchen in Barcelona, white marble worktop and sage-green cabinets blurred into soft bokeh behind her. White satin slip dress with thin straps on both shoulders, a thin delicate gold chain at her collarbone.\n\nMid get-ready: one hand raised, fingertips tucking a strand of dark wavy hair behind her ear, head turned slightly toward a mirror just off camera, eyes beginning to turn back toward the lens, lips softly parted, quiet almost-smile.\n\nSoft warm diffused morning light from a linen-curtained window to her left, gentle golden glow on her cheek and hair, soft shadows, shallow depth of field.\n\nA single natural photograph. One woman, one body position, one instant. Full-bleed 9:16. Natural skin texture with visible pores, true-to-life exposure.";
const ORIGINAL_SLOT_PROMPT_1008 = "One woman alone at the marble counter of her El Born kitchen. Her white satin charmeuse slip dress catches the light in soft folds, the left strap slipped off her shoulder, the mid-thigh hem skimming her bare legs. A thin gold chain rests at her collarbone. To her left, a ceramic bowl holds two whole eggs and one cracked; to her right, a ceramic espresso cup, and beyond it the blue-grey British Shorthair seated at the counter's far edge. Handheld 50mm, camera level.";

describe("groundCaption — 2026-10-08 regression", () => {
  it("drops all three ungrounded sentences against the final (override) start-frame prompt", () => {
    const r = groundCaption(CAPTION_1008, OVERRIDE_PROMPT_1008);
    expect(r.checked).toBe(true);
    expect(r.text).toBe("");
    expect(r.dropped.map((d) => d.terms)).toEqual([["cat"], ["strap_off"], ["egg"]]);
  });

  it("keeps the same caption when the frame really shows the cat, the eggs and the slipped strap", () => {
    const r = groundCaption(CAPTION_1008, ORIGINAL_SLOT_PROMPT_1008);
    expect(r.dropped).toEqual([]);
    expect(r.text).toBe(CAPTION_1008);
  });

  it("an empty grounded body still yields a valid reel caption (share line only, no claims)", () => {
    const out = ensureReelShareCta(groundCaption(CAPTION_1008, OVERRIDE_PROMPT_1008).text, "2026-10-08");
    expect(REEL_SHARE_LINES).toContain(out);
  });
});

describe("groundCaption — behaviour", () => {
  it("without grounding text returns the caption unchanged (never guesses)", () => {
    expect(groundCaption(CAPTION_1008, null)).toEqual({ text: CAPTION_1008, checked: false, dropped: [] });
    expect(groundCaption(CAPTION_1008, "   ").checked).toBe(false);
  });

  it("keeps mood / light / place sentences and line structure", () => {
    const cap = "the light in here knows what it's doing. the cat disagrees.\nbarcelona mornings, slow on purpose.";
    const r = groundCaption(cap, "Close-up portrait in her Barcelona kitchen, soft morning light, white satin slip dress.");
    expect(r.text).toBe("the light in here knows what it's doing.\nbarcelona mornings, slow on purpose.");
    expect(r.dropped).toEqual([{ sentence: "the cat disagrees.", terms: ["cat"] }]);
  });

  it("negated prompt mentions are not evidence ('no robe, no cardigan over it')", () => {
    const prompt = "white satin slip dress, no bra visible, no robe, no cardigan over it";
    expect(findUngroundedReferences("robe stays on the hook today.", prompt)).toEqual(["robe"]);
    expect(findUngroundedReferences("cardigan weather, ignored.", prompt)).toEqual(["cardigan"]);
  });

  it("a negated caption mention is not a claim ('no coffee yet')", () => {
    expect(findUngroundedReferences("no coffee yet. just the window.", "portrait by the window")).toEqual([]);
  });

  it("'slip dress with thin straps' does NOT ground a strap-off claim; an actual slipped strap does", () => {
    expect(findUngroundedReferences("one strap already off.", "White satin slip dress with thin straps on both shoulders")).toEqual(["strap_off"]);
    expect(findUngroundedReferences("the strap slipped and i let it.", "the left strap slipped off her shoulder")).toEqual([]);
  });

  it("share / CTA lines are never removed even if they name a prop", () => {
    const coffeeLine = REEL_SHARE_LINES.find((l) => /coffee/.test(l))!;
    const r = groundCaption(`terrace hours.\n${coffeeLine}`, "portrait on a terrace, golden light");
    expect(r.text).toBe(`terrace hours.\n${coffeeLine}`);
  });

  it("grounded synonyms count (British Shorthair grounds 'cat', espresso cup grounds 'coffee')", () => {
    expect(findUngroundedReferences("the cat approves. coffee first.", "a blue-grey British Shorthair beside a ceramic espresso cup")).toEqual([]);
  });

  it("every grounding term matches its own evidence (sanity)", () => {
    for (const t of GROUNDING_TERMS) expect(t.caption.source.length, t.id).toBeGreaterThan(0);
    expect(hasPositiveMention("no cat here, but a cat there", /\bcat\b/i)).toBe(true);
    expect(hasPositiveMention("no cat", /\bcat\b/i)).toBe(false);
  });
});

describe("reelGroundingText", () => {
  it("prefers the start-frame prompt (the i2v source image) over the motion prompt", () => {
    expect(reelGroundingText("close-up portrait", "the cat walks across the counter")).toBe("close-up portrait");
  });
  it("falls back to the reel_video prompt, else null", () => {
    expect(reelGroundingText(null, "kitchen, cat on counter")).toBe("kitchen, cat on counter");
    expect(reelGroundingText("  ", "")).toBeNull();
  });
});
