# Character Studio

Multi-character AI content platforma. Každý charakter má vlastný príbeh, konzistentnú tvár (Higgsfield Soul / character sheet), automatický posting na Instagram + YouTube a Fanvue monetizačný funnel.

## Stack

- **Next.js 15** (App Router, TypeScript strict) + Tailwind + motion
- **Supabase** (databáza s prefixom `chs_`, Storage, service key)
- **Claude API** (story + prompty + character DNA)
- **Generovanie médií**: Google Nano Banana / Veo (primárne) → Higgsfield Soul V2 (intimate fallback) → fal.ai FLUX LoRA; video: Seedance / Kling
- **Publikovanie**: IG Graph API, YouTube Data API, Fanvue API (OAuth)
- **Vercel** (hosting + crony) + cron-job.org (15-min publish tick)

## Ako to tečie

```
06:00 cron story ──► dailyBatch (scene brief + 8 slot promptov)
        │
/today UI alebo cron ──► generate-media (Google→Higgsfield→fal, 3-worker pool)
        │
from-batch ──► chs_posts queue ──► publish/cron (15 min) ──► IG / YT
        │                                                     │
fanvue drafty ──► /fanvue approve ──► set + publish        insights cron (20:00)
        │                                                     │
   Fanvue PPV € ◄──────────── Money Engine panel ◄──── growth_score
```

## Setup

### 1. Supabase migrácia
Supabase Dashboard → SQL Editor → spusti obsah `supabase/migration.sql` (idempotentný, dá sa púšťať opakovane).

### 2. Environment variables
```bash
cp .env.local.example .env.local
```
Example je kompletný a komentovaný. Minimum pre lokálny beh: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `APP_URL`. Pre generovanie: `GOOGLE_API_KEY`, `HIGGSFIELD_API_KEY`, `FAL_API_KEY`. Pre posting: `IG_ACCESS_TOKEN`, `IG_USER_ID`, `YOUTUBE_*`. Pre monetizáciu: `FANVUE_CLIENT_ID/SECRET`. **`CRON_SECRET` nastav vždy** — bez neho sú chránené routes otvorené.

### 3. Beh a kontrola
```bash
npm install
npm run dev      # lokálny vývoj
npm test         # unit testy (vitest)
npm run lint     # eslint
npm run build    # produkčný build
```
CI (`.github/workflows/ci.yml`) púšťa typecheck + lint + testy + build na každý PR.

### 4. Nový charakter
Cez wizard **`/create`** (6 krokov: koncept → DNA → Midjourney → Higgsfield fotky → Soul ID → launch s media configom a auto character sheetom). Rozpracovaný wizard sa ukladá do DB a dá sa obnoviť na `/create`.

### 5. Fanvue prepojenie (monetizácia)
1. Fanvue → Builder area → Create app, redirect URI `{APP_URL}/api/auth/fanvue/callback`
2. Client ID + Secret do env, otvor `/api/auth/fanvue` a autorizuj (tokeny idú do DB)
3. Na `/fanvue` nastav IG → Fanvue link (ide do IG bio + automaticky ako Story sticker)

### 6. Deploy
```bash
npx vercel --prod
```
Env variables: Vercel → Settings → Environment Variables.

## Crony (`vercel.json` + cron-job.org)

| Čas (UTC) | Route | Účel |
|---|---|---|
| 06:00 | `/api/characters/story` | denný príbeh pre aktívne charaktery |
| 06:30 | `/api/characters/reconcile` | retry zlyhaných slotov batchu |
| 10:00 | `/api/characters/publish` | legacy posting |
| 19:45 | `/api/fanvue/sync-snapshot` | Fanvue followers/subs/earnings → Money Engine |
| 20:00 | `/api/publish/import-insights` | IG metriky → growth_score |
| každých 15 min | `/api/publish/cron` (cron-job.org, `?secret=`) | dispatch naplánovaných postov |

## Kľúčové stránky

`/` dashboard (výstupy dňa, Money Engine) · `/today` denná produkcia · `/publish` queue a plánovanie · `/fanvue` unlock drafty + publish · `/growth` metriky · `/create` wizard · `/characters` správa charakterov

## DB schéma (hlavné tabuľky)

```
chs_characters      — charaktery + soul_id + media config + fanvue_link + feature_flags
chs_story_days      — denné príbehy (lokácia, mood, tier, caption)
chs_daily_plans     — produkčný batch dňa (scene brief, batch_status)
chs_media           — sloty batchu (prompt, media_url, generation_status)
chs_posts           — publish queue + engagement + growth_score
chs_fanvue_unlocks  — monetizačné drafty (copy, cena, set, publish stav)
chs_oauth_tokens    — Fanvue OAuth tokeny (auto-refresh)
chs_wizard_drafts   — rozpracované charaktery z /create
```

## Ďalšia dokumentácia

- `docs/HANDOFF.md` — kontext projektu a rozhodnutia
- `docs/AUDIT-2026-07-02.md` — audit + plán zlepšení (milestones)
- `docs/SESSION-2026-07-02.md` — posledné veľké zmeny + setup kroky
- `ROADMAP.md` — otvorené produktové rozhodnutia
