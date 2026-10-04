/**
 * Hook-overlay spec + deterministic text layout (pure, no I/O besides the
 * font file loaded by the caller).
 *
 * Canvas = IG Reels 1080x1920. Safe zone per IG UI chrome: top 269 px,
 * bottom 672 px, sides 65 px (right side kept wider because of the action
 * rail). The hook is a short editorial line (Cormorant Garamond Medium
 * Italic, ivory) placed in the upper third, inside the safe zone.
 */
import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";

export type FontLike = {
  unitsPerEm: number;
  hasGlyphForCodePoint(cp: number): boolean;
  layout(str: string): {
    glyphs: Array<{
      id: number;
      path: { toSVG(): string; transform(...m: number[]): unknown; commands: unknown[] };
    }>;
    positions: Array<{ xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }>;
  };
};

export const HOOK_SPEC = {
  canvas: { w: 1080, h: 1920 },
  /** IG safe zone (px). Right is the inner edge of the safe area (1080-140). */
  safe: { left: 65, right: 940, top: 269, bottom: 1248 },
  fontFile: "CormorantGaramond-MediumItalic-latin.woff",
  fontSizePx: 80,
  letterSpacingEm: 0.02,
  lineHeight: 1.14,
  /** Max line width in px; centred inside the safe zone. */
  maxLineWidthPx: 780,
  /** Baseline Y of the first line. */
  firstBaselineY: 440,
  color: "#F5F0E6",
  scrim: { height: 620, opacityTop: 0.42 },
  timing: { fadeIn: 0.25, fadeOutStart: 2.85, fadeOut: 0.35, total: 3.2 },
  limits: { maxWords: 6, maxChars: 38, maxLines: 2 },
} as const;

let cachedFont: FontLike | null = null;

export function defaultFontPath(): string {
  return path.join(process.cwd(), "lib", "video", "fonts", HOOK_SPEC.fontFile);
}

/** Load (and memoise) the bundled Cormorant Garamond Medium Italic. */
export function loadHookFont(fontPath: string = defaultFontPath()): FontLike {
  if (cachedFont && fontPath === defaultFontPath()) return cachedFont;
  const f = fontkit.create(fs.readFileSync(fontPath)) as unknown as FontLike;
  if (fontPath === defaultFontPath()) cachedFont = f;
  return f;
}

export type PlacedGlyph = { d: string };
export type LayoutLine = {
  text: string;
  /** Rendered width in px (incl. tracking). */
  width: number;
  /** Left X so that the line is centred on the canvas. */
  x: number;
  baselineY: number;
};
export type HookLayout =
  | {
      ok: true;
      lines: LayoutLine[];
      fontSizePx: number;
      bbox: { left: number; top: number; right: number; bottom: number };
    }
  | { ok: false; reason: "word_too_wide" | "too_many_lines" | "empty" };

/** Width (px) of a string incl. tracking (applied between glyphs). */
export function measureText(
  font: FontLike,
  text: string,
  sizePx: number = HOOK_SPEC.fontSizePx,
  letterSpacingEm: number = HOOK_SPEC.letterSpacingEm,
): number {
  const run = font.layout(text);
  const scale = sizePx / font.unitsPerEm;
  let w = 0;
  for (const p of run.positions) w += p.xAdvance * scale;
  return w + Math.max(0, run.glyphs.length - 1) * letterSpacingEm * sizePx;
}

/**
 * Wrap into at most `maxLines` lines. Balanced: among all split points that
 * fit, pick the one with the smallest widest-line (editorial look, no orphans).
 */
export function wrapHook(
  font: FontLike,
  text: string,
  maxWidth: number = HOOK_SPEC.maxLineWidthPx,
  maxLines: number = HOOK_SPEC.limits.maxLines,
): string[] | "word_too_wide" | "too_many_lines" | "empty" {
  const words = text.split(" ").filter(Boolean);
  if (!words.length) return "empty";
  if (words.some((w) => measureText(font, w) > maxWidth)) return "word_too_wide";
  if (measureText(font, words.join(" ")) <= maxWidth) return [words.join(" ")];
  if (maxLines < 2) return "too_many_lines";
  let best: { lines: string[]; widest: number } | null = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(" ");
    const b = words.slice(k).join(" ");
    const wa = measureText(font, a);
    const wb = measureText(font, b);
    if (wa > maxWidth || wb > maxWidth) continue;
    const widest = Math.max(wa, wb);
    if (!best || widest < best.widest) best = { lines: [a, b], widest };
  }
  return best ? best.lines : "too_many_lines";
}

export function layoutHook(font: FontLike, text: string): HookLayout {
  const wrapped = wrapHook(font, text);
  if (typeof wrapped === "string") return { ok: false, reason: wrapped };
  const size = HOOK_SPEC.fontSizePx;
  const cx = HOOK_SPEC.canvas.w / 2;
  const lines: LayoutLine[] = wrapped.map((t, i) => {
    const width = measureText(font, t);
    return {
      text: t,
      width,
      x: cx - width / 2,
      baselineY: HOOK_SPEC.firstBaselineY + i * size * HOOK_SPEC.lineHeight,
    };
  });
  const left = Math.min(...lines.map((l) => l.x));
  const right = Math.max(...lines.map((l) => l.x + l.width));
  // cap-height/descender approximations: ascent ~0.75em, descent ~0.25em
  const top = lines[0].baselineY - size * 0.75;
  const bottom = lines[lines.length - 1].baselineY + size * 0.25;
  return { ok: true, lines, fontSizePx: size, bbox: { left, top, right, bottom } };
}

/** Is the layout bbox inside the IG safe zone? */
export function bboxInSafeZone(b: { left: number; top: number; right: number; bottom: number }): boolean {
  const s = HOOK_SPEC.safe;
  return b.left >= s.left && b.right <= s.right && b.top >= s.top && b.bottom <= s.bottom;
}

/** SVG path data (single `d`) for one line: glyph outlines, tracked + kerned. */
export function linePathData(font: FontLike, line: LayoutLine, sizePx: number = HOOK_SPEC.fontSizePx): string {
  const run = font.layout(line.text);
  const s = sizePx / font.unitsPerEm;
  const track = HOOK_SPEC.letterSpacingEm * sizePx;
  let pen = line.x;
  const ds: string[] = [];
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const ox = pen + pos.xOffset * s;
    const oy = line.baselineY - pos.yOffset * s;
    // font units are y-up; flip + scale + translate
    const clone = g.path as unknown as { transform(...m: number[]): { toSVG(): string } };
    const transformed = clone.transform(s, 0, 0, -s, ox, oy);
    const d = transformed.toSVG();
    if (d) ds.push(d);
    pen += pos.xAdvance * s + track;
  });
  return ds.join(" ");
}
