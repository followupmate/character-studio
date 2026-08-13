-- Closed-loop Creative Intelligence evaluation, phase 1: immutable performance checkpoints.
-- chs_posts.engagement is a live, ever-changing cumulative value — it can't answer "how did
-- this post look at a standardized age", which is what comparing CI-guided posts against a
-- baseline needs. This table captures that value ONCE per (post, horizon) and never rewrites
-- it. See lib/creativeIntelligence/performanceSnapshots.ts for the capture logic and
-- lib/creativeIntelligence/outcomeEvaluator.ts for what reads it.
--
-- 'current_observation' is a fourth, non-horizon value used ONLY by the one-time backfill for
-- CI-guided posts that predate this table (see the backfill route) — it holds today's cumulative
-- engagement for diagnostic display only and is never treated as a trustworthy 24h/72h/7d
-- checkpoint by the outcome evaluator.

CREATE TABLE IF NOT EXISTS chs_post_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES chs_posts(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES chs_characters(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  horizon text NOT NULL CHECK (horizon IN ('24h', '72h', '7d', 'current_observation')),
  -- Real age at capture time, not the nominal horizon — a "24h" snapshot caught at the first
  -- import after the post turned 24h old might really be 26h (or later, within grace — see
  -- performanceSnapshots.ts's SNAPSHOT_GRACE_HOURS). This is how we know how late it was.
  age_hours numeric NOT NULL,
  post_type text NOT NULL,
  -- All metric columns nullable: missing != 0. A metric IG never returned for this post/media
  -- type is NULL here, exactly like chs_posts.engagement never coerces an unfetched metric to 0.
  views numeric,
  reach numeric,
  likes numeric,
  comments numeric,
  saves numeric,
  shares numeric,
  total_interactions numeric,
  avg_watch_time_sec numeric,
  follows numeric,
  profile_visits numeric,
  fanvue_clicks numeric,
  growth_score numeric,
  UNIQUE(post_id, horizon)
);

CREATE INDEX IF NOT EXISTS idx_post_perf_snapshots_baseline
  ON chs_post_performance_snapshots(character_id, post_type, horizon, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_perf_snapshots_post
  ON chs_post_performance_snapshots(post_id);
