-- Fanvue Paid Continuation v1 (additive, backward compatible)
-- Feature flag: fanvue_paid_continuation_v1 (chs_characters.feature_flags jsonb)
-- Flag OFF: chs_fanvue_unlocks rows are created exactly as before (pipeline_version defaults
-- to 'legacy', content_level/continuation_plan stay null). Flag ON: new drafts get a structured
-- continuation_plan (source tease, paid promise, content level, 6-shot bridge->afterglow arc)
-- instead of a single flat fanvue_prompt. Existing rows are never migrated/backfilled.

ALTER TABLE chs_fanvue_unlocks
  ADD COLUMN IF NOT EXISTS content_level text
    CHECK (content_level IN ('premium_sensual', 'erotic_tease', 'explicit_adult')),
  ADD COLUMN IF NOT EXISTS continuation_plan jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_version text NOT NULL DEFAULT 'legacy'
    CHECK (pipeline_version IN ('legacy', 'paid_continuation_v1'));

-- adult_content_verified: manual, explicit 18+ confirmation gate set in Character Settings
-- (/fanvue page). NEVER derived from backstory, prompt text, or generated appearance.
-- Required server-side (not just UI) before content_level='explicit_adult' can be selected
-- anywhere in the app — explicit_adult is never auto-generated regardless of this flag.
ALTER TABLE chs_characters
  ADD COLUMN IF NOT EXISTS adult_content_verified boolean NOT NULL DEFAULT false;
