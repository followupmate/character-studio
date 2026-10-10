/**
 * Phase 7 — audio mode for FB-path reels: "library" (default, unchanged behaviour: IG_AUDIO_SEARCH_QUERY
 * sound collection) or "trending" (Meta's trending music list, no search_query) for a time-boxed test.
 *
 *   IG_AUDIO_MODE=trending | library      (anything else / unset -> library)
 *   IG_AUDIO_TRENDING_UNTIL=2026-10-17    (optional; date = inclusive, Europe/Bratislava calendar day;
 *                                          a full ISO datetime is compared as an instant. Unparseable
 *                                          -> library, fail-safe. After it -> library with no deploy.)
 *   IG_AUDIO_TRENDING_TOP_N=5             (optional; pick randomly among the top N trending tracks)
 *
 * A per-character lock (feature_flags.ig_audio_trending_muted, written by the copyright sweep when a
 * trending reel comes back muted/restricted) forces library for the rest of the test.
 */
type Env = Record<string, string | undefined>;

export type AudioMode = "trending" | "library";
export type AudioModeReason =
  | "default_library"
  | "env_library"
  | "env_trending"
  | "trending_window_ended"
  | "trending_until_invalid"
  | "muted_lock";

export interface AudioModeDecision {
  mode: AudioMode;
  reason: AudioModeReason;
}

export const AUDIO_TEST_TZ = "Europe/Bratislava";

export function localDateKey(now: Date, tz: string = AUDIO_TEST_TZ): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** true while `now` is inside the trending window. undefined/empty `until` = open-ended. null = unparseable. */
export function withinTrendingWindow(until: string | undefined, now: Date, tz: string = AUDIO_TEST_TZ): boolean | null {
  const u = until?.trim();
  if (!u) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(u)) return localDateKey(now, tz) <= u;
  const t = Date.parse(u);
  if (Number.isNaN(t)) return null;
  return now.getTime() <= t;
}

export function resolveAudioMode(env: Env, now: Date = new Date(), opts: { trendingLocked?: boolean } = {}): AudioModeDecision {
  const raw = env.IG_AUDIO_MODE?.trim().toLowerCase();
  if (raw !== "trending") return { mode: "library", reason: raw === "library" ? "env_library" : "default_library" };
  const win = withinTrendingWindow(env.IG_AUDIO_TRENDING_UNTIL, now);
  if (win === null) return { mode: "library", reason: "trending_until_invalid" };
  if (!win) return { mode: "library", reason: "trending_window_ended" };
  if (opts.trendingLocked) return { mode: "library", reason: "muted_lock" };
  return { mode: "trending", reason: "env_trending" };
}

/** true when env asks for trending and the window is open — i.e. the lock is worth reading at all. */
export function trendingRequested(env: Env, now: Date = new Date()): boolean {
  return env.IG_AUDIO_MODE?.trim().toLowerCase() === "trending" && withinTrendingWindow(env.IG_AUDIO_TRENDING_UNTIL, now) === true;
}

export function trendingTopN(env: Env): number {
  const n = Number.parseInt(env.IG_AUDIO_TRENDING_TOP_N ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 25 ? n : 5;
}
