# Character Studio

Multi-character AI content platform. Každý charakter má vlastný príbeh, Higgsfield Soul ID a automatický posting na Instagram + YouTube.

## Stack

- **Next.js 15** (App Router)
- **Supabase** (databáza, prefix `chs_`)
- **Claude API** (story + prompt generation)
- **Higgsfield** (foto + video generovanie)
- **Vercel** (hosting + cron jobs)

## Setup

### 1. Supabase migrácia

Otvor Supabase Dashboard → SQL Editor → skopíruj obsah `supabase/migration.sql` → Run.

### 2. Environment variables

Skopíruj `.env.local.example` → `.env.local` a vyplň:

```bash
cp .env.local.example .env.local
```

Povinné pre spustenie:
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `APP_URL` (http://localhost:3000 pre dev)

### 3. Inštalácia a spustenie

```bash
npm install
npm run dev
```

### 4. Higgsfield Soul ID

Po získaní Soul ID pre Vivienne:

```sql
UPDATE chs_characters 
SET soul_id = 'tvoje-soul-id' 
WHERE slug = 'vivienne';
```

### 5. Deploy na Vercel

```bash
npx vercel --prod
```

Vlož env variables do Vercel → Settings → Environment Variables.

Cron jobs sa aktivujú automaticky z `vercel.json`:
- `06:00 UTC` — generuje príbeh pre všetky aktívne charaktery
- `10:00 UTC` — postuje hotové médiá

## API Routes

| Route | Method | Popis |
|-------|--------|-------|
| `/api/characters/story` | GET | Generuje dnešný príbeh |
| `/api/characters/prompts` | POST | Generuje Higgsfield prompty |
| `/api/characters/publish` | GET | Postuje na IG + YouTube |

## Pridanie nového charakteru

```sql
INSERT INTO chs_characters (name, slug, visual_brief, backstory, platforms)
VALUES (
  'Marcus',
  'marcus',
  'Fyzický popis...',
  'Backstory...',
  '{instagram}'
);
```

## DB Schéma

```
chs_characters    — charaktery + Soul ID + backstory
chs_story_days    — denné príbehy + lokácia + nálada
chs_media         — foto/video prompty + Higgsfield job ID
chs_posts         — posting log + engagement
```
