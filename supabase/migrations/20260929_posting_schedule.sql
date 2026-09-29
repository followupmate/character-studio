-- Per-weekday, timezone-aware publish schedule for chs_characters.
--
-- posting_tz        IANA timezone the schedule is written in (DST handled in code via Intl).
-- posting_schedule  jsonb: keys mon..sun, each { "story": "HH:MM"|null, "reel": "HH:MM"|null,
--                   "carousel": "HH:MM"|null } in LOCAL time of posting_tz.
--                   A null / missing slot (or missing weekday) = do NOT queue that slot that day.
--                   When posting_schedule IS NULL the legacy behaviour applies unchanged:
--                   posting_time (read as UTC) + fixed offsets (carousel +0, reel +8h, story +90min).
--
-- Safe to run repeatedly. Run BEFORE deploying the code that selects these columns
-- (the code also falls back to legacy behaviour if the columns are missing).

ALTER TABLE chs_characters ADD COLUMN IF NOT EXISTS posting_tz text DEFAULT 'Europe/Bratislava';
ALTER TABLE chs_characters ADD COLUMN IF NOT EXISTS posting_schedule jsonb;

-- Seed for Vivienne (@vivienne.mov) — engagement windows from IG Insights (local time).
-- Commented on purpose: review, then run manually.
-- UPDATE chs_characters
-- SET posting_tz = 'Europe/Bratislava',
--     posting_schedule = '{
--       "mon": {"story": "11:00", "reel": "17:30"},
--       "tue": {"story": "11:00", "reel": "17:30"},
--       "wed": {"story": "11:00", "reel": "17:30"},
--       "thu": {"story": "11:00", "reel": "17:30"},
--       "fri": {"story": "11:00", "reel": "17:30"},
--       "sat": {"story": "11:00", "reel": "16:00"},
--       "sun": {"story": "16:00", "reel": null}
--     }'::jsonb
-- WHERE slug = 'vivienne';
--
-- Rollback to legacy behaviour:
-- UPDATE chs_characters SET posting_schedule = NULL WHERE slug = 'vivienne';
