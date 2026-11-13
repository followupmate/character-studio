# HANDOFF — YouTube changes of 2026-11-13 (read before touching YouTube code)

Audience: any coding agent (Grok, Claude, …) working in this repo.
Status: **intentional, tested, deployed.** Do not revert, "simplify" or re-apply any of this.
Full audit + reasoning (Slovak): `docs/YOUTUBE-2026-11-13.md`.

## 1. Channel (changed in YouTube Studio, not in code)

- Channel `UCdc5fU2ru8t2GvTaaw8AXzQ` is now **Vivienne / @viviennemov** (was madebyno1 / @madebyno1).
- New banner, avatar, description, Instagram link, keywords, Home tab with Shorts first.
- The description ends with `HIGGS-O4HD9` — keep it (external verification code).
- Do NOT rename the channel, change the handle or edit the description from code or automation.

## 2. Code — DO NOT CHANGE without the owner's explicit request

| File | What it does now | Do not |
|---|---|---|
| `lib/youtubeMeta.ts` | Builds YT title/description/tags per story day; strips IG-only CTAs and engagement bait; never uses a flirt-bait question as the title; optional Claude title with deterministic fallback | Do not go back to `` `${name} — ${date}` `` titles or to the raw IG caption as description |
| `lib/youtube.ts` | Shared OAuth token + `videos.list` stats fetch | Do not duplicate token code in routes |
| `lib/publishTime.ts` → `youtubeScheduleFor()` | YT copy of the reel goes **3 h after** the IG reel (18:30 CET); per-weekday override `posting_schedule[day].yt_reel` | Do not schedule YT at the IG time |
| `app/api/publish/from-batch`, `app/api/review/approve` | Idempotency is **per platform** (`reel:instagram` / `reel:youtube`); YT rows get `youtubeReelFields()`; Postgres `23505` = concurrent run, reported as skipped | Do not revert to the post_type-only check |
| `app/api/publish/post-now` | Upload sends `status.containsSyntheticMedia: true` (AI disclosure — **legally required**, YouTube had been auto-labelling), `selfDeclaredMadeForKids: false`, `snippet.tags`, `defaultLanguage/defaultAudioLanguage: "en"`; duplicate guard closes later batch twins as `failed` "duplicate of …" | Never remove `containsSyntheticMedia`; never remove the duplicate guard |
| `app/api/publish/import-youtube-stats` (+ cron `15 20 * * *` in `vercel.json`) | Daily YT views/likes/comments into `chs_posts.engagement.yt_*` | Do not merge YT numbers into `growth_score`, `growth_winner` or `chs_post_performance_snapshots` — those are IG-calibrated and feed creative-intelligence |
| `lib/instagramAgent.ts` | If sincerely asked "are you real / AI / a bot", answer honestly that Vivien is a digital character | Do not reintroduce "never confirm or deny AI nature" |

Data conventions:
- On `platform = 'youtube'` rows, `chs_posts.hashtags` holds **video tags**, not IG hashtags.
- `chs_characters.personality.comment_voice` was updated in the DB (AI-honesty rule + "is this real?" example). Seed `supabase/migration.sql` matches.

## 3. Database (applied to production)

- `supabase/20261113_posts_batch_unique.sql` — unique partial index `chs_posts_batch_one_per_day` on `(story_day_id, platform, post_type)` for `source='batch'`, non-failed rows created from 2026-11-13. It is what really stops the double uploads of 2026-10-30 / 2026-11-10. Do not drop it; do not insert a second live batch row for the same day/platform/type.

## 4. What was deliberately NOT changed

- The IG content pipeline and the **VHD v1 experiment** (`lib/experiments/*`, `docs/VHD-EXPERIMENT-V1.md`). The bedroom/intimate control arm is intentional; YouTube recommendations are applied only in the YouTube layer.
- Old non-Vivienne Shorts on the channel (World Cup, celebrity) stay public — owner's decision.

## 5. If something looks wrong

Ask the owner first. Tests covering this: `lib/youtubeMeta.test.ts` (titles, bait filter, tags limit, `youtubeScheduleFor`). Run `npx vitest run` and `npx tsc --noEmit` before any change near these files.
