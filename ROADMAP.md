# Roadmap

Pending work items, in priority order.

## 1. Astria LoRA integration (commit 2 — deferred)

**Goal:** replace Higgsfield SoulID2 as the character consistency engine. Astria trains a LoRA per character (one-time, ~$10–15), then unlimited inference at ~$0.005/image. No monthly subscription lock-in.

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

## 2. Aspirational — eliminate Higgsfield dependency entirely

Once Astria is solid for images and Kling for video, the Higgsfield SoulID2 lock-in becomes optional. Higgsfield can stay for users who prefer it, but Character Studio no longer requires it.
