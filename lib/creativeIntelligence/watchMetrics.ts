// RECOVERY follow-up — watch-retention metrics.
//
// `ig_reels_avg_watch_time` alone cannot tell you whether a reel held attention: 2.9s on a 5.2s
// video and 2.9s on a 10s video are completely different outcomes. This module adds the two
// derived numbers that make it readable, plus the raw total-watch-time metric they sit alongside.
//
// COLLECT AND DISPLAY ONLY. Nothing here feeds lib/growthScore.ts's calculateGrowthScore() or any
// selection path — see watchMetrics.test.ts, which asserts the growth score is bit-for-bit
// unchanged when these keys are present.

/** Keys written into chs_posts.engagement (jsonb — no DDL). */
export const WATCH_METRIC_KEYS = {
  /** raw, from ig_reels_video_view_total_time (ms -> s) */
  totalWatchTime: "video_view_total_time_sec",
  /** derived: measured from the PUBLISHED reel file, not from what we asked the provider for */
  actualDuration: "actual_video_duration_sec",
  /** derived: avg_watch_time_sec / actual_video_duration_sec */
  watchRatio: "avg_watch_ratio",
  /** set only when the ratio genuinely exceeds 1, so it is visible rather than silently clamped */
  ratioExceedsOne: "avg_watch_ratio_exceeds_one",
} as const;

export interface WatchMetricsInput {
  avgWatchTimeSec?: number;
  totalWatchTimeSec?: number;
  actualDurationSec?: number | null;
}

export interface DerivedWatchMetrics {
  actual_video_duration_sec?: number;
  avg_watch_ratio?: number;
  avg_watch_ratio_exceeds_one?: boolean;
}

/**
 * Validation contract, in the order the rules were given:
 *
 *  - duration > 0 — a zero, negative, non-finite or absent duration produces NO ratio at all
 *    rather than a division artefact.
 *  - a missing metric is NOT zero — every field is omitted when its input is absent, so
 *    "never measured" stays distinguishable from "measured as zero" all the way into the jsonb.
 *  - the ratio is NOT clamped. `ig_reels_avg_watch_time` is averaged over REACHING ACCOUNTS, not
 *    over plays: across all 24 published reels, total_watch_time / avg_watch_time reproduces
 *    `reach` (Day 89: 398.5/2.52 = 158 = reach exactly; Day 80: 579.2/2.40 = 241 vs reach 244).
 *    An account that replays the reel therefore pushes its own average above the video's length,
 *    so a ratio above 1 is semantically REAL, not an error to be clipped. It is flagged instead.
 *    Observed range on this account: 0.296 – 0.783, no sample above 1 yet.
 */
export function deriveWatchMetrics(input: WatchMetricsInput): DerivedWatchMetrics {
  const out: DerivedWatchMetrics = {};

  const duration = input.actualDurationSec;
  if (duration === undefined || duration === null || !Number.isFinite(duration) || duration <= 0) {
    return out; // no duration -> no derived fields at all, and no zero standing in for one
  }
  out.actual_video_duration_sec = Math.round(duration * 100) / 100;

  const watch = input.avgWatchTimeSec;
  if (watch === undefined || !Number.isFinite(watch)) return out;

  const ratio = watch / duration;
  if (!Number.isFinite(ratio)) return out;
  out.avg_watch_ratio = Math.round(ratio * 1000) / 1000;
  if (ratio > 1) out.avg_watch_ratio_exceeds_one = true;

  return out;
}

/** ms -> s, preserving "absent" as undefined rather than collapsing it to 0. */
export function msToSec(ms: number | undefined): number | undefined {
  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  return ms / 1000;
}

export interface WatchSummaryRow {
  avg_watch_time_sec?: number | null;
  video_view_total_time_sec?: number | null;
  actual_video_duration_sec?: number | null;
  avg_watch_ratio?: number | null;
}

/** One-line rendering for the analytics / eval report. Never prints a missing value as 0. */
export function formatWatchSummary(row: WatchSummaryRow): string {
  const n = (v: number | null | undefined, digits: number, suffix = "") =>
    v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}${suffix}`;
  return (
    `watch ${n(row.avg_watch_time_sec, 2, "s")} / ` +
    `dur ${n(row.actual_video_duration_sec, 2, "s")} = ` +
    `ratio ${n(row.avg_watch_ratio, 3)} · ` +
    `total watch ${n(row.video_view_total_time_sec, 1, "s")}`
  );
}
