-- Forward migration: lived_moments tier support.
-- Safe & additive. Run once before deploying the lived_moments code.
-- Does NOT touch existing rows (new columns are nullable; historical tiers kept).

BEGIN;

-- 1) New per-day metadata (nullable → backward compatible with old story_days).
ALTER TABLE chs_story_days ADD COLUMN IF NOT EXISTS moment_family text;
ALTER TABLE chs_story_days ADD COLUMN IF NOT EXISTS magnetism_level text;

-- 2) Value guards for the new columns (NULL always allowed).
ALTER TABLE chs_story_days DROP CONSTRAINT IF EXISTS chs_story_days_moment_family_check;
ALTER TABLE chs_story_days ADD CONSTRAINT chs_story_days_moment_family_check
  CHECK (moment_family IS NULL OR moment_family IN (
    'home_private','friends_fun','vacation_beach_water','pets_spontaneous','city_transit'
  ));

ALTER TABLE chs_story_days DROP CONSTRAINT IF EXISTS chs_story_days_magnetism_level_check;
ALTER TABLE chs_story_days ADD CONSTRAINT chs_story_days_magnetism_level_check
  CHECK (magnetism_level IS NULL OR magnetism_level IN (
    'soft','playful','flirty','sensual'
  ));

-- 3) Allow the new tier while KEEPING every historical value already in the table
--    (grounded_routine, cinematic_melancholy, incidental_wrongness, entropy,
--     lifestyle_travel) so existing rows keep validating.
ALTER TABLE chs_story_days DROP CONSTRAINT IF EXISTS chs_story_days_tier_check;
ALTER TABLE chs_story_days ADD CONSTRAINT chs_story_days_tier_check
  CHECK (tier = ANY (ARRAY[
    'lived_moments','everyday_life','wellness_fitness','intimate_aesthetic','luxe_car',
    'lifestyle_travel','grounded_routine','cinematic_melancholy','incidental_wrongness','entropy'
  ]::text[]));

COMMIT;
