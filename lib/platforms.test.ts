import { describe, it, expect } from "vitest";
import { mapPlatforms } from "./platforms";

describe("mapPlatforms", () => {
  it("maps wizard labels to DB slugs", () => {
    expect(mapPlatforms(["Instagram", "TikTok", "YouTube"])).toEqual(["instagram", "tiktok", "youtube"]);
  });

  it("maps X/Twitter to 'x' (regression: old code silently dropped it)", () => {
    expect(mapPlatforms(["X/Twitter"])).toEqual(["x"]);
  });

  it("drops unknown labels instead of inserting garbage", () => {
    expect(mapPlatforms(["Instagram", "MySpace"])).toEqual(["instagram"]);
  });

  it("tolerates whitespace and casing", () => {
    expect(mapPlatforms(["  INSTAGRAM  ", "twitter"])).toEqual(["instagram", "x"]);
  });
});
