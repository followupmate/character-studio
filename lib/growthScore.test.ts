import { describe, it, expect } from "vitest";
import { calculateGrowthScore } from "./growthScore";

describe("calculateGrowthScore", () => {
  it("returns 0 for empty metrics", () => {
    expect(calculateGrowthScore({})).toBe(0);
  });

  it("weights downstream signals far above vanity views", () => {
    const views = calculateGrowthScore({ views: 1000 });          // 1000 * 0.1 = 100
    const clicks = calculateGrowthScore({ fanvue_clicks: 10 });   // 10 * 20 = 200
    expect(clicks).toBeGreaterThan(views);
  });

  it("applies the documented weights exactly", () => {
    expect(
      calculateGrowthScore({
        views: 10, saves: 1, comments: 1, shares: 1,
        profile_visits: 1, follows: 1, fanvue_clicks: 1,
      })
    ).toBe(10 * 0.1 + 4 + 3 + 5 + 8 + 15 + 20);
  });

  it("ignores undefined fields instead of producing NaN", () => {
    expect(Number.isNaN(calculateGrowthScore({ likes: 50 }))).toBe(false);
  });
});
