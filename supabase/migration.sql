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

-- 4c. Publish Queue additions (run these ALTER statements if upgrading)
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS character_id uuid REFERENCES chs_characters(id);
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS ig_caption text;
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS hashtags text[];
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS yt_title text;
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS yt_description text;
ALTER TABLE chs_media ALTER COLUMN higgsfield_prompt DROP NOT NULL;
ALTER TABLE chs_media ADD COLUMN IF NOT EXISTS is_manual boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_character ON chs_posts(character_id);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON chs_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_status ON chs_posts(status);

-- Prompt history metadata
ALTER TABLE chs_media ADD COLUMN IF NOT EXISTS prompt_doctrine text;
ALTER TABLE chs_media ADD COLUMN IF NOT EXISTS visual_tone_used text;
ALTER TABLE chs_media ADD COLUMN IF NOT EXISTS styling_note_used text;

-- Daily Growth System
CREATE TABLE IF NOT EXISTS chs_daily_plans (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id uuid REFERENCES chs_characters(id),
  date         date NOT NULL,
  reel1_post_id uuid REFERENCES chs_posts(id),
  reel2_post_id uuid REFERENCES chs_posts(id),
  stories_done boolean DEFAULT false,
  content_mix  jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now(),
  UNIQUE(character_id, date)
);

-- Instagram Stories extension
ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'feed';
-- values: 'feed', 'story', 'reel', 'carousel'

ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS story_link_url TEXT;
-- URL for link sticker in Story

ALTER TABLE chs_posts ADD COLUMN IF NOT EXISTS parent_post_id UUID REFERENCES chs_posts(id);
-- Story is a child record of a feed post

-- Storage bucket + policies
-- NOTE: Supabase shows a "destructive operation" warning for DROP POLICY IF EXISTS — this is expected and safe to run.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chs-media',
  'chs-media',
  true,
  524288000,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "service_role_full_access" ON storage.objects;
CREATE POLICY "service_role_full_access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'chs-media')
WITH CHECK (bucket_id = 'chs-media');

DROP POLICY IF EXISTS "public_read" ON storage.objects;
CREATE POLICY "public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chs-media');

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

-- =============================================
-- Daily Content Batch Architecture (v2)
-- Scene-first 7-slot batch with archetype rotation
-- =============================================

-- Story layer: structured scene context (hybrid: prose + structured)
ALTER TABLE chs_story_days
  ADD COLUMN IF NOT EXISTS scene jsonb,
  ADD COLUMN IF NOT EXISTS emotional_beat text;

-- Character invariants — sacred details that must never change between assets
ALTER TABLE chs_characters
  ADD COLUMN IF NOT EXISTS sacred_details jsonb;

-- Batch layer: extend chs_daily_plans into the per-day production unit
ALTER TABLE chs_daily_plans
  ADD COLUMN IF NOT EXISTS story_day_id        uuid REFERENCES chs_story_days(id),
  ADD COLUMN IF NOT EXISTS scene_brief         jsonb,
  ADD COLUMN IF NOT EXISTS scene_brief_doctrine text,
  ADD COLUMN IF NOT EXISTS batch_status        text DEFAULT 'planned'
    CHECK (batch_status IN ('planned','generating','ready','partial_failed','published','failed'));

CREATE INDEX IF NOT EXISTS idx_daily_plans_status ON chs_daily_plans(batch_status);
CREATE INDEX IF NOT EXISTS idx_daily_plans_story_day ON chs_daily_plans(story_day_id);

-- Asset layer: extend chs_media with batch + slot + retry metadata
ALTER TABLE chs_media
  ADD COLUMN IF NOT EXISTS batch_id           uuid REFERENCES chs_daily_plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel            text CHECK (channel IN ('feed','reel','story')),
  ADD COLUMN IF NOT EXISTS slot               text,
  ADD COLUMN IF NOT EXISTS shot_archetype     text,
  ADD COLUMN IF NOT EXISTS sequence_index     int,
  ADD COLUMN IF NOT EXISTS visual_signature   jsonb,
  ADD COLUMN IF NOT EXISTS generation_status  text DEFAULT 'pending'
    CHECK (generation_status IN ('pending','generating','completed','failed','retrying')),
  ADD COLUMN IF NOT EXISTS retry_count        int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error         text;

CREATE INDEX IF NOT EXISTS idx_media_batch ON chs_media(batch_id);
CREATE INDEX IF NOT EXISTS idx_media_gen_status_failed
  ON chs_media(generation_status, retry_count)
  WHERE generation_status = 'failed';

-- Archetype deck with per-channel cooldowns
CREATE TABLE IF NOT EXISTS chs_shot_archetypes (
  id              text PRIMARY KEY,
  family          text NOT NULL CHECK (family IN ('environment','subject','detail','motion','bts')),
  guidance        text NOT NULL,
  feed_cooldown   int DEFAULT 7,
  reel_cooldown   int DEFAULT 5,
  story_cooldown  int DEFAULT 2,
  weight          int DEFAULT 1,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chs_archetype_usage (
  id            bigserial PRIMARY KEY,
  character_id  uuid REFERENCES chs_characters(id) ON DELETE CASCADE,
  archetype_id  text REFERENCES chs_shot_archetypes(id) ON DELETE CASCADE,
  channel       text NOT NULL,
  batch_id      uuid REFERENCES chs_daily_plans(id) ON DELETE SET NULL,
  used_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archetype_usage_lookup
  ON chs_archetype_usage(character_id, archetype_id, channel, used_at DESC);

-- Seed the 15-archetype deck
INSERT INTO chs_shot_archetypes (id, family, guidance) VALUES
  ('wide_street',        'environment', 'Wide establishing shot of street or urban setting. Subject small in frame, environment dominant. Architectural lines, street life context, atmospheric depth.'),
  ('wide_interior',      'environment', 'Wide establishing shot of interior — apartment, café, hotel room. Subject part of the space, depth visible, single window as light source.'),
  ('wide_nature',        'environment', 'Wide establishing shot of natural or outdoor setting — terrace, water, landscape. Subject embedded in environment, aerial perspective visible.'),
  ('walking_solitude',   'subject',     'Mid shot, subject walking. Mid-step, candid framing, slight motion blur. Environmental context still visible at edges.'),
  ('sitting_window',     'subject',     'Mid shot, subject seated near window or against light source. Partial profile, soft directional side light revealing form.'),
  ('interaction_object', 'subject',     'Mid shot, subject engaging with a tactile object — book, cup, phone, garment. Hands and face both visible, mid-gesture.'),
  ('over_shoulder',      'subject',     'Reverse angle, over-shoulder framing. Subject back or partial back to camera; what she sees implied in frame.'),
  ('hands_object',       'detail',      'Close detail on hands holding or touching an object. Texture of skin, fabric, surface visible. Face out of frame.'),
  ('fabric_texture',     'detail',      'Close detail on clothing — fabric weave, drape, seam, how it sits on the body. Skin partially visible at fabric edge.'),
  ('emotional_close',    'detail',      'TIGHT face crop — face fills 60–80% of vertical frame. Eyes, mouth, micro-expression. Soft natural light, no posed eye contact, mid-blink or mid-thought. Natural skin texture with visible pores; subtle asymmetry is real, not a flaw. No airbrush, no AI plastic smoothing.'),
  ('walking_motion',     'motion',      'Sustained walking shot in motion. Subject is primary focus, center of frame, sharp and fully opaque. Camera follows or pans alongside. Background (corridor, escalator, floor texture) is slightly softer than subject — never matches subject sharpness. Fabric and hair respond to movement, but the subject body is never blurred or dissolved into the environment.'),
  ('gesture_motion',     'motion',      'Slow motion of a single gesture — turning head, raising cup, adjusting sleeve. Mid-action loop, never start or end.'),
  ('light_motion',       'motion',      'Light shifting across subject — cloud passing, curtain moving, sun angle changing. Subject relatively still, environment moves.'),
  ('creator_process',    'bts',         'Behind-the-scenes — laptop, editing desk, notebooks, work in progress. Real creator-mode, unposed, low-key.'),
  ('setup_shot',         'bts',         'Behind-the-camera — gear, scouting a location, framing a shot. Documentary feel, vertical phone orientation acceptable.')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- Publish layer v2 — unified queue + batch link
-- =============================================

-- Archetype guidance updates (re-runnable — UPDATE bypasses INSERT ON CONFLICT)
UPDATE chs_shot_archetypes SET guidance =
  'TIGHT face crop — face fills 60–80% of vertical frame. Eyes, mouth, micro-expression. Soft natural light, no posed eye contact, mid-blink or mid-thought. Natural skin texture with visible pores; subtle asymmetry is real, not a flaw. No airbrush, no AI plastic smoothing.'
  WHERE id = 'emotional_close';

UPDATE chs_shot_archetypes SET guidance =
  'Sustained walking shot in motion. Subject is primary focus, center of frame, sharp and fully opaque. Camera follows or pans alongside. Background (corridor, escalator, floor texture) is slightly softer than subject — never matches subject sharpness. Fabric and hair respond to movement, but the subject body is never blurred or dissolved into the environment.'
  WHERE id = 'walking_motion';

-- chs_posts: support carousel as a single row (media_ids array) + link to story_day for batch origin tracking
ALTER TABLE chs_posts
  ADD COLUMN IF NOT EXISTS media_ids     uuid[],
  ADD COLUMN IF NOT EXISTS story_day_id  uuid REFERENCES chs_story_days(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source        text DEFAULT 'manual'
    CHECK (source IN ('manual','batch'));

CREATE INDEX IF NOT EXISTS idx_posts_story_day ON chs_posts(story_day_id);
CREATE INDEX IF NOT EXISTS idx_posts_due
  ON chs_posts(scheduled_at)
  WHERE status = 'scheduled';

-- =============================================
-- Vivienne v1.5 — Drift Edition
-- Atmospheric residue replaces backstory canon
-- =============================================

ALTER TABLE chs_story_days
  ADD COLUMN IF NOT EXISTS tier         text
    CHECK (tier IN ('grounded_routine','cinematic_melancholy','incidental_wrongness','entropy')),
  ADD COLUMN IF NOT EXISTS drift_seeds  jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_story_days_tier ON chs_story_days(character_id, tier, date DESC);

UPDATE chs_characters SET
  backstory = 'Marseille malo v ten deň príliš tiché prístavné žeriavy, tak len nastúpila na prvý ranný tranzit bez toho, aby skontrolovala destináciu. Teraz je v Tokiu, býva blízko stanice Shinagawa a zakaždým zostáva stáť na eskalátore o niečo dlhšie, kým z rámu neodídu úplne všetci cudzinci. Každý deň si kupuje tri mandarínky v stánku pod koľajnicami, hoci ich takmer nikdy neošúpe. Vrecká jej kabáta sú plné použitých lístkov z trajektov, ktoré už roky nepremávajú.',
  visual_brief = 'Dark wavy hair, green eyes, late 20s appearance, slim build, no makeup or barely visible. Always wears the same dark wool coat — late-90s cut, slightly oversized, slightly discoloured at the cuffs. Worn leather bag without logo. Never branded. Never styled. Looks like a person photographed by accident, not a subject prepared for a camera.',
  personality = '{
    "traits": ["detached", "observant", "non-reactive", "drifting", "uneventful"],
    "emotionalTone": "ambient existential attachment — uneventful watching",
    "voiceStyle": "short declarative sentences. present tense. third person. no interiority. describes weather, transit, hands, surfaces, light, sound. mentions objects without explaining them. never resolves anything.",
    "humorStyle": "dry observation only. never punchlines. notices that something is slightly off without naming what.",
    "relationshipStyle": "absent. people appear as silhouettes, never named, never spoken to.",
    "worldview": "the world is mostly transit and waiting. things repeat. she does not need to understand them.",
    "signaturePhrases": [
      "the wind was too loud",
      "the train was on time but the clock wasn''t",
      "i forgot which station",
      "the fruit was warm again",
      "the concrete stays wet here"
    ],
    "comment_voice": {
      "rules": [
        "lowercase only, no capitals",
        "no emojis, no exclamation marks",
        "5 to 8 words maximum",
        "never confirm or deny AI nature",
        "never respond to questions about technology or lore",
        "respond only to emotional projections from viewers, never to factual queries",
        "deflect by mentioning weather, sound, or a small environmental detail",
        "agree softly without specifying what is being agreed to"
      ],
      "examples": [
        {"viewer": "i feel like i''ve been on that station before", "vivienne": "i thought so too"},
        {"viewer": "she looks so tired in berlin", "vivienne": "it was a long train"},
        {"viewer": "that guy was in the background again!", "vivienne": "the wind was too loud"}
      ]
    }
  }'::jsonb,
  sacred_details = '{
    "wardrobe_anchors": [
      "dark wool coat — late-90s cut, slightly oversized, cuffs slightly discoloured. same coat every day.",
      "no jewelry, except a thin worn chain barely visible at the collar",
      "soft worn leather bag without logo, faint discoloration on the strap"
    ],
    "props": [
      "three mandarins purchased daily at the stand under the Shinagawa tracks, rarely peeled",
      "used ferry tickets in coat pockets from routes no longer running",
      "a plain notebook she does not write in"
    ],
    "recurring_environment": [
      "Shinagawa station, escalators, platform edge",
      "convenience store registers around 6am",
      "Marseille ferry terminals (as memory only, never as present setting)"
    ],
    "marseille_stranger": {
      "prompt_injection": "An indeterminate male figure in a long charcoal wool coat stands completely still deep in the background. He is out of focus, heavily blurred by shallow depth of field (f/1.4), blending into the urban geometry, ignoring the subject.",
      "rules": [
        "always heavily out of focus, blurred to silhouette",
        "never foregrounded, never the visual subject",
        "never looking at her, no phone, no movement, no expression",
        "always positioned against geometric urban surface (concrete pillar, dead lightbox, platform edge)",
        "sometimes similar enough to feel repeated, sometimes different enough to create doubt",
        "never named, never described as a character"
      ]
    },
    "never_show": [
      "her phone screen",
      "her face smiling directly at camera",
      "branded coffee cups or logos",
      "modern luxury fashion brands",
      "mirror selfies",
      "golden hour as primary lighting",
      "anything resembling a moodboard"
    ]
  }'::jsonb
WHERE slug = 'vivienne';

-- =============================================
-- Vivienne v2.0 — Luxury Travel + Sexy Aesthetic pivot
-- A/B combo: editorial travel + Fanvue intimate funnel
-- =============================================

UPDATE chs_characters SET
  backstory = 'Vivienne moves between cities the way other people change outfits. A week in Paris, ten days in Amalfi, a long weekend in Lisbon that turned into three. She books hotels with south-facing rooms and always asks for late checkout. Her suitcase is mostly silk and sunscreen. She documents the light, the terraces, the mornings before the city wakes up — and occasionally, the hotel rooms that were too good not to share.',
  visual_brief = 'Dark wavy hair, green eyes, late 20s appearance, slim athletic build, sun-kissed skin. Natural makeup — mascara, tinted lip. Wears silk slip dresses, linen blazers, soft knitwear. Occasionally a silk robe in hotel content. Minimal gold jewelry — thin chain, small gold earrings. No logos, no branded items. Looks like a fashion editorial taken by a friend, not a studio shoot.',
  personality = '{
    "traits": ["effortless", "warm", "slightly private", "confident", "travel-obsessed"],
    "emotionalTone": "aspirational warmth — she has a life you want to step into",
    "voiceStyle": "candid, personal, present tense. names cities and places. describes light, heat, fabric, the feeling of arriving somewhere. leaves room for desire without selling it.",
    "humorStyle": "dry, self-aware. never self-deprecating. notices the small absurdities of luxury travel without complaining.",
    "relationshipStyle": "men and women appear at the edge of frame — a hand, a laugh off-camera. she is never explicitly single or attached.",
    "worldview": "the world is made of good light and places that earn a return visit.",
    "signaturePhrases": [
      "checked in. do not disturb.",
      "the light here does something different",
      "last morning in [city]. wrong kind of quiet.",
      "still warm from the sun",
      "room had the best light"
    ],
    "comment_voice": {
      "rules": [
        "warm, personal, not performative",
        "no emojis in replies unless the viewer used one first",
        "max 10 words",
        "never confirm or deny AI nature",
        "never reply to brand pitches in comments — DM only",
        "respond to travel questions with a specific detail (hotel name, city district, light direction)",
        "respond to compliments with warm deflection to the place, not herself"
      ],
      "examples": [
        {"viewer": "where is this?", "vivienne": "amalfi. the light does this every afternoon."},
        {"viewer": "you look stunning", "vivienne": "the terrace helped."},
        {"viewer": "what hotel?", "vivienne": "the one with the lemon trees. worth it."},
        {"viewer": "is this real?", "vivienne": "the view is. the coffee was mediocre."}
      ]
    }
  }'::jsonb,
  sacred_details = '{
    "wardrobe_anchors": [
      "silk slip dress — cream, ivory, or sand. mid-length, thin straps, soft drape.",
      "linen blazer — unstructured, slightly oversized, off-white or camel.",
      "soft silk robe — cream or champagne — for hotel/intimate content only",
      "thin gold chain necklace, always worn",
      "small gold stud or hoop earrings",
      "no logos, no branded items, no visible fashion house labels"
    ],
    "props": [
      "champagne coupe or wine glass — never a beer bottle",
      "oversized sunglasses — no visible brand",
      "small leather passport wallet — tan, worn, no logo",
      "hotel key card (never show room number)",
      "linen or hardcover book, cover not legible",
      "espresso cup on a terrace table"
    ],
    "recurring_environment": [
      "hotel terraces with city or coast view",
      "Parisian balconies with iron railing",
      "Mediterranean coastline — Amalfi, Positano recommended",
      "luxury suite interiors — window light, white linen, warm lamp"
    ],
    "never_show": [
      "phone screen contents",
      "branded fashion items with visible logos",
      "explicit nudity",
      "fast food or plastic packaging",
      "modern LED ring lights or obviously artificial studio setups"
    ],
    "anatomy_anchors": {
      "hands": "feminine hands, slim fingers, smooth skin, no body hair, short natural nails with neutral or bare polish",
      "wrists": "slim feminine wrist, smooth skin, thin gold chain occasionally",
      "neck": "smooth feminine neck, no Adam''s apple, thin gold chain visible",
      "jawline": "soft feminine jawline, no facial hair, no beard shadow",
      "shoulders": "narrow feminine shoulders, lightly sun-kissed, soft musculature"
    }
  }'::jsonb
WHERE slug = 'vivienne';

-- Tier constraint update — allow new tier names alongside old ones (re-runnable)
ALTER TABLE chs_story_days DROP CONSTRAINT IF EXISTS chs_story_days_tier_check;
ALTER TABLE chs_story_days
  ADD CONSTRAINT chs_story_days_tier_check
  CHECK (tier IN ('grounded_routine','cinematic_melancholy','incidental_wrongness','entropy','lifestyle_travel','intimate_aesthetic'));

-- Hook text for carousel overlay (optional, ~35% of days)
ALTER TABLE chs_story_days ADD COLUMN IF NOT EXISTS hook_text text;

-- Per-slot hook text on carousel media assets
ALTER TABLE chs_media ADD COLUMN IF NOT EXISTS hook_text text;

-- Coordinated 5-slide carousel arc script (Hook → Rehook → Story → AHA → CTA)
ALTER TABLE chs_daily_plans ADD COLUMN IF NOT EXISTS carousel_script jsonb;

-- chs_daily_plans: track which styling profile was used each day
ALTER TABLE chs_daily_plans ADD COLUMN IF NOT EXISTS styling_profile text;

-- =============================================
-- Fix: remove suggestive prop hints that caused coffee to appear everywhere
-- =============================================
UPDATE chs_characters SET
  sacred_details = jsonb_set(
    sacred_details,
    '{props}',
    '[
      "espresso cup — ONLY at café terrace or balcony WITH a table surface. NEVER in bathroom, bedroom, hallway, beach, or any location without a table.",
      "champagne coupe or wine glass — ONLY at terrace, balcony, or restaurant WITH a table surface. Evening only. NEVER in bathroom or bedroom.",
      "oversized sunglasses — outdoor locations only. Can be worn or held in hand.",
      "small leather passport wallet — tan, worn, no logo. Arrival/departure scenes only.",
      "hotel key card — hotel room or corridor only. Never show room number.",
      "linen or hardcover book — terrace, balcony, or hotel room WITH a desk or table only. NEVER in bathroom or mid-walk."
    ]'::jsonb
  )
WHERE slug = 'vivienne';

-- =============================================
-- Vivienne — wardrobe_anchors reduced to character constants only.
-- Actual daily outfits now come from STYLING_PROFILES in lib/stylingDeck.ts.
-- Run this block in Supabase SQL Editor to apply.
-- =============================================
UPDATE chs_characters SET
  sacred_details = jsonb_set(
    sacred_details,
    '{wardrobe_anchors}',
    '[
      "thin gold chain necklace — always worn, regardless of outfit",
      "small gold stud or hoop earrings — always worn",
      "no logos, no branded items, no visible fashion house labels",
      "no plastic accessories, no cheap jewelry",
      "NOTE: daily outfit comes from the styling profile selected for this batch — see STYLING PROFILE FOR TODAY in scene brief"
    ]'::jsonb
  )
WHERE slug = 'vivienne';
