// Caption template + sanitizer for public Instagram captions (phase 1, 2026-10).
//
// Pure, no I/O. Three jobs:
//   1. appendSendLine(): deterministic (by day_number) soft "send/save" line on ~40% of days.
//      It is recipient-specific and never an engagement-bait instruction ("tag 3", "comment YES").
//   2. sanitizeCaption(): the public caption must NEVER mention the paid funnel. Lines that match the
//      banned list are dropped (a defense-in-depth layer on top of the prompt rules and the removal of
//      the ig_cta append in app/api/publish/from-batch/route.ts).
//   3. normalizeHashtags()/formatIgCaption(): Instagram caps a post at 5 hashtags (Dec 2025), so we
//      dedupe, strip '#', drop banned/generic tags and slice to MAX_HASHTAGS.
//
// The funnel to Fanvue lives in the bio link and manual Stories only — never in the caption.

export const MAX_HASHTAGS = 5;
export const SEND_LINE_RATE = 0.4; // ~40% of days

export const SEND_LINES: readonly string[] = [
  "send this to the friend who's always five minutes away",
  "save this for the days you can't decide what to wear",
  "for whoever needs a slow sunday",
  "more of this most mornings",
  "send this to the friend who never knows what to wear",
  "save this for your next slow weekend",
];

// Word-boundary, case-insensitive. Order is irrelevant; any hit removes the line.
export const BANNED_CAPTION_PATTERNS: readonly RegExp[] = [
  /\bfan\s?vue\b/i,
  /\bonly\s?fans\b/i,
  /\blink\s+in\s+(?:my\s+)?bio\b/i,
  /\bsomewhere\s+else\b/i,
  /\bthe\s+rest\b/i,
  /\buncut\b/i,
  /\binside\b/i,
  /\bfull\s+set\b/i,
  /\bprivate\b/i,
  /\bexclusive\b/i,
  /\bdm\s+me\b/i,
];

// Hashtags that add nothing (Instagram says generic tags hurt) — dropped, never counted toward the 5.
const GENERIC_HASHTAGS = new Set(["reels", "reel", "explore", "explorepage", "fyp", "foryou", "foryoupage", "viral", "trending", "instagood", "follow", "followme", "like4like"]);

export function isBannedText(text: string): boolean {
  return BANNED_CAPTION_PATTERNS.some((re) => re.test(text));
}

export interface SanitizeResult {
  text: string;
  removed: string[];
}

/** Drops every line that matches the banned list. Never rewrites words inside a kept line. */
export function sanitizeCaption(caption: string | null | undefined): SanitizeResult {
  const removed: string[] = [];
  const kept: string[] = [];
  for (const line of (caption ?? "").split(/\r?\n/)) {
    if (line.trim() !== "" && isBannedText(line)) {
      removed.push(line.trim());
      continue;
    }
    kept.push(line);
  }
  // collapse blank-line runs left behind by removed lines, trim the ends
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, removed };
}

export function normalizeHashtags(tags: ReadonlyArray<string> | null | undefined, max = MAX_HASHTAGS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const tag = String(raw ?? "").replace(/^#+/, "").replace(/\s+/g, "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key) || GENERIC_HASHTAGS.has(key) || isBannedText(tag)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

// Small integer hash (Knuth multiplicative) — stable across runs/platforms, no RNG.
function hash(n: number, salt: number): number {
  const x = Math.imul((Math.trunc(n) ^ Math.imul(salt, 0x9e3779b1)) | 0, 2654435761) >>> 0;
  return x;
}

/** Deterministic: same day_number → same answer. Returns null on the ~60% of days with no send-line. */
export function pickSendLine(dayNumber: number | null | undefined): string | null {
  const n = Number.isFinite(dayNumber) ? Math.trunc(dayNumber as number) : 0;
  if (hash(n, 1) % 100 >= SEND_LINE_RATE * 100) return null;
  return SEND_LINES[hash(n, 2) % SEND_LINES.length];
}

const ALREADY_HAS_INVITE = /\b(send this|save this|save it|for whoever|for the friend|more of this|more like this|here most days|if you stay)\b/i;

/**
 * Adds the day's send-line (if any) as the last caption line. Skipped when the caption already has
 * 3+ lines or already contains a send/save/follow invitation — never stack two CTAs.
 */
export function appendSendLine(caption: string, dayNumber: number | null | undefined): string {
  const base = caption.trim();
  if (!base) return base;
  if (base.split(/\r?\n/).filter((l) => l.trim() !== "").length >= 3) return base;
  if (ALREADY_HAS_INVITE.test(base)) return base;
  const line = pickSendLine(dayNumber);
  return line ? `${base}\n${line}` : base;
}

/** Final public caption: sanitized text, blank line, then up to 5 normalized hashtags. */
export function formatIgCaption(caption: string | null | undefined, hashtags: ReadonlyArray<string> | null | undefined): string {
  const { text } = sanitizeCaption(caption);
  const tags = normalizeHashtags(hashtags).map((t) => `#${t}`).join(" ");
  return [text, tags].filter((l) => l !== "").join("\n\n");
}
