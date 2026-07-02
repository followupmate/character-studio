import { describe, it, expect } from "vitest";
import { deriveStrategy } from "./fanvueStrategy";

describe("deriveStrategy (monetization phases)", () => {
  it("returns null without a snapshot", () => {
    expect(deriveStrategy(null)).toBeNull();
  });

  it("pre_launch when there is no audience at all", () => {
    expect(deriveStrategy({ subscribers: 0, followers: 0 })?.phase).toBe("pre_launch");
  });

  it("growth_first for a small subscriber base", () => {
    expect(deriveStrategy({ subscribers: 5, followers: 200 })?.phase).toBe("growth_first");
  });

  it("early_monetize once subs exist but spenders are few", () => {
    expect(
      deriveStrategy({ subscribers: 50, followers: 1000, smart_lists: { spent_more_than_50: 2 } })?.phase
    ).toBe("early_monetize");
  });

  it("scale with a real paying audience", () => {
    expect(
      deriveStrategy({ subscribers: 150, followers: 5000, smart_lists: { spent_more_than_50: 10 } })?.phase
    ).toBe("scale");
  });

  it("every phase ships recommendations AND explicit holds", () => {
    for (const s of [{ subscribers: 0, followers: 0 }, { subscribers: 5 }, { subscribers: 50 }, { subscribers: 200, smart_lists: { spent_more_than_50: 9 } }]) {
      const st = deriveStrategy(s)!;
      expect(st.recommendations.length).toBeGreaterThan(0);
      expect(st.hold.length).toBeGreaterThan(0);
    }
  });
});
