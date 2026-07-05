import { describe, it, expect } from "vitest";
import { REEL_FORMATS, pickReelFormat } from "./reelFormats";

describe("pickReelFormat", () => {
  it("rotates deterministically by seed", () => {
    expect(pickReelFormat(0).id).toBe(REEL_FORMATS[0].id);
    expect(pickReelFormat(1).id).toBe(REEL_FORMATS[1].id);
    expect(pickReelFormat(REEL_FORMATS.length).id).toBe(REEL_FORMATS[0].id); // wraps
  });

  it("is stable for the same seed (a retried day keeps its format)", () => {
    expect(pickReelFormat(42).id).toBe(pickReelFormat(42).id);
  });

  it("cycles through every format across consecutive days", () => {
    const seen = new Set(Array.from({ length: REEL_FORMATS.length }, (_, d) => pickReelFormat(d).id));
    expect(seen.size).toBe(REEL_FORMATS.length);
  });

  it("handles negative/garbage seeds without crashing", () => {
    expect(pickReelFormat(-1).id).toBeTruthy();
    expect(pickReelFormat(NaN).id).toBe(REEL_FORMATS[0].id);
  });

  it("every format ships a cover cue and a video directive", () => {
    for (const f of REEL_FORMATS) {
      expect(f.coverCue.length).toBeGreaterThan(20);
      expect(f.videoDirective.length).toBeGreaterThan(20);
    }
  });
});
