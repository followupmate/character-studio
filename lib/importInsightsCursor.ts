// Pure batch/cursor logic for /api/publish/import-insights — split out from the route so it's
// testable without a live Supabase connection. The route owns all I/O; this module only decides
// *where to resume* and *how to filter the next batch*.
//
// Why this exists: cron-job.org (the external scheduler hitting this endpoint) has a hard 30s
// client timeout. A 90-day backfill can span hundreds of posts, far more than fit in one
// sequential IG API pass under 30s. Instead of a one-shot long-running call, each request
// processes one small batch and persists a cursor (chs_import_insights_cursor) so the next call
// — same plain URL, no state the caller needs to know — picks up exactly where the last one
// left off. Newest posts are processed first (a fresh Reel's numbers matter more than a
// 89-day-old post's), and when the cursor reaches the end of the window the cycle is marked
// complete; the next call after that starts a fresh cycle from the newest post again.

export const DEFAULT_BATCH_SIZE = 20;
export const MAX_BATCH_SIZE = 50;

export interface CursorRow {
  window_days: number;
  cursor_posted_at: string | null;
  cursor_post_id: string | null;
  cycle_started_at: string;
  cycle_complete: boolean;
}

export interface CycleState {
  cursorPostedAt: string | null;
  cursorPostId: string | null;
  cycleStartedAt: string;
  isNewCycle: boolean;
}

// A cycle restarts from the newest post whenever: there's no prior cursor row, the previous
// cycle already finished, or the caller changed the window size (`?days=`). Resuming a stale
// cursor built for a different window would silently skip posts (window shrank) or leave a
// gap of never-revisited older posts (window grew) — safer to just start over.
export function resolveCycleState(existing: CursorRow | null, windowDays: number, now: Date): CycleState {
  const needsNewCycle = !existing || existing.cycle_complete || existing.window_days !== windowDays;
  if (needsNewCycle) {
    return { cursorPostedAt: null, cursorPostId: null, cycleStartedAt: now.toISOString(), isNewCycle: true };
  }
  return {
    cursorPostedAt: existing.cursor_posted_at,
    cursorPostId: existing.cursor_post_id,
    cycleStartedAt: existing.cycle_started_at,
    isNewCycle: false,
  };
}

// Keyset-pagination filter (as a Supabase/PostgREST `.or()` expression) for "strictly older
// than this cursor position", matching an ORDER BY posted_at DESC, id DESC listing. Using id as
// a tiebreaker (rather than posted_at alone) keeps pagination deterministic when multiple posts
// share the same posted_at — an offset-based LIMIT/OFFSET would either skip or re-process rows
// whenever ordering among ties isn't stable across calls.
export function buildKeysetFilter(cursorPostedAt: string, cursorPostId: string): string {
  return `posted_at.lt.${cursorPostedAt},and(posted_at.eq.${cursorPostedAt},id.lt.${cursorPostId})`;
}

// `?batch=` override, clamped to a safe range. Default (20) is sized to comfortably finish
// well under cron-job.org's 30s timeout even when every post falls through to a slower metric
// set; MAX_BATCH_SIZE caps how large a caller can push it.
export function resolveBatchSize(param: string | null): number {
  const n = Number(param);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(n), MAX_BATCH_SIZE);
}
