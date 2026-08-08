-- Creative Intelligence -> generation pipeline integration (additive). Records which real
-- Next Content Strategy recommendation (if any) shaped a given story day, so posts can later be
-- joined back to the recommendation that inspired them for closed-loop measurement. See
-- lib/creativeIntelligence/generationStrategyAdapter.ts.
--
-- Written ONLY when a CI recommendation was actually applied (strategyInput !== null) — flag-off
-- or fallback days leave all five columns NULL, never a placeholder value, so
-- `WHERE strategy_snapshot_id IS NOT NULL` cleanly selects "days CI actually influenced".

ALTER TABLE chs_story_days
  ADD COLUMN IF NOT EXISTS strategy_source text
    CHECK (strategy_source IN ('creative_intelligence', 'random_default')),
  ADD COLUMN IF NOT EXISTS strategy_snapshot_id uuid REFERENCES chs_ci_strategy_snapshots(id),
  ADD COLUMN IF NOT EXISTS recommendation_rank integer,
  ADD COLUMN IF NOT EXISTS recommendation_category text
    CHECK (recommendation_category IN ('proven', 'evolution', 'experiment')),
  ADD COLUMN IF NOT EXISTS evidence_post_ids text[];

CREATE INDEX IF NOT EXISTS idx_story_days_strategy_snapshot
  ON chs_story_days(strategy_snapshot_id) WHERE strategy_snapshot_id IS NOT NULL;
