-- Phase 8 — "moment" reel recipes: chs_shot_archetypes rows for reveal_object, outfit_reveal,
-- surprise_reaction, playful_camera.
--
-- Same contract as 20261004_reel_recipes.sql: chs_media.shot_archetype / chs_archetype_usage
-- carry the recipe id. lib/dailyBatch.ts checks the row exists BEFORE using a recipe and falls back
-- to the old flow when it does not, so this migration is a precondition for the moment recipes to
-- actually run (behind reel_recipes_v1), not for the deploy.
-- The rows are never drawn at random (excludeArchetypeIds = REEL_RECIPE_IDS).
--
-- Idempotent (ON CONFLICT DO UPDATE). Guidance must equal ReelRecipe.archetypeGuidance in
-- lib/recovery/reelRecipes.ts (reelRecipes.test.ts compares them). No schema change.

INSERT INTO chs_shot_archetypes (id, family, guidance) VALUES
  ('reveal_object', 'motion', 'Reveal object — close-medium, face to the lens. Start: one hand hidden behind her back (or inside a long sleeve). Within the first second the hand comes out with a small object that exists in the scene (her mug, keys) or a small bunch of flowers / a folded letter; payoff: she presents it beside her face and smiles. One take, no cuts, ends on a still frame.'),
  ('outfit_reveal', 'motion', 'Outfit / accessory reveal — close-medium, face to the lens. Within the first second one quick look change: sunglasses go on, an outer layer slides off the shoulders, or her hair sweeps up to reveal neckline and chain; payoff: the new look and a confident smile. Never full body. One take, no cuts.'),
  ('surprise_reaction', 'motion', 'Surprise reaction — close-medium, face to the lens. Within the first second something off camera (a sound, someone out of frame) breaks her composure: she turns toward it, laughs or startles; payoff: she turns back to the lens smiling. Nobody else enters the frame. One take, no cuts.'),
  ('playful_camera', 'motion', 'Playful to camera — close, face to the lens. Within the first second she interacts with the camera itself: offers her cup to the viewer, covers the lens with her palm, or taps it with a fingertip; payoff: a grin straight into the lens. One take, no cuts, no zoom.')
ON CONFLICT (id) DO UPDATE
  SET family   = EXCLUDED.family,
      guidance = EXCLUDED.guidance;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Code-level (no SQL): REEL_MOMENT_RECIPES=false in Vercel -> classic ootd/grwm alternation.
-- Rows: with them missing, dailyBatch skips a moment recipe for the day (old flow).
-- chs_archetype_usage rows for these ids go with ON DELETE CASCADE; chs_media.shot_archetype is
-- plain text, so history keeps the label.
--
-- DELETE FROM chs_shot_archetypes WHERE id IN ('reveal_object', 'outfit_reveal', 'surprise_reaction', 'playful_camera');
