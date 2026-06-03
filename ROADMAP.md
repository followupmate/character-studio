# Roadmap

Pending work items, in priority order.

## 0. STRATEGIC PIVOT — character spirit change (current priority)

**Status:** open decision. See `docs/HANDOFF.md` for full context.

The Drift Vivienne concept (ambient existential attachment, 1-year atmospheric erosion arc) has been deemed commercially unviable by the project owner:
- Anti-engagement-bait by design — slow burn doesn't earn algorithmic boost on IG/TikTok
- High-concept aesthetic ("atmospheric drift") is hard for current image generators (Soul 2) to render consistently
- Long monetization timeline (12+ months) doesn't match the project goal of fast revenue

**Decision required:** pick one of three commercial archetypes:
- **A) Soft Luxury Travel** — Paris/Milan/Lisbon, neutral palette, brand-deal + Fanvue dual monetization
- **B) Sexy Aesthetic** — direct Fanvue funnel, fastest revenue
- **C) Fitness Lifestyle** — health/workout/lifestyle, supplement/program monetization

**Once decided, implementation scope:**
- Rewrite `chs_characters` row (backstory, personality, sacred_details, visual_brief)
- Replace VOICE_DOCTRINE in `app/api/characters/story/route.ts`
- Update emotional_beat enum + tier mix in `lib/storyTier.ts`
- Rewrite `docs/SCENARIO.md` for the new arc (week-based growth funnel, not month-based erosion)
- Decide whether to keep `marseille_stranger` sacred field (drop unless new character has recurring entity)

The technical infrastructure (8-slot batch, scene brief, publish pipeline, IG/YT integration, cron-job.org wiring) is fully reusable. Only character data and editorial config change.

**Drift Vivienne is parked, not deleted.** All Drift work is preserved in commit history and can be restored as a "second character" later if the project succeeds with the commercial archetype.

## 1. Astria LoRA integration (commit 2 — deferred)

**Goal:** replace Higgsfield SoulID2 as the character consistency engine. Astria trains a LoRA per character (one-time, ~$10–15), then unlimited inference at ~$0.005/image. No monthly subscription lock-in.

**Status:** explicitly deferred by owner. Revisit after commercial pivot is live and producing daily content. The current Higgsfield-based pipeline is acceptable for the pivot character if the character has a clear/well-trained aesthetic (option A and B above).

**Prereqs from user:**
- Astria API key (https://www.astria.ai/users/edit#api)
- 10–20 reference images per character (1024×1024 preferred, varied angles/light, neutral background)
- Confirm tune type (default: `lora`, faster + cheaper than dreambooth)

**Schema additions (chs_characters):**
```sql
ALTER TABLE chs_characters
  ADD COLUMN consistency_engine    text DEFAULT 'higgsfield_soul2'
    CHECK (consistency_engine IN ('higgsfield_soul2','astria_lora','manual')),
  ADD COLUMN astria_tune_id        text,
  ADD COLUMN astria_tune_status    text,
  ADD COLUMN astria_class_name     text DEFAULT 'woman',
  ADD COLUMN reference_images_url  text[];
```

**Backend:**
- `lib/astria.ts` — API client (`createTune`, `getTune`, `createPrompt`)
- `POST /api/characters/astria/train` — uploads references, creates tune
- `GET /api/characters/astria/status?character_id=X` — polls tune status
- `POST /api/characters/astria/generate` — generates one media slot (input: `mediaId`, calls Astria with stored prompt + tune_id, writes `media_url` back to chs_media)

**UI:**
- `/characters`: per-character "Trénuj Astria LoRA" panel
  - Upload references → kick training → show poll status
- `/today`: per-photo-slot "Generuj cez Astria" button
  - Disabled while `astria_tune_status != 'trained'`
- Character settings: dropdown for `consistency_engine`

**Notes:**
- Astria reference repos (already linked by user): https://github.com/astriaai/headshots-starter and https://github.com/astriaai/imagine — useful for API patterns, no need to clone
- Once Astria is working for images, same flow can produce start frames for Kling 3.0 video pipeline
- Estimated implementation: 1 working day

## 2. Drop video slots temporarily

**Goal:** AI video (Seedance, Kling) is still uncanny-valley quality and time-expensive. For the first 30-60 days of the pivot character, ship carousel + story only. Add video back when there is audience signal and a clear motivation for the cost.

**Scope:** remove `reel_start_frame` and `reel_video` from `DAILY_SLOTS` in `lib/archetypeDeck.ts`. Daily batch becomes 6 slots instead of 8. All downstream code already handles variable slot counts.

**Reversible:** uncomment / re-add the two slots when video is ready.

## 3. Aspirational — eliminate Higgsfield dependency entirely

Once Astria is solid for images and Kling for video, the Higgsfield SoulID2 lock-in becomes optional. Higgsfield can stay for users who prefer it, but Character Studio no longer requires it.

## 4. Publish layer — deferred items

Originally listed as "intentionally NOT in Option A" of the publish review. Two of the four were addressed in the later Option B refactor (commit 38efda0); two remain.

### Completed in Option B
- ✅ Konsolidácia dvoch paralelných publish pipelines — `/api/characters/publish` je teraz thin wrapper nad `from-batch`, žiadny duplicitný IG kód. Single source of truth: chs_posts queue.
- ✅ Skutočné mapovanie 5-carousel batch slotov 1:1 na IG carousel auto-posting — `from-batch` vytvára JEDEN `chs_posts` row s `media_ids[]=[carousel_1..5]`, ktorý sa publikuje cez `post-instagram-carousel` v jedinom IG API call.

### Still deferred
- ⏳ Refactor `PublishClient.tsx` na menšie komponenty — 1126 LOC monolit s 19 useState hookmi. Single vs carousel logika vetvená všade. Risk regresií na živé IG/YT posty je nezanedbateľný; refactor sa oplatí keď bude solidný test coverage alebo druhý character. Plan: extract `BatchSection` (existuje), `ManualUploadForm`, `SchedulePanel`, `QueueTable` ako samostatné komponenty. Zdieľať file upload pipeline medzi single + carousel.
- ⏳ Migrácia `story_link_url` z localStorage do DB — dnes per-character ostáva v prehliadači užívateľa. Stratí sa pri prepnutí zariadenia / inkognito. Treba: nový stĺpec `chs_characters.default_story_link_url` (alebo na úroveň posts: `chs_posts.story_link_url` už existuje, ale default per character chýba), API update endpoint, čítanie v PublishClient.

