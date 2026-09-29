// Scheduling helpers for the publish queue — shared by /api/publish/from-batch and
// /api/review/approve so both compute scheduled_at identically.
//
// Two modes per character:
//  * posting_schedule set  -> per-weekday, per-slot LOCAL wall-clock times in posting_tz
//    (DST-safe, via Intl). A null/missing slot on a weekday means "do not post that slot".
//  * posting_schedule null -> legacy behaviour, unchanged: posting_time read as UTC
//    plus fixed offsets (carousel +0, reel +8h, story +90min).

export const DEFAULT_POSTING_TZ = "Europe/Bratislava";

export type SlotKind = "carousel" | "reel" | "story";
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DaySchedule = Partial<Record<SlotKind, string | null>>;
export type PostingSchedule = Partial<Record<WeekdayKey, DaySchedule | null>>;

export interface SchedulableCharacter {
  posting_time: string;
  posting_tz?: string | null;
  posting_schedule?: PostingSchedule | null;
}

// Legacy offsets (minutes after posting_time) — only used when posting_schedule is null.
export const LEGACY_OFFSET_MIN: Record<SlotKind, number> = { carousel: 0, reel: 8 * 60, story: 90 };

const WEEKDAYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Build the scheduled_at ISO for a post: character's posting_time on the given
// date (UTC) + offset. Never schedules into the past — pushes to "now + 1 min".
export function scheduledIso(dateStr: string, postingTime: string, offsetMinutes = 0, now: number = Date.now()): string {
  // Parse "HH:MM" (also tolerates Postgres "HH:MM:SS"). The old `h ?? 10` fallback
  // never fired: Number("") is 0, and a non-numeric value produced an Invalid Date.
  const match = /^(\d{1,2}):(\d{2})/.exec(postingTime.trim());
  const h = match && Number(match[1]) <= 23 ? Number(match[1]) : 10;
  const m = match && Number(match[2]) <= 59 ? Number(match[2]) : 0;
  const dt = new Date(`${dateStr}T00:00:00.000Z`);
  dt.setUTCHours(h, m, 0, 0);
  dt.setUTCMinutes(dt.getUTCMinutes() + offsetMinutes);
  if (dt.getTime() < now) {
    return new Date(now + 60_000).toISOString();
  }
  return dt.toISOString();
}

function validTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_POSTING_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_POSTING_TZ;
  }
}

// Offset (local wall clock minus UTC) of `tz` at the instant `utcMs`, in ms.
function tzOffsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Local wall-clock `dateStr` + "HH:MM" in `tz` -> UTC ISO. DST-safe. Never schedules into
// the past (pushes to now + 1 min). Returns null for a malformed "HH:MM".
// Ambiguous local times (autumn overlap) resolve to the first occurrence; nonexistent
// local times (spring gap) resolve to the instant just after the gap.
export function localToUtcIso(dateStr: string, hhmm: string, tz: string, now: number = Date.now()): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm).trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const zone = validTz(tz);
  const localAsUtc = Date.parse(`${dateStr}T${match[1].padStart(2, "0")}:${match[2]}:00.000Z`);
  if (Number.isNaN(localAsUtc)) return null;

  // Candidate offsets = those in force a day before / after; keep the ones that are
  // self-consistent at the instant they produce. Earliest valid instant wins (overlap).
  const DAY = 24 * 3_600_000;
  const before = tzOffsetMs(zone, localAsUtc - DAY);
  const after = tzOffsetMs(zone, localAsUtc + DAY);
  const valid = [before, after]
    .map((o) => localAsUtc - o)
    .filter((t0) => tzOffsetMs(zone, t0) === localAsUtc - t0);
  // Gap (nonexistent local time): interpret with the pre-transition offset -> just after the gap.
  const t = valid.length ? Math.min(...valid) : localAsUtc - before;
  return t < now ? new Date(now + 60_000).toISOString() : new Date(t).toISOString();
}

// Calendar date (YYYY-MM-DD) of instant `now` in `tz` — the character's LOCAL date.
export function localDateIn(tz: string | null | undefined, now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: validTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

// Weekday key of a calendar date string (YYYY-MM-DD). The date is the character's LOCAL
// calendar date (story days are keyed by it), so the weekday is that date's own weekday —
// never derived from a UTC instant, which would be off by one around local midnight.
export function weekdayKey(dateStr: string): WeekdayKey | null {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return WEEKDAYS[d.getUTCDay()];
}

// "HH:MM" for this slot on this calendar date, or null = skip that slot.
export function slotTime(schedule: PostingSchedule, dateStr: string, kind: SlotKind): string | null {
  const key = weekdayKey(dateStr);
  if (!key) return null;
  const v = schedule[key]?.[kind];
  return typeof v === "string" && /^\d{1,2}:\d{2}/.test(v.trim()) ? v.trim() : null;
}

// Single entry point used by the queueing routes.
// Returns the scheduled_at ISO, or null when the schedule says to skip this slot.
export function scheduleFor(
  char: SchedulableCharacter,
  dateStr: string,
  kind: SlotKind,
  now: number = Date.now()
): string | null {
  if (!char.posting_schedule) {
    return scheduledIso(dateStr, char.posting_time, LEGACY_OFFSET_MIN[kind], now);
  }
  const t = slotTime(char.posting_schedule, dateStr, kind);
  if (!t) return null;
  return localToUtcIso(dateStr, t, char.posting_tz ?? DEFAULT_POSTING_TZ, now);
}

// True when a select failed only because the posting_tz / posting_schedule columns don't
// exist yet (migration not run) — callers retry with the legacy column list.
export function isMissingScheduleColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return /posting_(tz|schedule)/.test(msg) && (err.code === "42703" || /column|schema cache/i.test(msg));
}
