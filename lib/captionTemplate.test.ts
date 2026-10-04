import { describe, it, expect } from "vitest";
import {
  SEND_LINES,
  MAX_HASHTAGS,
  sanitizeCaption,
  normalizeHashtags,
  pickSendLine,
  appendSendLine,
  formatIgCaption,
  isBannedText,
} from "@/lib/captionTemplate";
import { VOICE_DOCTRINE, DISCOVERY_DOCTRINE } from "@/lib/storyPrompt";
import { STORY_COPY_RULES } from "@/lib/storyCopyRules";

const BANNED_SAMPLES = [
  "the rest is on fanvue",
  "find me on OnlyFans",
  "Only Fans",
  "link in bio 🔗",
  "link in my bio",
  "you only get the rest somewhere else",
  "uncut version",
  "the full set is inside",
  "full set",
  "my private page",
  "exclusive content",
  "dm me",
  "DM  me for more",
];

describe("sanitizeCaption", () => {
  it.each(BANNED_SAMPLES)("drops a line containing %j", (sample) => {
    const r = sanitizeCaption(`woke up slow.\n${sample}`);
    expect(r.text).toBe("woke up slow.");
    expect(r.removed).toEqual([sample]);
  });

  it("keeps clean captions byte-identical (apart from trim)", () => {
    const c = "the apartment gets this light for about twenty minutes.\ni wait for it every evening.";
    expect(sanitizeCaption(c)).toEqual({ text: c, removed: [] });
  });

  it("does not match banned words inside other words", () => {
    // "inside" / "private" / "rest" must be whole words
    expect(isBannedText("outsider energy, restful sunday, privateer")).toBe(false);
    expect(isBannedText("restaurant at nine")).toBe(false);
  });

  it("returns empty text when every line is banned, and handles null", () => {
    expect(sanitizeCaption("the rest is private").text).toBe("");
    expect(sanitizeCaption(null)).toEqual({ text: "", removed: [] });
    expect(sanitizeCaption(undefined).text).toBe("");
  });

  it("collapses blank runs left by removed lines", () => {
    const r = sanitizeCaption("line one\n\nuncut version\n\nline two");
    expect(r.text).toBe("line one\n\nline two");
  });
});

describe("normalizeHashtags", () => {
  it("caps at 5, strips #, dedupes case-insensitively, keeps order", () => {
    const tags = normalizeHashtags(["#OOTD", "ootd", "a", "b", "c", "d", "e", "f"]);
    expect(tags).toEqual(["OOTD", "a", "b", "c", "d"]);
    expect(tags.length).toBe(MAX_HASHTAGS);
  });

  it("drops generic, banned and empty tags BEFORE counting toward the cap", () => {
    const tags = normalizeHashtags(["reels", "fyp", "fanvue", "private", "", "  ", "loafers", "autumnoutfit"]);
    expect(tags).toEqual(["loafers", "autumnoutfit"]);
  });

  it("handles null/undefined", () => {
    expect(normalizeHashtags(null)).toEqual([]);
    expect(normalizeHashtags(undefined)).toEqual([]);
  });
});

describe("send-lines", () => {
  it("every send-line passes the banned list and has no engagement-bait", () => {
    for (const l of SEND_LINES) {
      expect(isBannedText(l), l).toBe(false);
      expect(/\b(tag \d|comment yes|follow me|like (and|&) )/i.test(l), l).toBe(false);
    }
  });

  it("is deterministic per day_number", () => {
    for (let d = 0; d < 50; d++) expect(pickSendLine(d)).toBe(pickSendLine(d));
  });

  it("fires on roughly 40% of days over a long window", () => {
    let hits = 0;
    const N = 2000;
    for (let d = 1; d <= N; d++) if (pickSendLine(d)) hits++;
    expect(hits / N).toBeGreaterThan(0.33);
    expect(hits / N).toBeLessThan(0.47);
  });

  it("uses every send-line over a long window", () => {
    const used = new Set<string>();
    for (let d = 1; d <= 500; d++) {
      const l = pickSendLine(d);
      if (l) used.add(l);
    }
    expect(used.size).toBe(SEND_LINES.length);
  });

  it("copes with null/NaN day numbers", () => {
    expect(() => pickSendLine(null)).not.toThrow();
    expect(() => pickSendLine(Number.NaN)).not.toThrow();
  });
});

describe("appendSendLine", () => {
  const dayWith = (want: boolean) => {
    for (let d = 1; d < 500; d++) if (!!pickSendLine(d) === want) return d;
    throw new Error("no day found");
  };

  it("appends the day's line as the last line", () => {
    const d = dayWith(true);
    const out = appendSendLine("one slow morning.\nthe light does the work.", d);
    expect(out.split("\n")).toHaveLength(3);
    expect(out.endsWith(pickSendLine(d)!)).toBe(true);
  });

  it("is a no-op on no-line days", () => {
    expect(appendSendLine("one slow morning.", dayWith(false))).toBe("one slow morning.");
  });

  it("never stacks a second CTA or exceeds 3 lines", () => {
    const d = dayWith(true);
    expect(appendSendLine("a\nb\nc", d)).toBe("a\nb\nc");
    expect(appendSendLine("a.\nsave this for later", d)).toBe("a.\nsave this for later");
    expect(appendSendLine("a.\nhere most days if this is your kind of quiet", d)).toBe("a.\nhere most days if this is your kind of quiet");
  });

  it("returns empty for empty input", () => {
    expect(appendSendLine("  ", 3)).toBe("");
  });
});

describe("formatIgCaption", () => {
  it("sanitizes, caps hashtags at 5 and separates with a blank line", () => {
    const out = formatIgCaption(
      "walk, stop, details.\nthe rest is on fanvue",
      ["ootd", "loafers", "autumnoutfit", "layeredneutrals", "quietluxury", "extra1", "extra2"]
    );
    expect(out).toBe("walk, stop, details.\n\n#ootd #loafers #autumnoutfit #layeredneutrals #quietluxury");
  });

  it("works with no hashtags / no caption", () => {
    expect(formatIgCaption("hello", [])).toBe("hello");
    expect(formatIgCaption(null, ["a"])).toBe("#a");
    expect(formatIgCaption(null, null)).toBe("");
  });
});

describe("prompts no longer teach the funnel", () => {
  const prompts = { VOICE_DOCTRINE, DISCOVERY_DOCTRINE, STORY_COPY_RULES };

  it("no prompt ASKS for a funnel line (examples/instructions)", () => {
    for (const [name, p] of Object.entries(prompts)) {
      expect(p, name).not.toMatch(/you only get the rest/i);
      expect(p, name).not.toMatch(/come find the rest/i);
      expect(p, name).not.toMatch(/funnels?\s+the most invested/i);
      expect(p, name).not.toMatch(/10 strings|array of 10/i);
    }
  });

  it("hashtag rule says 3 to 5", () => {
    expect(DISCOVERY_DOCTRINE).toMatch(/3 to 5/);
    expect(STORY_COPY_RULES).toMatch(/3 to 5/);
  });
});
