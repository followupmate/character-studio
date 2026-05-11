-- =============================================
-- Character Studio — Supabase Migration
-- Prefix: chs_
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================

-- 1. Characters table
CREATE TABLE IF NOT EXISTS chs_characters (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL,
  slug         text UNIQUE NOT NULL,
  soul_id      text,
  visual_brief text NOT NULL,
  backstory    text NOT NULL,
  personality  jsonb DEFAULT '{}',
  platforms    text[] DEFAULT '{instagram,youtube}',
  posting_time time DEFAULT '10:00:00',
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- 2. Story days table
CREATE TABLE IF NOT EXISTS chs_story_days (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id uuid REFERENCES chs_characters(id) ON DELETE CASCADE,
  day_number   integer NOT NULL,
  date         date NOT NULL DEFAULT current_date,
  location     text NOT NULL,
  mood         text NOT NULL,
  narrative    text NOT NULL,
  arc_position text NOT NULL DEFAULT 'rising',
  next_hint    text,
  ig_caption   text,
  hashtags     text[],
  created_at   timestamptz DEFAULT now(),
  UNIQUE(character_id, date)
);

-- 3. Media table
CREATE TABLE IF NOT EXISTS chs_media (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  story_day_id      uuid REFERENCES chs_story_days(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN ('photo', 'video')),
  higgsfield_prompt text NOT NULL,
  higgsfield_job_id text,
  media_url         text,
  thumbnail_url     text,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'generating', 'ready', 'posted', 'failed')),
  created_at        timestamptz DEFAULT now()
);

-- 4. Posts table
CREATE TABLE IF NOT EXISTS chs_posts (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id         uuid REFERENCES chs_media(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('instagram', 'youtube', 'tiktok')),
  platform_post_id text,
  scheduled_at     timestamptz,
  posted_at        timestamptz,
  status           text NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'posted', 'failed')),
  engagement       jsonb DEFAULT '{}',
  created_at       timestamptz DEFAULT now()
);

-- 4b. Add source_url to media table (stores original Higgsfield URL)
ALTER TABLE chs_media ADD COLUMN IF NOT EXISTS source_url text;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_story_days_character ON chs_story_days(character_id);
CREATE INDEX IF NOT EXISTS idx_story_days_date ON chs_story_days(date);
CREATE INDEX IF NOT EXISTS idx_media_story_day ON chs_media(story_day_id);
CREATE INDEX IF NOT EXISTS idx_media_status ON chs_media(status);
CREATE INDEX IF NOT EXISTS idx_posts_media ON chs_posts(media_id);

-- 6. Seed: Vivienne
INSERT INTO chs_characters (name, slug, visual_brief, backstory, platforms)
VALUES (
  'Vivienne',
  'vivienne',
  'Dark wavy hair, green eyes, late 20s, natural minimal makeup, slim athletic build, effortlessly elegant. Often wears linen, silk, minimal jewelry. Looks completely photorealistic — never AI-generated aesthetic.',
  'Vivienne je duch súčasného sveta. Nikdy nemá pevnú adresu — spí v apartmánoch s výhľadom, ktoré si vyberá podľa nálady, a odchádza v momente, keď mesto prestane pre ňu hrať hudbu. Je asi najviac univerzálna, elegantná a umožňuje robiť úplne čokoľvek v story — od luxusu až po intímne momenty.',
  '{instagram,youtube}'
)
ON CONFLICT (slug) DO NOTHING;
