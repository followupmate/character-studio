/**
 * Hook-text validator for the video overlay. A hook is burned into the video
 * pixels, so a typo or a missing glyph (rendered as .notdef "tofu") cannot be
 * fixed after posting. Everything here is a hard gate:
 *
 *  1. NFC normalisation, ' -> ’, "..." -> …, whitespace collapse
 *  2. Character allowlist (Latin letters, digits, basic punctuation)
 *  3. Limits: max 6 words, max 38 chars, max 2 lines (real layout w/ font metrics)
 *  4. Glyph coverage: every code point must exist in the bundled font
 *  5. Spelling: nspell + en_US Hunspell dictionary (+ small slang allowlist)
 *  6. Layout bbox inside the IG safe zone
 *
 * Banned-term check (captionTemplate.isBannedText) is applied too: the hook
 * must obey the same funnel/platform ban as the caption.
 */
import { isBannedText } from "../captionTemplate";
import {
  HOOK_SPEC,
  bboxInSafeZone,
  layoutHook,
  loadHookFont,
  type FontLike,
  type HookLayout,
} from "./hookSpec";

export type HookIssueCode =
  | "empty"
  | "too_many_words"
  | "too_long"
  | "too_many_lines"
  | "word_too_wide"
  | "disallowed_char"
  | "missing_glyph"
  | "misspelled"
  | "banned_term"
  | "outside_safe_zone";

export type HookIssue = { code: HookIssueCode; detail?: string };

export type HookValidation = {
  ok: boolean;
  /** Normalised text (what would be rendered). */
  text: string;
  issues: HookIssue[];
  layout: HookLayout | null;
};

/** Allowed characters after normalisation. */
export const HOOK_ALLOWED_CHARS = /^[A-Za-z0-9 .,!?:’—–\-%&…]*$/;

/** Slang/brand tokens that a normal en_US dictionary rejects but we accept. */
export const HOOK_WORD_ALLOWLIST: ReadonlySet<string> = new Set([
  "grwm", "ootd", "pov", "ai", "ok", "okay", "yeah", "yep", "nope", "hmm",
  "tbh", "idk", "vibes", "vibe", "hey", "hi", "wanna", "gonna", "gotta",
  "lowkey", "highkey", "rn", "fr", "tn", "gm", "xx",
]);

export function normalizeHookText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u2018\u2019\u02BC`´']/g, "\u2019")
    .replace(/\.{3,}/g, "…")
    .replace(/[\u201C\u201D"]/g, "") // quotes are not in the allowlist: strip
    .replace(/\s+/g, " ")
    .trim();
}

type Spell = { correct(word: string): boolean };

let spellPromise: Promise<Spell> | null = null;

/** Lazy, memoised en_US nspell instance (dictionary-en is ESM + top-level await). */
export function loadSpell(): Promise<Spell> {
  if (!spellPromise) {
    spellPromise = (async () => {
      const [{ default: nspell }, { default: dict }] = await Promise.all([
        import("nspell"),
        import("dictionary-en"),
      ]);
      return nspell(Buffer.from(dict.aff), Buffer.from(dict.dic)) as Spell;
    })();
  }
  return spellPromise;
}

/** Tokens to spell-check: alphabetic words, apostrophes inside words kept. */
export function spellTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z]+(?:’[A-Za-z]+)*/g)) out.push(m[0]);
  return out;
}

function wordCount(text: string): number {
  return text.split(" ").filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

export type ValidateOptions = {
  font?: FontLike;
  spell?: Spell;
  extraWords?: Iterable<string>;
};

export async function validateHookText(raw: string, opts: ValidateOptions = {}): Promise<HookValidation> {
  const text = normalizeHookText(raw);
  const issues: HookIssue[] = [];
  const add = (code: HookIssueCode, detail?: string) => issues.push({ code, detail });

  if (!text) {
    return { ok: false, text, issues: [{ code: "empty" }], layout: null };
  }

  if (text.length > HOOK_SPEC.limits.maxChars) add("too_long", `${text.length}>${HOOK_SPEC.limits.maxChars}`);
  if (wordCount(text) > HOOK_SPEC.limits.maxWords) add("too_many_words", `${wordCount(text)}>${HOOK_SPEC.limits.maxWords}`);

  if (!HOOK_ALLOWED_CHARS.test(text)) {
    const bad = [...new Set([...text].filter((c) => !HOOK_ALLOWED_CHARS.test(c)))];
    add("disallowed_char", bad.join(" "));
  }

  if (isBannedText(text)) add("banned_term");

  const font = opts.font ?? loadHookFont();

  const missing = [...new Set([...text].filter((c) => c !== " " && !font.hasGlyphForCodePoint(c.codePointAt(0)!)))];
  if (missing.length) add("missing_glyph", missing.join(" "));

  const spell = opts.spell ?? (await loadSpell());
  const extra = new Set<string>([...HOOK_WORD_ALLOWLIST, ...[...(opts.extraWords ?? [])].map((w) => w.toLowerCase())]);
  const wrong: string[] = [];
  for (const tok of spellTokens(text)) {
    const lower = tok.toLowerCase();
    if (extra.has(lower)) continue;
    const ascii = tok.replace(/’/g, "'");
    // Hunspell accepts the word as typed, or lowercase (sentence-initial caps).
    if (spell.correct(ascii) || spell.correct(lower) || spell.correct(lower.replace(/’/g, "'"))) continue;
    wrong.push(tok);
  }
  if (wrong.length) add("misspelled", wrong.join(", "));

  let layout: HookLayout | null = null;
  // Layout only if glyphs exist (otherwise measuring would use .notdef widths).
  if (!missing.length) {
    layout = layoutHook(font, text);
    if (!layout.ok) {
      add(layout.reason === "empty" ? "empty" : layout.reason);
    } else if (!bboxInSafeZone(layout.bbox)) {
      add("outside_safe_zone", JSON.stringify(layout.bbox));
    }
  }

  return { ok: issues.length === 0, text, issues, layout };
}
