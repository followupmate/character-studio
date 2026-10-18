-- "Vivienne tries everything once" test (19.10–1.11.2026): chs_shot_archetypes row for the series
-- recipe tries_episode. Only used when feature_flags.reel_hook_overrides[date].recipe = 'tries_episode';
-- never drawn at random (excludeArchetypeIds = ALL_REEL_RECIPE_IDS). Apply AFTER the code deploy.
INSERT INTO chs_shot_archetypes (id, family, guidance) VALUES
  ('tries_episode', 'motion', 'Tries everything once — close-medium, face clearly visible. She is mid-attempt at an activity she has never done (the scene names it); within the first second a small wobble or misstep makes her laugh; she tries once more with more confidence; payoff: she turns close to the lens, breathless and proud, eye contact. Elegant styling in contrast with the setting. One take, no cuts.')
ON CONFLICT (id) DO UPDATE SET family = EXCLUDED.family, guidance = EXCLUDED.guidance;
-- ROLLBACK: DELETE FROM chs_shot_archetypes WHERE id = 'tries_episode';
