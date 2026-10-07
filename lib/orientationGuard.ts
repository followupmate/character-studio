/**
 * Start-frame orientation guard (phase 5, 2026-10-07).
 *
 * Incident: the reel start frame of 7 Oct came out rotated 90° and Kling i2v copied the rotation
 * into the whole reel. The Soul prompt contained "medium shot, slight tilt" — camera-tilt language
 * reads to the image model as "rotate the frame". Same spirit as SINGLE_FRAME_LOCK
 * (lib/imagePromptCompiler.ts): remove the trigger words, add a short positive lock, and give Soul
 * an explicit negative.
 *
 * Only CAMERA / FRAME orientation is touched. Body poses stay ("slight head tilt", "seated
 * sideways", "body rotated three-quarters", "glances sideways") — they don't rotate the image.
 * Pure, no I/O.
 */

export const ORIENTATION_LOCK = "Level horizon, upright vertical 9:16 framing, camera level, subject upright.";

export const ORIENTATION_NEGATIVES: readonly string[] = [
  "rotated image",
  "sideways image",
  "tilted frame",
  "dutch angle",
  "canted horizon",
  "upside down",
];

const ADJ = String.raw`(?:(?:very\s+)?(?:slight(?:ly)?|subtle|subtly|gentle|gently|small|soft|mild|light(?:ly)?)\s+)?`;
const FRAME_NOUN = String.raw`(?:camera|frame|framing|horizon|angle|shot|composition|perspective|image|photo|picture|view|lens)`;
// Swallow a leading connector/article so "with a slight camera tilt" leaves nothing dangling.
const PRE = String.raw`(?:\b(?:with|and|plus)\s+)?(?:\b(?:an?|the)\s+)?`;
// Body parts whose tilt / rotation is a pose, not a camera move.
const NOT_AFTER_BODY = String.raw`(?<!\b(?:head|chin|neck|face|hips?|shoulders?|torso|body|pelvis|glass|cup|mug)\s)(?<!\b(?:head|chin|neck|face|hips?|shoulders?|torso|body|pelvis)\s(?:slightly|gently|subtly)\s)`;
const NOT_BEFORE_BODY = String.raw`(?!\s+(?:of\s+)?(?:the\s+|her\s+|his\s+)?(?:head|chin|neck|face|hips?|shoulders?|torso|body|glass|cup|mug)\b)`;

/** [pattern, replacement] — replacement "" removes the phrase. Order: most specific first. */
const TILT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(String.raw`${PRE}\b${ADJ}dutch[\s-]+(?:angle|tilt)s?\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\b${ADJ}canted(?:\s+${FRAME_NOUN})?\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\b${ADJ}(?:camera|frame|horizon|lens)\s+(?:is\s+)?${ADJ}tilt(?:ed|s|ing)?(?:\s+(?:slightly|gently|subtly|a\s+little))?\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\b${ADJ}tilted\s+${FRAME_NOUN}\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\b${ADJ}tilt(?:ed)?\s+(?:angle|shot|framing|composition)\b`, "gi"), ""],
  // bare "slight tilt" / "slightly tilted" (no body part around it)
  [new RegExp(String.raw`${NOT_AFTER_BODY}${PRE}\b(?:very\s+)?(?:slight(?:ly)?|subtle|subtly|gentle|gently|small|soft|mild)\s+tilt(?:ed)?\b${NOT_BEFORE_BODY}`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\b(?:angled|skewed|crooked|slanted|tilted)\s+horizon\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\boff[\s-]kilter(?:\s+${FRAME_NOUN})?\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\boblique\s+(?:angle|framing|frame|shot)\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}(?:\b${FRAME_NOUN}\s+)?\brotated\s+(?:by\s+)?\d+\s*(?:°|degrees?|deg)\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\brotated\s+${FRAME_NOUN}\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\b(?:camera|frame|image|photo|picture|view)\s+(?:is\s+)?rotated\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\bsideways\s+(?:frame|framing|shot|composition|orientation|image|photo|picture|camera|view)\b`, "gi"), ""],
  [new RegExp(String.raw`${PRE}\b(?:camera|frame|image|photo|picture)\s+(?:turned\s+|held\s+)?sideways\b`, "gi"), ""],
  [/\bon\s+its\s+side\b/gi, ""],
  [/\b(?:landscape|horizontal)\s+(?:orientation|format|frame|framing)\b/gi, ""],
  // a person lying sideways is a valid pose, but the phrase primes a 90° frame — say it upright
  [/\blying\s+sideways\b/gi, "reclining"],
  [/\blies\s+sideways\b/gi, "reclines"],
];

/** Tidy separators left behind by removed phrases. */
function tidy(s: string): string {
  return s
    .replace(/\(\s*[,;]?\s*\)/g, "")
    .replace(/[ \t]+([,.;:])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/(^|\n)\s*[,;:]\s*/g, "$1")
    .replace(/[,;:]\s*\./g, ".")
    .replace(/\.\s*,/g, ".")
    .replace(/\b(?:with|and|in|at)\s*([,.])/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[,;:]\s*$/g, "")
    .trim();
}

export interface TiltStripResult {
  text: string;
  removed: string[];
}

export function stripTiltPhrasing(text: string | null | undefined): TiltStripResult {
  let out = text ?? "";
  const removed: string[] = [];
  for (const [re, rep] of TILT_RULES) {
    out = out.replace(re, (m) => {
      removed.push(m.trim());
      return rep;
    });
  }
  return { text: removed.length ? tidy(out) : out, removed };
}

const HAS_LOCK = /\blevel horizon\b/i;

/** Strip tilt phrasing and append ORIENTATION_LOCK once (idempotent). */
export function applyOrientationGuard(prompt: string): { prompt: string; removed: string[] } {
  const { text, removed } = stripTiltPhrasing(prompt);
  const base = text.trim();
  if (HAS_LOCK.test(base)) return { prompt: base, removed };
  if (!base) return { prompt: ORIENTATION_LOCK, removed };
  const sep = /[.!?]$/.test(base) ? " " : ". ";
  return { prompt: `${base}${sep}${ORIENTATION_LOCK}`, removed };
}

/** Comma-joined negatives with the orientation negatives appended (no duplicates). */
export function withOrientationNegatives(negatives: string | null | undefined): string {
  const have = (negatives ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const lower = new Set(have.map((x) => x.toLowerCase()));
  for (const n of ORIENTATION_NEGATIVES) if (!lower.has(n)) have.push(n);
  return have.join(", ");
}

/** Image slots that feed Kling i2v as the reel's first frame. */
export function needsOrientationGuard(m: { slot?: string | null; channel?: string | null; type?: string | null }): boolean {
  if (m.slot === "reel_start_frame") return true;
  return !m.slot && m.channel === "reel" && m.type === "photo";
}
