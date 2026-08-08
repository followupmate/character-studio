-- Creative Intelligence v1 (additive) — replaces the old lib/creative_intelligence.py's
-- flat-file persistence (data/motion_library.json, data/production_strategy.json) with real
-- tables. Pure recommendation layer: nothing here is read by the character generation
-- pipeline (lib/dailyBatch.ts, lib/slotPrompts.ts) yet.

-- Motion pattern registry (Dynamic Motion Library). Seeded at runtime by
-- lib/creativeIntelligence/motionIntelligence.ts's ensureSeedMotionPatterns().
CREATE TABLE IF NOT EXISTS chs_ci_motion_patterns (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  kling_prompt text NOT NULL,
  duration_sec integer NOT NULL,
  origin text NOT NULL CHECK (origin IN ('seed', 'evolution')),
  parent_pattern_id text REFERENCES chs_ci_motion_patterns(id),
  mutation_strategy text CHECK (mutation_strategy IN ('speed', 'intensity', 'timing', 'emphasis')),
  paired_content_pattern_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Historical Next Content Strategy snapshots, written by the analytics-only daily cron
-- (app/api/creative-intelligence/cron/refresh/route.ts) and read by the dashboard.
CREATE TABLE IF NOT EXISTS chs_ci_strategy_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES chs_characters(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL,
  window_days integer NOT NULL,
  recommendations jsonb NOT NULL,
  breakdown jsonb NOT NULL,
  data_status text NOT NULL CHECK (data_status IN ('ok', 'insufficient_history')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ci_strategy_snapshots_character
  ON chs_ci_strategy_snapshots(character_id, generated_at DESC);
