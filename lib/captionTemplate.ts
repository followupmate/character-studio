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
//
// Phase 5 (2026-10-07): REEL captions always end with ONE share/send line from REEL_SHARE_LINES
// (ensureReelShareCta / formatReelCaption) — shares had been 0 for days while reels ended with
// follow-style lines. Feed (carousel) and stories keep appendSendLine()/formatIgCaption() unchanged.

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

/* ── Reel share CTA (phase 5) ─────────────────────────────────────────────── */

// Lowercase, editorial, soft, recipient-specific. Every line must pass isBannedText() and the
// sanitizer (tested), and must not contain a follow/save ask. Order matters: the rotation below
// walks this list with a step that is coprime to its length.
export const REEL_SHARE_LINES: readonly string[] = [
  "send this to the one who's still deciding.",
  "send this to your slow-morning person.",
  "for the friend who needs a quiet minute.",
  "send this to the one you'd bring here.",
  "for the friend who's always up for one more coffee.",
  "send this to the one with your kind of calm.",
  "for the one who deserves a slower day.",
  "send this to your getting-ready person.",
  "for the friend you'd share the window seat with.",
  "send this to the one who'd stay for the view.",
];

// Step 3 is coprime to 10: consecutive days never get the same line and every line is used once
// per 10-day cycle. (If the pool size changes, keep the step coprime — the test checks it.)
export const REEL_SHARE_STEP = 3;

// CTA lines removed anywhere in a reel caption (follow / save / send / share invitations), so the
// share line is never stacked on top of another ask.
const CTA_ANYWHERE: readonly RegExp[] = [
  /\bhere most days\b/i,
  /\bif you(?:'|’)?(?:ll| will)? stay\b/i,
  /\bstay for more\b/i,
  /\bmore (?:like|of) this\b/i,
  /\bstick around\b/i,
  /\bfollow (?:along|for|me|if)\b/i,
  /\b(?:send|save|share) (?:this|it)\b/i,
  /\bfor whoever\b/i,
  /\bfor the (?:friend|one) who\b/i,
  /\btag (?:a|your|someone|the)\b/i,
];
// Weaker signals, only treated as a CTA on the LAST line ("…if this is your kind of quiet.").
const CTA_LAST_LINE: readonly RegExp[] = [
  /\byour kind of\b/i,
  /\byou know where to find me\b/i,
  /\bsee you (?:tomorrow|here)\b/i,
  /\bcome back tomorrow\b/i,
];

const norm = (l: string) => l.trim().toLowerCase().replace(/[’]/g, "'");
const SHARE_LINE_SET = new Set(REEL_SHARE_LINES.map(norm));

export function isReelShareLine(line: string): boolean {
  return SHARE_LINE_SET.has(norm(line));
}

export function isCtaLine(line: string, isLast = false): boolean {
  if (CTA_ANYWHERE.some((re) => re.test(line))) return true;
  return isLast && CTA_LAST_LINE.some((re) => re.test(line));
}

/** Days since 1970-01-01 for a 'YYYY-MM-DD…' key, an integer day number, or null. */
export function dayIndexFromKey(key: string | number | null | undefined): number | null {
  if (typeof key === "number") return Number.isFinite(key) ? Math.trunc(key) : null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key ?? ""));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : null;
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone — the reel's "day" for the rotation. */
export function dateKeyInZone(iso: string | Date | null | undefined, timeZone = "Europe/Bratislava"): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Deterministic share line. With a day key (date or day number) it rotates through the pool with
 * REEL_SHARE_STEP, so two consecutive days never repeat. Without one it hashes `fallbackSalt`
 * (e.g. the post id) — stable per post.
 */
export function pickReelShareLine(dayKey: string | number | null | undefined, fallbackSalt = ""): string {
  const n = REEL_SHARE_LINES.length;
  const day = dayIndexFromKey(dayKey);
  const idx = day !== null ? (((day * REEL_SHARE_STEP) % n) + n) % n : strHash(fallbackSalt) % n;
  return REEL_SHARE_LINES[idx];
}

/**
 * Reel caption ends with exactly one share line. Idempotent: a caption that already ends with a
 * pool line is returned unchanged (so the from-batch pick survives a later post-now pass even if the
 * scheduled day differs). Any other CTA line (follow / save / send / share) is removed first — never
 * two asks. An empty caption becomes just the share line.
 */
export function ensureReelShareCta(caption: string | null | undefined, dayKey: string | number | null | undefined, fallbackSalt = ""): string {
  const lines = (caption ?? "").split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length && isReelShareLine(lines[lines.length - 1])) return lines.join("\n").trim();
  const lastIdx = lines.length - 1;
  const kept = lines.filter((l, i) => l.trim() === "" || !isCtaLine(l, i === lastIdx));
  // a weak last-line CTA can expose another weak CTA above it ("…your kind of quiet" twice) — one more pass
  while (kept.length && (kept[kept.length - 1].trim() === "" || isCtaLine(kept[kept.length - 1], true))) kept.pop();
  const body = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const line = pickReelShareLine(dayKey, fallbackSalt);
  return body ? `${body}\n${line}` : line;
}

/** Final public REEL caption: sanitize -> share line -> blank line -> up to 5 hashtags. */
export function formatReelCaption(
  caption: string | null | undefined,
  hashtags: ReadonlyArray<string> | null | undefined,
  dayKey: string | number | null | undefined,
  fallbackSalt = ""
): string {
  const { text } = sanitizeCaption(caption);
  const withCta = ensureReelShareCta(text, dayKey, fallbackSalt);
  const tags = normalizeHashtags(hashtags).map((t) => `#${t}`).join(" ");
  return [withCta, tags].filter((l) => l !== "").join("\n\n");
}

/** Final public caption: sanitized text, blank line, then up to 5 normalized hashtags. */
export function formatIgCaption(caption: string | null | undefined, hashtags: ReadonlyArray<string> | null | undefined): string {
  const { text } = sanitizeCaption(caption);
  const tags = normalizeHashtags(hashtags).map((t) => `#${t}`).join(" ");
  return [text, tags].filter((l) => l !== "").join("\n\n");
}
