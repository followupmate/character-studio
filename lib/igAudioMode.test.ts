import { describe, it, expect } from "vitest";
import { localDateKey, resolveAudioMode, trendingRequested, trendingTopN, withinTrendingWindow } from "./igAudioMode";

const UNTIL = "2026-10-17";
const T = { IG_AUDIO_MODE: "trending", IG_AUDIO_TRENDING_UNTIL: UNTIL };

describe("igAudioMode — window (Europe/Bratislava, inclusive)", () => {
  it("formats the Bratislava calendar day", () => {
    expect(localDateKey(new Date("2026-10-17T21:59:00Z"))).toBe("2026-10-17"); // 23:59 CEST
    expect(localDateKey(new Date("2026-10-17T22:00:00Z"))).toBe("2026-10-18"); // 00:00 CEST
  });
  it("is open through 23:59 Bratislava on the until day, closed at 00:00 next day", () => {
    expect(withinTrendingWindow(UNTIL, new Date("2026-10-17T21:59:59Z"))).toBe(true);
    expect(withinTrendingWindow(UNTIL, new Date("2026-10-17T22:00:00Z"))).toBe(false);
    expect(withinTrendingWindow(UNTIL, new Date("2026-10-11T08:00:00Z"))).toBe(true);
  });
  it("uses the winter offset after the DST switch", () => {
    expect(withinTrendingWindow("2026-10-25", new Date("2026-10-25T22:59:00Z"))).toBe(true); // 23:59 CET
    expect(withinTrendingWindow("2026-10-25", new Date("2026-10-25T23:00:00Z"))).toBe(false);
  });
  it("a full ISO datetime is compared as an instant; empty = open-ended; garbage = null", () => {
    expect(withinTrendingWindow("2026-10-17T12:00:00+02:00", new Date("2026-10-17T09:59:00Z"))).toBe(true);
    expect(withinTrendingWindow("2026-10-17T12:00:00+02:00", new Date("2026-10-17T10:01:00Z"))).toBe(false);
    expect(withinTrendingWindow(undefined, new Date())).toBe(true);
    expect(withinTrendingWindow("  ", new Date())).toBe(true);
    expect(withinTrendingWindow("next friday", new Date())).toBeNull();
  });
});

describe("igAudioMode — resolveAudioMode", () => {
  const inWin = new Date("2026-10-12T10:00:00Z");
  const after = new Date("2026-10-18T06:00:00Z");
  it("defaults to library (current behaviour)", () => {
    expect(resolveAudioMode({}, inWin)).toEqual({ mode: "library", reason: "default_library" });
    expect(resolveAudioMode({ IG_AUDIO_MODE: "library" }, inWin)).toEqual({ mode: "library", reason: "env_library" });
    expect(resolveAudioMode({ IG_AUDIO_MODE: "viral" }, inWin).mode).toBe("library");
  });
  it("trending inside the window, case/space tolerant", () => {
    expect(resolveAudioMode(T, inWin)).toEqual({ mode: "trending", reason: "env_trending" });
    expect(resolveAudioMode({ ...T, IG_AUDIO_MODE: " Trending " }, inWin).mode).toBe("trending");
    expect(resolveAudioMode({ IG_AUDIO_MODE: "trending" }, inWin).mode).toBe("trending");
  });
  it("auto-reverts to library after the until date without a deploy", () => {
    expect(resolveAudioMode(T, after)).toEqual({ mode: "library", reason: "trending_window_ended" });
    expect(trendingRequested(T, after)).toBe(false);
  });
  it("invalid until -> library (fail-safe)", () => {
    expect(resolveAudioMode({ ...T, IG_AUDIO_TRENDING_UNTIL: "17.10." }, inWin)).toEqual({ mode: "library", reason: "trending_until_invalid" });
  });
  it("mute lock forces library for the rest of the test", () => {
    expect(resolveAudioMode(T, inWin, { trendingLocked: true })).toEqual({ mode: "library", reason: "muted_lock" });
    expect(trendingRequested(T, inWin)).toBe(true);
  });
  it("top N: default 5, 1..25 accepted", () => {
    expect(trendingTopN({})).toBe(5);
    expect(trendingTopN({ IG_AUDIO_TRENDING_TOP_N: "3" })).toBe(3);
    expect(trendingTopN({ IG_AUDIO_TRENDING_TOP_N: "0" })).toBe(5);
    expect(trendingTopN({ IG_AUDIO_TRENDING_TOP_N: "99" })).toBe(5);
  });
});
