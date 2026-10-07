import { describe, it, expect } from "vitest";
import {
  ORIENTATION_LOCK,
  ORIENTATION_NEGATIVES,
  applyOrientationGuard,
  needsOrientationGuard,
  stripTiltPhrasing,
  withOrientationNegatives,
} from "@/lib/orientationGuard";
import { REEL_RECIPES } from "@/lib/recovery/reelRecipes";

const STRIP_CASES: Array<[string, string]> = [
  ["Vertical 9:16 shot, medium shot, slight tilt. Warm light.", "Vertical 9:16 shot, medium shot. Warm light."],
  ["50mm f/2.8, medium shot, slightly tilted camera, eye level", "50mm f/2.8, medium shot, eye level"],
  ["static handheld 50mm with a slight camera tilt", "static handheld 50mm"],
  ["dutch angle, canted frame, she smiles", "she smiles"],
  ["a subtle Dutch tilt, window light", "window light"],
  ["tilted frame, golden hour", "golden hour"],
  ["35mm, tilted horizon, terrace", "35mm, terrace"],
  ["camera tilted slightly, soft light", "soft light"],
  ["off-kilter composition, cafe", "cafe"],
  ["photo rotated 90 degrees, sideways frame, terrace", "terrace"],
  ["rotated image of her on the balcony", "of her on the balcony"],
  ["landscape orientation, balcony", "balcony"],
];

describe("stripTiltPhrasing", () => {
  it.each(STRIP_CASES)("%j -> %j", (input, expected) => {
    const r = stripTiltPhrasing(input);
    expect(r.text).toBe(expected);
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it("rewrites 'lying sideways' as an upright description", () => {
    expect(stripTiltPhrasing("lying sideways on the bed, morning light").text).toBe("reclining on the bed, morning light");
  });

  it.each([
    "slight head tilt, soft smile",
    "her head slightly tilted toward the window",
    "a slight tilt of her head",
    "chin slightly tilted up",
    "seated sideways with crossed legs",
    "glances sideways at the street",
    "hips rotated toward camera",
    "body rotated three-quarters to the lens",
    "rim touches lips, glass tilts naturally",
    "static handheld 50mm",
  ])("keeps body-pose language: %j", (input) => {
    expect(stripTiltPhrasing(input)).toEqual({ text: input, removed: [] });
  });

  it("is a no-op (byte-identical) when nothing matches and handles null", () => {
    expect(stripTiltPhrasing("  Medium shot , eye level  ").text).toBe("  Medium shot , eye level  ");
    expect(stripTiltPhrasing(null)).toEqual({ text: "", removed: [] });
  });
});

describe("applyOrientationGuard", () => {
  it("strips the tilt and appends the level/upright lock once", () => {
    const g = applyOrientationGuard("Medium shot, slight tilt");
    expect(g.prompt).toBe(`Medium shot. ${ORIENTATION_LOCK}`);
    expect(g.removed).toEqual(["slight tilt"]);
    expect(applyOrientationGuard(g.prompt).prompt).toBe(g.prompt); // idempotent
    expect(applyOrientationGuard("Warm light.").prompt).toBe(`Warm light. ${ORIENTATION_LOCK}`);
    expect(applyOrientationGuard("").prompt).toBe(ORIENTATION_LOCK);
  });

  it("the lock itself contains no word the stripper would remove", () => {
    expect(stripTiltPhrasing(ORIENTATION_LOCK).removed).toEqual([]);
    expect(ORIENTATION_LOCK).toMatch(/level horizon/i);
    expect(ORIENTATION_LOCK).toMatch(/upright vertical 9:16/i);
    expect(ORIENTATION_LOCK).toMatch(/camera level/i);
    expect(ORIENTATION_LOCK).toMatch(/subject upright/i);
  });
});

describe("withOrientationNegatives", () => {
  it("appends rotation negatives without duplicates", () => {
    const n = withOrientationNegatives("beauty filter, dutch angle");
    expect(n.startsWith("beauty filter, dutch angle")).toBe(true);
    for (const x of ORIENTATION_NEGATIVES) expect(n.split(", ").filter((y) => y === x)).toHaveLength(1);
    expect(n).toContain("rotated image");
    expect(n).toContain("sideways image");
    expect(n).toContain("tilted frame");
    expect(withOrientationNegatives(null)).toBe(ORIENTATION_NEGATIVES.join(", "));
  });
});

describe("needsOrientationGuard", () => {
  it("only the reel start frame (Kling i2v input)", () => {
    expect(needsOrientationGuard({ slot: "reel_start_frame", type: "photo" })).toBe(true);
    expect(needsOrientationGuard({ slot: "story_bts", type: "photo", channel: "story" })).toBe(false);
    expect(needsOrientationGuard({ slot: "carousel_1", type: "photo", channel: "feed" })).toBe(false);
    expect(needsOrientationGuard({ slot: "reel_video", type: "video", channel: "reel" })).toBe(false);
    expect(needsOrientationGuard({ slot: null, type: "photo", channel: "reel" })).toBe(true);
  });
});

describe("reel recipes contain no camera-tilt language", () => {
  it("every recipe text field is unchanged by the stripper", () => {
    for (const r of Object.values(REEL_RECIPES)) {
      for (const [k, v] of Object.entries(r)) {
        const texts = Array.isArray(v) ? v : [v];
        for (const t of texts) if (typeof t === "string") expect(stripTiltPhrasing(t).removed, `${r.id}.${k}`).toEqual([]);
      }
    }
  });
});
