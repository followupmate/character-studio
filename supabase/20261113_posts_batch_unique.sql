-- One batch queue row per (story day, platform, post type).
--
-- /api/publish/cron sweeps /api/publish/from-batch on every tick and the daily
-- /api/characters/publish runs it too; two overlapping runs both passed the
-- "already queued?" read and inserted twice (2026-10-30, 2026-11-10 -> the same reel
-- uploaded twice to YouTube and Instagram). The read-then-insert check can't close that
-- race; a unique index can. Inserts that lose the race fail with 23505, which the
-- routes report as "queued by a concurrent run".
--
-- Rows created before 2026-11-13 are excluded so the two historical duplicate pairs
-- (both already published) don't block the index. Failed rows don't count, so a day
-- whose post failed can still be re-queued.

create unique index if not exists chs_posts_batch_one_per_day
  on public.chs_posts (story_day_id, platform, post_type)
  where source = 'batch'
    and story_day_id is not null
    and status <> 'failed'
    and created_at >= timestamptz '2026-11-13 00:00:00+00';
