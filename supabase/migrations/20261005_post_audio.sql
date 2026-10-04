-- Phase 3 — trending audio on reels: remember which Instagram audio each post used.
--
-- Why: app/api/publish/post-now/route.ts (flag `ig_trending_audio`) picks a trending track via
-- GET /ig_audio and must not repeat an audio_id used in the last ~14 days (lib/igAudioStore.ts reads
-- these columns). Nothing else reads them.
--
-- The code is tolerant of this migration NOT being run: the repeat check then returns "no recent
-- ids" and the audio bookkeeping UPDATE (a separate statement from the status update) just logs a
-- warning. Run it BEFORE turning the flag on so repeat protection works.
--
-- Idempotent: safe to run repeatedly. Additive only (nullable columns, no defaults, no rewrites).

ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS audio_id          text;
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS audio_title       text;
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS audio_artist      text;
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS audio_ads_eligible boolean;

CREATE INDEX IF NOT EXISTS chs_posts_audio_id_posted_at_idx
  ON chs_posts (audio_id, posted_at DESC)
  WHERE audio_id IS NOT NULL;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Turn the flag off first (IG_TRENDING_AUDIO_ENABLED=false). The columns are only history;
-- with them gone the code simply logs a warning and publishes without repeat protection.
--
-- DROP INDEX IF EXISTS chs_posts_audio_id_posted_at_idx;
-- ALTER TABLE chs_posts DROP COLUMN IF EXISTS audio_ads_eligible;
-- ALTER TABLE chs_posts DROP COLUMN IF EXISTS audio_artist;
-- ALTER TABLE chs_posts DROP COLUMN IF EXISTS audio_title;
-- ALTER TABLE chs_posts DROP COLUMN IF EXISTS audio_id;
