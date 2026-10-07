import { describe, it, expect } from "vitest";
import {
  REEL_SHARE_LINES,
  REEL_SHARE_STEP,
  MAX_HASHTAGS,
  dateKeyInZone,
  dayIndexFromKey,
  ensureReelShareCta,
  formatIgCaption,
  formatReelCaption,
  isBannedText,
  isCtaLine,
  isReelShareLine,
  pickReelShareLine,
  sanitizeCaption,
} from "@/lib/captionTemplate";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("REEL_SHARE_LINES pool", () => {
  it("has 8-12 unique, short, lowercase lines ending with a period", () => {
    expect(REEL_SHARE_LINES.length).toBeGreaterThanOrEqual(8);
    expect(REEL_SHARE_LINES.length).toBeLessThanOrEqual(12);
    expect(new Set(REEL_SHARE_LINES).size).toBe(REEL_SHARE_LINES.length);
    for (const l of REEL_SHARE_LINES) {
      expect(l).toBe(l.toLowerCase());
      expect(l.endsWith(".")).toBe(true);
      expect(l.split(" ").length).toBeLessThanOrEqual(10);
      expect(l.length).toBeLessThanOrEqual(55);
    }
  });

  it("every line is a send/share line and passes the banned list + sanitizer", () => {
    for (const l of REEL_SHARE_LINES) {
      expect(l).toMatch(/^(send this to|for the (friend|one))/);
      expect(isBannedText(l), l).toBe(false);
      expect(sanitizeCaption(l)).toEqual({ text: l, removed: [] });
      expect(l).not.toMatch(/\b(follow|save|link|bio|dm|fanvue|onlyfans|private|exclusive|inside|tag|comment)\b/i);
    }
  });

  it("the rotation step is coprime to the pool size (full cycle, no back-to-back repeat)", () => {
    expect(gcd(REEL_SHARE_STEP, REEL_SHARE_LINES.length)).toBe(1);
  });
});

describe("pickReelShareLine", () => {
  it("is deterministic per day and never repeats on consecutive days (120 days)", () => {
    expect(pickReelShareLine("2026-10-07")).toBe(pickReelShareLine("2026-10-07"));
    let prev = "";
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const l = pickReelShareLine(addDays("2026-10-01", i));
      expect(l).not.toBe(prev);
      prev = l;
      if (i < REEL_SHARE_LINES.length) seen.add(l);
    }
    expect(seen.size).toBe(REEL_SHARE_LINES.length); // every line once per cycle
  });

  it("accepts ISO timestamps / day numbers; falls back to a stable hash of the salt", () => {
    expect(pickReelShareLine("2026-10-07T18:00:00+02:00")).toBe(pickReelShareLine("2026-10-07"));
    expect(dayIndexFromKey("2026-10-07")).toBe(20733);
    expect(REEL_SHARE_LINES).toContain(pickReelShareLine(87));
    expect(pickReelShareLine(null, "post-a")).toBe(pickReelShareLine(undefined, "post-a"));
    expect(REEL_SHARE_LINES).toContain(pickReelShareLine("garbage", "x"));
  });

  it("dateKeyInZone uses the Bratislava calendar day", () => {
    expect(dateKeyInZone("2026-10-07T22:30:00Z")).toBe("2026-10-08"); // 00:30 CEST
    expect(dateKeyInZone("2026-10-07T10:00:00Z")).toBe("2026-10-07");
    expect(dateKeyInZone(null)).toBeNull();
    expect(dateKeyInZone("nope")).toBeNull();
  });
});

describe("ensureReelShareCta", () => {
  const day = "2026-10-07";
  const line = pickReelShareLine(day);

  it("replaces a trailing follow-CTA (today's real caption)", () => {
    const before = "terrace, coffee, the fit for the day.\nolive trees doing most of the work.\nhere most days if this is your kind of quiet.";
    const after = ensureReelShareCta(before, day);
    expect(after).toBe(`terrace, coffee, the fit for the day.\nolive trees doing most of the work.\n${line}`);
    expect(after).not.toMatch(/here most days/);
  });

  it.each([
    "more like this if you stay",
    "save this for your next slow weekend",
    "send this to the friend who never knows what to wear",
    "stick around.",
    "follow along for more mornings like this",
    "you know where to find me.",
  ])("replaces trailing CTA %j and never stacks two asks", (cta) => {
    const out = ensureReelShareCta(`slow start.\n${cta}`, day);
    expect(out).toBe(`slow start.\n${line}`);
    expect(out.split("\n").filter((l) => isCtaLine(l, true))).toEqual([line]);
  });

  it("removes a CTA that is not on the last line too", () => {
    expect(ensureReelShareCta("first light.\nhere most days if this is your kind of quiet.\nthe coffee went cold.", day)).toBe(
      `first light.\nthe coffee went cold.\n${line}`
    );
  });

  it("only treats 'your kind of' as a CTA on the last line", () => {
    expect(ensureReelShareCta("not your kind of party, mine.\nstill here at noon.", day)).toBe(`not your kind of party, mine.\nstill here at noon.\n${line}`);
  });

  it("appends to a caption with no CTA, keeps body lines", () => {
    expect(ensureReelShareCta("one take.\nthe light did the rest of it", day)).toBe(`one take.\nthe light did the rest of it\n${line}`);
  });

  it("is idempotent and keeps an existing pool line (even from another day)", () => {
    const once = ensureReelShareCta("slow start.", day);
    expect(ensureReelShareCta(once, day)).toBe(once);
    expect(ensureReelShareCta(once, "2026-10-08")).toBe(once);
    expect(isReelShareLine(once.split("\n").pop()!)).toBe(true);
  });

  it("empty caption becomes just the share line", () => {
    expect(ensureReelShareCta("", day)).toBe(line);
    expect(ensureReelShareCta(null, day)).toBe(line);
    expect(ensureReelShareCta("here most days if this is your kind of quiet.", day)).toBe(line);
  });
});

describe("formatReelCaption vs formatIgCaption", () => {
  const day = "2026-10-07";
  const tags = ["ootd", "#ootd", "fyp", "olivetrees", "terracemorning", "quietluxury", "linen", "extra"];

  it("reel: sanitized, share line last, max 5 hashtags", () => {
    const out = formatReelCaption("the fit, one take.\nthe rest is on fanvue\nhere most days if this is your kind of quiet.", tags, day);
    const [text, hashtagLine] = out.split("\n\n");
    expect(text).toBe(`the fit, one take.\n${pickReelShareLine(day)}`);
    expect(hashtagLine.split(" ")).toHaveLength(MAX_HASHTAGS);
    expect(hashtagLine).toBe("#ootd #olivetrees #terracemorning #quietluxury #linen");
  });

  it("feed/story formatter is unchanged (keeps the follow line, no share line added)", () => {
    const c = "the fit, one take.\nhere most days if this is your kind of quiet.";
    expect(formatIgCaption(c, ["ootd"])).toBe(`${c}\n\n#ootd`);
  });
});
