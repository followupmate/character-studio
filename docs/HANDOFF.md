# Handoff — Character Studio context for next session

Owner is pausing Opus 4.7 and switching to Sonnet 4.6 for cost reasons. This document captures everything Sonnet needs to continue without going in circles.

## State of the project

Character Studio is a Next.js + Supabase app that generates daily 8-slot Instagram/YouTube content batches for AI characters (text + image prompts), then publishes to IG / YT via Graph API.

**The technical infrastructure works. The pivot to Vivienne v2.0 (Luxury Travel + Sexy Aesthetic) is complete as of 2026-05-26.**

## What's broken and what's not

### Working ✓
- Daily cron at 06:00 UTC generates story_day + scene_brief + 8 slot prompts (3-wave generation, per-slot retry, reconcile job at 06:30)
- 8 slots: carousel_1..5, reel_start_frame (Kling helper), reel_video (Kling motion), story_bts
- 4 prompt doctrines: cinematic, instagram, editorial, deepseek — per-character switchable
- Scene brief with structured fields (spatial_setup, allowed_props, wardrobe_lock, color_palette, visual_rules, location_constraints, lighting_state, time_of_day, weather_implied) + 120-160-word prose doctrine
- Anti-confabulation prompt rules (no invention, no props by default unless archetype demands, no body hair on women, no legible text, foreground priority on textured environments)
- Phase 1 drift seed gate (days 1-30 = zero drift)
- Marseille Stranger data-layer filter (stripped from prompts unless drift seed active)
- Publish queue (chs_posts) — single source of truth
- /api/publish/from-batch — converts ready batch slots to scheduled chs_posts entries
- /api/publish/cron — dispatches due posts (accepts ?secret= query param, used by cron-job.org every 15 min)
- IG single + carousel + story posting works (Graph API)
- YT video posting works (resumable upload)
- /today, /growth, /publish, /launch, /playbook, /monetization, /prompts pages all functional

### Pivot complete — Vivienne v2.0

Drift Edition abandoned. Owner chose **A/B combo: Luxury Travel + Sexy Aesthetic**.

Vivienne is now a luxury traveller (Paris, Amalfi, Lisbon, Mykonos) with an editorial aesthetic and a Fanvue intimate content funnel. Dual monetization: brand deals + Fanvue subscriptions.

**Pivot implementation (2026-05-26):**
- `lib/storyTier.ts` — new tiers: `lifestyle_travel` (70%) / `intimate_aesthetic` (30%). Phase 1 (days 1-30) = travel only.
- `app/api/characters/story/route.ts` — VOICE_DOCTRINE rewritten for aspirational/candid travel. emotional_beat enum updated.
- `docs/SCENARIO.md` — rewritten as 4-phase commercial growth funnel (30/60/90/90+ days).
- `supabase/migration.sql` — v2.0 UPDATE appended with new backstory, visual_brief, personality, sacred_details.

**DB step required before first run:**
```sql
-- 1. Clear old Drift history
BEGIN;
DELETE FROM chs_posts WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
DELETE FROM chs_daily_plans WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
DELETE FROM chs_story_days WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
DELETE FROM chs_archetype_usage WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
COMMIT;

-- 2. Run the v2.0 UPDATE block from supabase/migration.sql (lines 349+)
-- 3. Trigger Day 1: GET /api/characters/story
```

## Scope of the pivot work

If the owner picks one of A/B/C, here is the implementation. Most of the codebase stays — the change is editorial config + one prompt block.

### Files that MUST change for a pivot
1. **`supabase/migration.sql`** — UPDATE statement for the `vivienne` row (or new INSERT for a new character with a different slug). Fields: `backstory`, `visual_brief`, `personality jsonb`, `sacred_details jsonb`. See current Drift values around lines 158+ of migration.sql as template; rewrite for the new archetype.
2. **`app/api/characters/story/route.ts`** — the `VOICE_DOCTRINE` const around line 17. Replace Drift voice rules with the new archetype's voice. Replace emotional_beat enum values in the JSON schema instructions to match.
3. **`lib/storyTier.ts`** — tier names + per-tier guidance. Drift has `grounded_routine` / `cinematic_melancholy`. Commercial archetypes will want different tier names like `lifestyle_daily` / `aspirational_aesthetic` or whatever fits.
4. **`docs/SCENARIO.md`** — rewrite from 5-phase 1-year erosion to a commercial growth funnel (week-based: launch, audience build, first link drop, monetization).
5. **Optional: delete `marseille_stranger`** from sacred_details if the new character has no recurring entity. Or repurpose as a different recurring motif.
6. **Optional: drop `reel_start_frame` + `reel_video`** from `DAILY_SLOTS` in `lib/archetypeDeck.ts` if video is dropped for first 60 days (recommended). Daily batch becomes 6 slots = 5 carousel + 1 story.

### Files that DON'T change
- All of `app/api/publish/*` — publish pipeline is character-agnostic
- `lib/dailyBatch.ts` — orchestrator works for any character / any slot count
- `lib/sceneBrief.ts` — scene brief generator is character-agnostic
- `lib/slotPrompts.ts` — all four doctrines work for any character; anti-confab + anatomy + text rules apply to any female character
- `lib/archetypeDeck.ts` — 15 archetypes work for any character (might add new ones for fitness — squat shot, etc.)
- All UI (`/today`, `/growth`, `/publish`, etc.) — character-agnostic
- `chs_*` schema — fine as-is

### Migration data step
If the owner picks A, B, or C:
1. Drop existing Vivienne history (SQL the owner has run before):
```sql
BEGIN;
DELETE FROM chs_posts WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
DELETE FROM chs_daily_plans WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
DELETE FROM chs_story_days WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
DELETE FROM chs_archetype_usage WHERE character_id = (SELECT id FROM chs_characters WHERE slug = 'vivienne');
COMMIT;
```
2. Update vivienne row (or create new row with new slug) with new backstory + sacred_details.
3. Run cron: `curl -X GET https://character-studio-mocha.vercel.app/api/characters/story` → Day 1 starts.

## Open work items in priority order

1. **Run DB migration v2.0** — clear old Drift data, run v2.0 UPDATE, trigger Day 1 cron. (Manual step, owner runs in Supabase dashboard.)
2. **PublishClient refactor** — 1325 LOC monolith, low priority but growing.
3. **story_link_url to DB** — currently localStorage, should be persisted in chs_posts.
4. **Astria LoRA** — deferred until v2.0 is producing daily content with acceptable Soul 2 quality.

## What NOT to do

- **Don't go back to Drift.** Pivot is done. Do not revert storyTier or VOICE_DOCTRINE.
- **Don't push Astria.** Revisit only after v2.0 is producing daily content with acceptable Soul 2 quality.
- **Don't redesign the publish pipeline.** It works. IG + YT integrations are live.
- **Don't touch IG/YT integration code in `/api/publish/post-now`, `/api/publish/post-instagram-carousel`, `/api/publish/post-instagram-story`, `/api/publish/sign-upload`.** Those are working live integrations.
- **Don't drop video slots.** Owner wants to keep reel_start_frame + reel_video. They stay in DAILY_SLOTS.

## Owner preferences (from session history)

- Slovak language for all explanations
- Short, opinionated responses; doesn't want fluff
- Wants real recommendations, not menus of options without a recommendation
- Frustrated by "going in circles" — values fast progress over thoroughness
- Cost-conscious (switched to Sonnet from Opus)
- Wants commercial success > artistic project
- Owns existing IG/YT accounts that posts go to live
- Currently uses Higgsfield Soul 2 (with SoulID2 character lock) for image gen
- Currently uses Kling 3.0 for video (manual workflow, no API integration in app)
- Has cron-job.org account set up with custom Authorization header for /api/publish/cron

## Commit history relevant to this session

Run `git log --oneline -30` to see the iteration history. Key commits in chronological order include the foundation batch architecture, Drift Edition voice, 4-doctrine switch, cinematic prompt simplification, page splits (launch / playbook / monetization), publish pipeline consolidation, anti-confabulation rules, reel start frame slot, anatomy anchors, foreground priority, Phase 1 drift gate, and the latest stranger filter + location lock fix.

## First message next session should send

> Pivot na Vivienne v2.0 (Luxury Travel + Sexy Aesthetic) je hotový. DB migráciu ešte treba spustiť manuálne v Supabase (SQL blok v HANDOFF.md sekcia "Pivot complete"). Po tom môžeme spustiť Day 1 cron. Čo chceš riešiť ďalej?
