-- Phase 2 — reel recipes: chs_shot_archetypes rows for `ootd_stop` and `grwm_loading`.
--
-- Why: chs_media.shot_archetype / chs_archetype_usage.archetype_id (FK -> chs_shot_archetypes.id)
-- carry the recipe id once reel_recipes_v1 is on. lib/dailyBatch.ts checks that the row exists
-- BEFORE using a recipe and silently falls back to the old flow when it does not, so running this
-- migration is a precondition for the flag, not for the deploy.
--
-- The rows are NEVER drawn at random: pickArchetypesForBatch() is called with
-- excludeArchetypeIds = the recipe ids; only dailyBatch assigns them (flag/env gated).
--
-- Idempotent: safe to run repeatedly (ON CONFLICT DO UPDATE re-applies the guidance text).
-- Guidance text must equal ReelRecipe.archetypeGuidance in lib/recovery/reelRecipes.ts
-- (lib/recovery/reelRecipes.test.ts compares them).
-- No schema change; no change to chs_media / chs_posts.

INSERT INTO chs_shot_archetypes (id, family, guidance) VALUES
  ('ootd_stop',    'motion', 'OOTD stop — outfit-readable medium shot (knees up). She arrives into the frame mid-stride, slows to a stop and settles into one relaxed pose; wardrobe fully visible, face clearly readable, clean space in the top third for a text overlay. One take, no cuts.'),
  ('grwm_loading', 'motion', 'GRWM loading — close-medium, mid get-ready (hair, jewellery, collar). One small finishing touch, a glance to the lens, a satisfied half-smile; the clip should read like a progress bar completing. Clean space in the top third for a text overlay.')
ON CONFLICT (id) DO UPDATE
  SET family   = EXCLUDED.family,
      guidance = EXCLUDED.guidance;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Run only if you want the rows gone. Turn `reel_recipes_v1` off first (or set
-- REEL_RECIPES_ENABLED=false); with the rows missing the code skips recipes anyway.
-- chs_archetype_usage rows for these ids are removed by ON DELETE CASCADE;
-- chs_media.shot_archetype is plain text (no FK), so history keeps the label.
--
-- DELETE FROM chs_shot_archetypes WHERE id IN ('ootd_stop', 'grwm_loading');
