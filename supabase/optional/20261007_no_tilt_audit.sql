-- Phase 5 — OPTIONAL, read-only by default. Nothing here is required by the code.
--
-- The repo seeds (supabase/migration.sql chs_shot_archetypes, 20261004_reel_recipes.sql) contain NO
-- camera-tilt wording, and the runtime guard (lib/orientationGuard.ts) strips it from every
-- reel_start_frame prompt at generation time anyway. This file only lets you check whether rows
-- edited by hand in the live DB carry such wording.

-- 1) Archetype guidance with tilt / dutch / canted / rotated / sideways-frame wording
SELECT id, family, guidance
FROM chs_shot_archetypes
WHERE guidance ~* '(slight(ly)?\s+tilt|tilted\s+(frame|camera|horizon|angle|shot)|dutch\s+(angle|tilt)|canted|rotated\s+(frame|image|camera|photo|\d)|sideways\s+(frame|shot|orientation|composition)|off[- ]kilter)';

-- 2) Pending / recent reel start-frame prompts with such wording (informational; the guard handles them)
SELECT id, slot, generation_status, created_at, left(higgsfield_prompt, 160) AS prompt_head
FROM chs_media
WHERE slot = 'reel_start_frame'
  AND created_at >= now() - interval '14 days'
  AND higgsfield_prompt ~* '(slight(ly)?\s+tilt|tilted\s+(frame|camera|horizon)|dutch\s+(angle|tilt)|canted|rotated|sideways\s+(frame|shot))'
ORDER BY created_at DESC;

-- 3) ONLY if query 1 returned rows: back up, then edit those rows by hand. Template (uncomment, set ids):
-- CREATE TABLE IF NOT EXISTS chs_shot_archetypes_backup_20261007 AS
--   SELECT * FROM chs_shot_archetypes WHERE id IN ('<id1>', '<id2>');
-- UPDATE chs_shot_archetypes
--   SET guidance = regexp_replace(guidance, ',?\s*(a\s+)?slight(ly)?\s+tilt(ed)?', '', 'gi')
--   WHERE id IN ('<id1>', '<id2>');
--
-- ROLLBACK:
-- UPDATE chs_shot_archetypes a SET guidance = b.guidance
--   FROM chs_shot_archetypes_backup_20261007 b WHERE a.id = b.id;
-- DROP TABLE IF EXISTS chs_shot_archetypes_backup_20261007;
