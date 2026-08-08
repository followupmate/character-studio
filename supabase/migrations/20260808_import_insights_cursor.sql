-- Persistent cursor for /api/publish/import-insights, so the external cron caller
-- (cron-job.org, hard 30s timeout) can keep hitting one plain URL while the route
-- processes the 90-day post window in small batches across many runs instead of
-- one long sequential pass. See lib/importInsightsCursor.ts for the pure
-- cycle/keyset-pagination logic that reads and advances this row.

CREATE TABLE IF NOT EXISTS chs_import_insights_cursor (
  id text PRIMARY KEY DEFAULT 'default',
  window_days integer NOT NULL,
  -- Keyset position: the (posted_at, id) of the last post processed so far this
  -- cycle, ordered newest-first. Null means "start from the newest post".
  cursor_posted_at timestamptz,
  cursor_post_id uuid,
  cycle_started_at timestamptz NOT NULL,
  cycle_complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Supports the keyset filter (posted_at < cursor OR (posted_at = cursor AND id < cursor_id))
-- ordered DESC — the query pattern every batch runs.
CREATE INDEX IF NOT EXISTS idx_posts_insights_cursor
  ON chs_posts (posted_at DESC, id DESC)
  WHERE platform_post_id IS NOT NULL;
