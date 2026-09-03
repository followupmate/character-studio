import { describe, it, expect } from "vitest";
import { deriveWatchMetrics, formatWatchSummary, msToSec } from "@/lib/creativeIntelligence/watchMetrics";
import { calculateGrowthScore, type GrowthMetrics } from "@/lib/growthScore";

describe("deriveWatchMetrics — validation contract", () => {
  it("computes the ratio from a real measurement", () => {
    // Day 78, the best reel in the window: 6.28s average watch on an 8.13s video.
    expect(deriveWatchMetrics({ avgWatchTimeSec: 6.28, actualDurationSec: 8.13 })).toEqual({
      actual_video_duration_sec: 8.13,
      avg_watch_ratio: 0.772,
    });
  });

  it("requires duration > 0 — no ratio from a zero, negative or non-finite duration", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deriveWatchMetrics({ avgWatchTimeSec: 3, actualDurationSec: bad })).toEqual({});
    }
  });

  it("treats a missing metric as missing, never as zero", () => {
    // no duration -> nothing derived, and crucially no actual_video_duration_sec: 0
    expect(deriveWatchMetrics({ avgWatchTimeSec: 3 })).toEqual({});
    expect(deriveWatchMetrics({ avgWatchTimeSec: 3, actualDurationSec: null })).toEqual({});
    // duration but no watch time -> the duration is still worth recording, the ratio is not invented
    expect(deriveWatchMetrics({ actualDurationSec: 8.13 })).toEqual({ actual_video_duration_sec: 8.13 });
    expect(deriveWatchMetrics({})).toEqual({});
    // and "measured as zero" survives as a real zero
    expect(deriveWatchMetrics({ avgWatchTimeSec: 0, actualDurationSec: 8 })).toEqual({
      actual_video_duration_sec: 8,
      avg_watch_ratio: 0,
    });
  });

  it("does NOT clamp a ratio above 1 — it flags it", () => {
    // ig_reels_avg_watch_time is averaged over reaching ACCOUNTS, not plays (verified: across all
    // 24 published reels total_watch_time / avg_watch_time reproduces `reach`), so replays can
    // legitimately push one account's average past the video's length.
    const r = deriveWatchMetrics({ avgWatchTimeSec: 9.5, actualDurationSec: 8.13 });
    expect(r.avg_watch_ratio).toBe(1.169); // 9.5 / 8.13, rounded to 3dp
    expect(r.avg_watch_ratio).toBeGreaterThan(1); // not clipped to 1
    expect(r.avg_watch_ratio_exceeds_one).toBe(true);
  });

  it("does not set the exceeds-one flag at or below 1", () => {
    expect(deriveWatchMetrics({ avgWatchTimeSec: 8.13, actualDurationSec: 8.13 }).avg_watch_ratio_exceeds_one).toBeUndefined();
    expect(deriveWatchMetrics({ avgWatchTimeSec: 4, actualDurationSec: 8 }).avg_watch_ratio_exceeds_one).toBeUndefined();
  });

  it("reproduces every observed production ratio", () => {
    const observed: Array<[number, number, number]> = [
      [2.72, 5.2, 0.523], // day 93
      [2.25, 5.2, 0.433], // day 91
      [2.52, 8.13, 0.31], // day 89
      [6.28, 8.13, 0.772], // day 78
      [4.92, 8.13, 0.605], // day 76
      [6.36, 8.13, 0.783], // day 71
      [4.37, 10.04, 0.435], // day 74
    ];
    for (const [watch, dur, expected] of observed) {
      expect(deriveWatchMetrics({ avgWatchTimeSec: watch, actualDurationSec: dur }).avg_watch_ratio).toBeCloseTo(expected, 2);
    }
  });
});

describe("msToSec", () => {
  it("converts, and keeps absent absent", () => {
    expect(msToSec(130595)).toBeCloseTo(130.595, 3);
    expect(msToSec(0)).toBe(0);
    expect(msToSec(undefined)).toBeUndefined();
    expect(msToSec(Number.NaN)).toBeUndefined();
  });
});

describe("the new metrics are collected, not scored", () => {
  it("leaves calculateGrowthScore bit-for-bit unchanged", () => {
    const base: GrowthMetrics = { views: 200, saves: 3, comments: 1, shares: 2, profile_visits: 0, follows: 0 };
    const withWatch = {
      ...base,
      video_view_total_time_sec: 1343.5,
      actual_video_duration_sec: 8.13,
      avg_watch_ratio: 0.772,
      avg_watch_ratio_exceeds_one: false,
      avg_watch_time_sec: 6.28,
    } as GrowthMetrics;
    expect(calculateGrowthScore(withWatch)).toBe(calculateGrowthScore(base));
  });

  it("a reel with a perfect watch ratio scores no higher than one with none", () => {
    const a = { views: 100 } as GrowthMetrics;
    const b = { views: 100, avg_watch_ratio: 1.0, actual_video_duration_sec: 7 } as GrowthMetrics;
    expect(calculateGrowthScore(b)).toBe(calculateGrowthScore(a));
  });
});

describe("formatWatchSummary", () => {
  it("renders a measured row", () => {
    expect(
      formatWatchSummary({
        avg_watch_time_sec: 6.28,
        video_view_total_time_sec: 1343.5,
        actual_video_duration_sec: 8.13,
        avg_watch_ratio: 0.772,
      })
    ).toBe("watch 6.28s / dur 8.13s = ratio 0.772 · total watch 1343.5s");
  });

  it("prints an em dash for anything unmeasured, never a zero", () => {
    const s = formatWatchSummary({ avg_watch_time_sec: 2.9 });
    expect(s).toBe("watch 2.90s / dur — = ratio — · total watch —");
    expect(s).not.toMatch(/0\.00s|ratio 0\b/);
  });
});
