import { describe, it, expect } from "vitest";
import {
  normalizeHookText,
  spellTokens,
  validateHookText,
  HOOK_ALLOWED_CHARS,
} from "./hookTextValidator";
import { loadHookFont } from "./hookSpec";

describe("normalizeHookText", () => {
  it("NFC-normalises decomposed characters", () => {
    expect(normalizeHookText("cafe\u0301")).toBe("caf\u00e9");
  });
  it("converts straight/curly/backtick apostrophes to ’", () => {
    expect(normalizeHookText("you'd")).toBe("you\u2019d");
    expect(normalizeHookText("you\u2018d")).toBe("you\u2019d");
    expect(normalizeHookText("you`d")).toBe("you\u2019d");
  });
  it("collapses whitespace, ellipsis dots and strips double quotes", () => {
    expect(normalizeHookText('  hi   "there"... ')).toBe("hi there…");
  });
});

describe("spellTokens", () => {
  it("keeps contractions together and ignores digits/punctuation", () => {
    expect(spellTokens("you\u2019d stay, 3 am!")).toEqual(["you\u2019d", "stay", "am"]);
  });
});

describe("HOOK_ALLOWED_CHARS", () => {
  it("accepts basic punctuation and rejects emoji / arrows / hashtags", () => {
    expect(HOOK_ALLOWED_CHARS.test("Hello, you\u2019re late — 100%!")).toBe(true);
    expect(HOOK_ALLOWED_CHARS.test("go \u2192 now")).toBe(false);
    expect(HOOK_ALLOWED_CHARS.test("#tag")).toBe(false);
    expect(HOOK_ALLOWED_CHARS.test("hi \u{1F602}")).toBe(false);
  });
});

describe("validateHookText", () => {
  const font = loadHookFont();
  const codes = async (t: string) => (await validateHookText(t, { font })).issues.map((i) => i.code);

  it("accepts a clean short hook and returns normalised text + 1-line layout", async () => {
    const v = await validateHookText("Tell me you'd stay", { font });
    expect(v.ok).toBe(true);
    expect(v.text).toBe("Tell me you\u2019d stay");
    expect(v.layout && v.layout.ok && v.layout.lines.length).toBe(1);
  });

  it("accepts exactly 6 words / <=38 chars on two lines inside the safe zone", async () => {
    const v = await validateHookText("Slow mornings, quiet city lights", { font });
    expect(v.ok).toBe(true);
    expect(v.layout && v.layout.ok && v.layout.lines.length).toBeLessThanOrEqual(2);
  });

  it("rejects empty", async () => {
    expect(await codes("   ")).toEqual(["empty"]);
  });

  it("rejects >6 words", async () => {
    expect(await codes("one two three four five six seven")).toContain("too_many_words");
  });

  it("rejects >38 chars", async () => {
    expect(await codes("Extraordinarily thoughtful tomorrow evenings")).toContain("too_long");
  });

  it("rejects disallowed chars and missing glyphs (arrow is not in the font)", async () => {
    const c = await codes("go \u2192 now");
    expect(c).toContain("disallowed_char");
    expect(c).toContain("missing_glyph");
  });

  it("rejects typos via the dictionary", async () => {
    const v = await validateHookText("Tell me you wuld stay", { font });
    expect(v.ok).toBe(false);
    expect(v.issues.find((i) => i.code === "misspelled")?.detail).toContain("wuld");
  });

  it("accepts allowlisted slang (grwm) and caller extraWords", async () => {
    expect((await validateHookText("grwm for tonight", { font })).ok).toBe(true);
    expect((await validateHookText("Zyrtex says hi", { font })).ok).toBe(false);
    expect((await validateHookText("Zyrtex says hi", { font, extraWords: ["zyrtex"] })).ok).toBe(true);
  });

  it("rejects banned funnel/platform terms (same ban as captions)", async () => {
    expect(await codes("Link in bio")).toContain("banned_term");
    expect(await codes("The rest is private")).toContain("banned_term");
  });

  it("rejects text that cannot fit in 2 lines", async () => {
    const v = await validateHookText("Wonderful wonderful wonderful wonderful", { font });
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => ["too_many_lines", "word_too_wide", "too_long"].includes(i.code))).toBe(true);
  });

  it("is deterministic", async () => {
    const a = await validateHookText("Slow mornings, quiet city", { font });
    const b = await validateHookText("Slow mornings, quiet city", { font });
    expect(a).toEqual(b);
  });
});
