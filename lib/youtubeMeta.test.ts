import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: vi.fn() } } }));

import { buildYouTubeMeta, cleanCaptionLines, clampTitle, placeFromLocation, YT_TITLE_MAX } from "./youtubeMeta";
import { youtubeScheduleFor } from "./publishTime";

describe("buildYouTubeMeta", () => {
  it("uses the caption hook as title instead of name + date", () => {
    const m = buildYouTubeMeta({
      name: "Vivienne",
      caption: "heading out… the blazer finally earned its keep\nsave this for the days you can't decide what to wear",
      hashtags: ["workdaymood", "blazerstyle", "morningroutine", "cozyhome"],
      location: "her living room by the window (her own home)",
      homeCity: "Barcelona",
    });
    expect(m.title).toBe("Heading out… the blazer finally earned its keep");
    expect(m.title).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // IG-only CTA dropped
    expect(m.description).not.toMatch(/save this/i);
    expect(m.description).toMatch(/#shorts #workdaymood #blazerstyle #morningroutine$/);
    expect(m.description).not.toMatch(/#cozyhome/);
    expect(m.tags.slice(0, 2)).toEqual(["Vivienne", "Barcelona"]);
    expect(m.tags).toContain("workdaymood");
  });

  it("pads a one-word hook with the place or the name", () => {
    expect(buildYouTubeMeta({ name: "Vivienne", caption: "meow.\nfelt cute", hashtags: [] }).title).toBe("Meow — Vivienne");
    expect(
      buildYouTubeMeta({ name: "Vivienne", caption: "meow.", hashtags: [], location: "a rooftop in Lisbon" }).title
    ).toBe("Meow — Lisbon");
  });

  it("never titles a Short with a flirt-bait question and drops comment-bait lines", () => {
    const m = buildYouTubeMeta({
      name: "Vivienne",
      caption: "8k run today... would you rub them for me?\npost run, the couch won.\ncomment YES 🤍",
      hashtags: ["postrun"],
    });
    expect(m.title).toBe("Post run, the couch won.");
    expect(m.description).not.toMatch(/comment YES/);
    expect(m.description).toMatch(/would you rub them/); // body keeps the caption itself
  });

  it("falls back when the caption is empty", () => {
    expect(buildYouTubeMeta({ name: "Vivienne", caption: null, hashtags: null }).title).toBe("A day with Vivienne");
  });

  it("keeps tags under YouTube's 500-char limit", () => {
    const many = Array.from({ length: 80 }, (_, i) => `hashtagnumber${i}`);
    const { tags } = buildYouTubeMeta({ name: "V", caption: "x", hashtags: many });
    const cost = tags.reduce((s, t) => s + t.length + (t.includes(" ") ? 2 : 0) + 1, 0);
    expect(cost).toBeLessThanOrEqual(500);
  });
});

describe("helpers", () => {
  it("strips IG-only lines", () => {
    expect(cleanCaptionLines("a\n\nsend this to the friend who's late\nlink in bio 🔗\n#a #b\nb")).toEqual(["a", "b"]);
  });
  it("clamps on a word boundary and drops angle brackets", () => {
    const t = clampTitle("word ".repeat(30) + "<end>");
    expect(t.length).toBeLessThanOrEqual(YT_TITLE_MAX);
    expect(t.endsWith(" ")).toBe(false);
    expect(clampTitle("a <b> c")).toBe("a b c");
  });
  it("finds a known place, ignores generic rooms", () => {
    expect(placeFromLocation("El Born courtyard café, Barcelona")).toBe("Barcelona");
    expect(placeFromLocation("her bedroom, white linen (her own home)")).toBeNull();
  });
});

describe("youtubeScheduleFor", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const schedule = { fri: { reel: "15:30" }, sat: { reel: "15:30", yt_reel: "19:00" }, sun: { reel: null } };
  const char = { posting_time: "06:00", posting_tz: "Europe/Bratislava", posting_schedule: schedule };

  it("defaults to 3h after the IG reel", () => {
    // Fri 2026-11-13 15:30 CET = 14:30Z -> +3h
    expect(youtubeScheduleFor(char, "2026-11-13", now)).toBe("2026-11-13T17:30:00.000Z");
  });
  it("honours an explicit yt_reel slot", () => {
    expect(youtubeScheduleFor(char, "2026-11-14", now)).toBe("2026-11-14T18:00:00.000Z");
  });
  it("skips when the reel is skipped", () => {
    expect(youtubeScheduleFor(char, "2026-11-15", now)).toBeNull();
  });
});
