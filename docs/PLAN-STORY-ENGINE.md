# Vivienne Story Engine — plán a roadmapa

**Dátum:** 2026-08-21 · **Autor analýzy:** Claude (Fable 5) · **Určené pre:** implementačného agenta (Haiku) + majiteľa projektu
**Režim:** implementačný plán — každá fáza má presné súbory, migrácie a akceptačné kritériá. Fázy implementuj v poradí, každú ako samostatný commit (alebo sériu commitov), po každej fáze `npm test && npm run lint && npm run build`.

---

## 1. Diagnóza (podložená dátami z produkcie)

Analýza kódu + produkčnej DB (Supabase, 2026-08-21) ukázala, že problém NIE JE nedostatok infraštruktúry. Systém už má situačný engine (5 iterácií), life layer s kontinuitou, anti-repeat pamäť, Creative Intelligence s reálnymi IG metrikami aj publish pipeline. Problém je, že **systém generuje estetické momentky bez naratívneho plánu — a dáta presne ukazujú, prečo to prestalo fungovať**:

1. **Vivienne je 20+ dní zaseknutá v „home city".** `chs_story_days.life_state->current_city` = „home city" každý deň od začiatku augusta. Rooftop/bazén/terasa sa opakuje v ~10 z posledných 20 dní. Príčina: `docs/SCENARIO.md` hovorí „luxury traveller (Paríž, Amalfi, Lisabon)", ale **DB backstory hovorí opak** — „sunlit city apartment… pilates, café mornings, errands, quiet evenings" a `sacred_details.recurring_environment` kotví byt/gym/kaviareň s „occasional travel". Jediný mechanizmus cestovania je náhodný `weekend_trip` z `EVENT_DECK` v `lib/lifeState.ts` (rare pool, ~raz za mesiac). Editorial vrstva a charakter DNA si protirečia a náhoda rozhoduje, či sa vôbec niečo stane.

2. **Cestovný arc bol najvýkonnejší obsah v histórii účtu — a nikdy sa nezopakoval.** Júl mal jediný trip (Dubrovník, ~17.–20.7., pravdepodobne náhodný weekend_trip). Výsledok: týždeň 20.7. = **143 922 reach** (najlepší týždeň vôbec) a najvirálnejší reel účtu = **130k reach, 219k views, 314 saves** — „her bedroom, unmade bed — back home after Dubrovnik", teda *aftermath* dňa po tripe. Po návrate „domov" dosahy skolabovali: 2 165 → 2 840 → 1 601 → 588 reach/týždeň. Presne to je frustrácia majiteľa („dosahy sa strácajú") — a zároveň dôkaz, čo funguje: **cesta so začiatkom, vrcholom a návratom.**

3. **Reels sú single-shot klipy.** `reel_video` = jeden Kling i2v klip z jedného start framu (`app/api/characters/video-async/route.ts`). Discovery-mode `REEL_FORMATS` (`lib/reelFormats.ts`) dávajú retenčnú štruktúru len ako text v jednom prompte. Neexistuje storyboard — hook → build → payoff ako samostatné zábery. Divák nemá dôvod dopozerať ani sa vrátiť.

4. **Kontinuita existuje v dátach, ale divák ju nikdy nevidí.** `unresolved_thread`, `next_implication`, `continuity_phase` sa generujú a ukladajú, no caption/hook ich nikdy nepretaví do „pokračovanie zajtra". Každý post je pre publikum samostatný.

5. **Fanvue funnel fyzicky neexistuje.** `chs_characters.fanvue_link` = NULL, 12 unlock draftov / **0 publikovaných**, `fanvue_clicks` sa nikdy nemerali. CI „business axis" je slepá — nemá jediný datapoint.

6. **CI beží (28 snapshotov, generation bias zapnutý), ale môže ovplyvniť len estetiku dňa** (tier/lokácia/energia). Nemá žiadnu páku na naratívne rozhodnutia (kam ísť, kedy, na ako dlho) a `follows`/`profile_visits` IG API pre reels vôbec nevracia, takže rast followerov sa nemeria ani na účte.

**Záver:** netreba ďalšiu iteráciu promptov ani nový „sexy layer". Treba **naratívnu vrstvu NAD dňami** — plánovač životných arcov, ktorý diktuje kam sa Vivienne hýbe a prečo, storyboard engine pre reels s dejom, viditeľnú serialitu v captionoch a aktivovaný, merateľný Fanvue funnel. Všetko ostatné (situačný engine, publish, CI) sa zachováva a zapája sa pod túto vrstvu.

### Čo zachovať (nedotýkať sa)
- IG/YT posting routes: `app/api/publish/post-now`, `post-instagram-carousel`, `post-instagram-story`, `sign-upload`, `publish/cron` — živé integrácie.
- Situačný engine (`lib/situationPlanner.ts`, `situationValidation.ts`, `situationMemory.ts`) — funguje, nové vrstvy ho len kŕmia kontextom.
- Prompt Director (`lib/promptDirector/*`) — čerstvo doladený pre Soul 2 / Higgsfield.
- Feature-flag disciplína: **každá nová vrstva = nový flag na `chs_characters.feature_flags`, default off**, správanie bez flagu byte-identické.
- `supabase/migration.sql` je append-only idempotentný — nové DDL len pridávaj na koniec.
- Konvencia testov: čisté funkcie v `lib/` majú vitest testy; DB-bound funkcie sa netestujú.

---

## 2. Architektúra riešenia — prehľad

```
        ┌──────────────────────────────────────────────────┐
        │  FÁZA 1: ARC PLANNER (chs_arcs)                  │
        │  „život v kapitolách": trip / event / projekt    │
        │  diktuje: mesto, fázu dňa, smer, Fanvue hook     │
        └──────────────┬───────────────────────────────────┘
                       ▼
06:00 story cron ──► storyGeneration (existujúci situačný engine
                     + ARC CONTEXT namiesto náhodného EVENT_DECK)
                       │
                       ├─► FÁZA 2: SERIAL CAPTIONS (episode_label,
                       │    „part 2", cliffhanger v caption/hook)
                       │
                       ├─► FÁZA 3: STORYBOARD REELS (3 beaty:
                       │    hook → build → payoff; multi-klip + stitch)
                       │
                       └─► FÁZA 4: FANVUE ARC FUNNEL (tracking link,
                            arc continuation → unlock drafty → publish)
                       ▲
        ┌──────────────┴───────────────────────────────────┐
        │  FÁZA 5: ARC ANALYTICS (per-arc reach/follows,   │
        │  follower snapshoty, CI arc dimenzie)            │
        │  → spätná väzba do plánovania ďalšieho arcu      │
        └──────────────────────────────────────────────────┘
```

Nové feature flagy (pridaj do union typu v `lib/featureFlags.ts`):
`arc_planner_v1`, `serial_captions_v1`, `storyboard_reel_v1`, `fanvue_arc_funnel_v1`, `arc_analytics_v1`.

---

## 3. FÁZA 0 — Rekalibrácia charakteru a základ funnelu (0,5 dňa)

Bez tejto fázy nemá zmysel nič ďalšie: charakter DNA musí prestať protirečiť editorialu a funnel musí mať kam viesť.

### 0.1 Zosúladiť DNA s „traveller s domovom" konceptom
Append do `supabase/migration.sql` UPDATE blok pre `slug='vivienne'`:
- **Pomenovať domovské mesto.** Odporúčanie: **Barcelona** (Tier A mesto v SCENARIO.md — silné Soul 2 tréningové dáta, Stredomorie, vierohodné pre EÚ travellerku, bohaté typy lokácií: štvrte, pláž, rooftopy, nočný život). Backstory prepísať na: Vivienne žije v Barcelone (štvrť El Born / Eixample — vyber jedno a drž konzistentne), miluje svoje mesto, ale **žije v rytme domov ↔ cesty**: pár dní doma, potom trip, návrat, aftermath. Zachovaj jej existujúce každodenné kotvy (pilates, káva, byt s ranným svetlom) — tie fungujú ako „home interlude" identita.
- `sacred_details.recurring_environment`: doplniť „her Barcelona apartment", ponechať gym/kaviareň, a zmeniť „occasional travel" na „a recurring rhythm of trips — hotel rooms, terraces, coastlines, new cities — always returning home after".
- **Nemazať históriu.** Žiadne DELETE — kontinuita „home city" sa preklopí prirodzene prvým arcom (life_state.current_city sa začne diktovať, viď Fáza 1).

### 0.2 Manuálne kroky majiteľa (zapíš do docs, nevykonáva agent)
- Nastaviť `fanvue_link` na `/fanvue` stránke (IG bio + story sticker flow už existuje).
- Publikovať aspoň 3 z 12 existujúcich Fanvue unlock draftov (`/fanvue` approve flow) — funnel bez obsahu na druhej strane nemá zmysel.
- SCENARIO.md poznámka: sme vo fáze 2–3 (link v bio + občasný link drop je povolený).

### 0.3 Update `docs/SCENARIO.md`
Prepísať „Core principle" tak, aby zodpovedal realite: nie permanentná nomádka, ale **Barcelona-based lifestyle žena, ktorej život beží v arcoch** (doma → trip → návrat). Doplniť sekciu „Arc rhythm" (viď Fáza 1 pravidlá). Zvyšok (banned clichés, fázy monetizácie, Tier A/B mestá) ponechať.

**Akceptácia F0:** migračný blok idempotentný (2× spustenie bez chyby); `SELECT backstory FROM chs_characters WHERE slug='vivienne'` obsahuje Barcelonu; SCENARIO.md aktualizované; build zelený.

---

## 4. FÁZA 1 — Arc Planner (najväčšia páka; 1,5–2 dni)

Cieľ: život Vivienne sa plánuje v **arcoch** (3–7-dňové kapitoly s premisou, miestom a fázami), nie náhodným deckom. Trip do Lisabonu, víkend na Amalfi, hosťujúca kamarátka, projekt doma (prerábanie spálne, príprava na event) — všetko arc. `EVENT_DECK` mikro-eventy ostávajú len ako malé beaty POČAS home arcov.

### 4.1 Schéma (append do `supabase/migration.sql`)
```sql
CREATE TABLE IF NOT EXISTS chs_arcs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  uuid NOT NULL REFERENCES chs_characters(id) ON DELETE CASCADE,
  arc_type      text NOT NULL CHECK (arc_type IN ('trip','home_interlude','city_event','visitor','project')),
  title         text NOT NULL,                -- "Three days in Lisbon"
  premise       text NOT NULL,                -- prečo tam ide / o čo v arci ide (1–2 vety)
  city          text NOT NULL,                -- "Lisbon" | "Barcelona" (home)
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  day_plan      jsonb NOT NULL,               -- [{day_index, phase, focus, location_hint}]
  fanvue_hook   text,                         -- privátne pokračovanie arcu (viď Fáza 4)
  status        text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','done','cancelled')),
  tracking_link_url text,                     -- Fáza 4
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chs_arcs_character_dates ON chs_arcs(character_id, start_date, end_date);
ALTER TABLE chs_story_days ADD COLUMN IF NOT EXISTS arc_id uuid REFERENCES chs_arcs(id);
ALTER TABLE chs_story_days ADD COLUMN IF NOT EXISTS episode_label text;  -- Fáza 2, pridaj rovno
```
`day_plan.phase` hodnoty: `anticipation` (balenie, tešenie sa — deň pred), `travel` (presun), `arrival`, `exploration`, `peak` (vrchol arcu — najsilnejší obsah + Fanvue moment), `departure`, `aftermath` (doma po návrate). Home arcy používajú `setup`/`build`/`peak`/`aftermath` nad svojou premisou.

### 4.2 Nový modul `lib/arcPlanner.ts`
Vzor štruktúry: `lib/lifeState.ts` (DB čítanie + pure formátovanie + spec text).

- `getActiveArc(characterId, date)` — arc so `status IN ('planned','active')` pokrývajúci `date`; ak `planned` a `date >= start_date`, prepni na `active`.
- `getArcDayContext(arc, date)` → `{ phase, dayIndex, dayCount, focus, city, locationHint, isLastDay }` (pure, testovať).
- `arcContextBlock(ctx)` — pure, testovať. Text do story system promptu, štýl `lifeContextBlock()`:
  ```
  ARC CONTEXT (today is day ${dayIndex}/${dayCount} of "${title}" — ${premise}):
  - phase today: ${phase} — ${focus}
  - city (MANDATORY — the story MUST take place here): ${city}
  - location hint: ${locationHint}
  - yesterday's unresolved thread belongs to this arc — continue it, don't reset.
  RULE: life_state.current_city MUST equal "${city}". The day's location must be a concrete
  micro-location inside this city/phase (arrival day → station/airport/hotel check-in energy;
  aftermath → home, physical traces of the trip visible).
  ```
- `planNextArc(characterId)` — Claude call (`lib/anthropic.ts`), vstupy: character DNA (backstory, sacred_details), posledné 3 arcy (typy + mestá + výkon ak existuje — Fáza 5), Tier A/B mestá zo SCENARIO.md (zakóduj ako konštantu `ARC_CITY_POOL`), aktuálna sezóna. Výstup: JSON arc (title, premise, arc_type, city, dĺžka, day_plan, fanvue_hook). **Pravidlá rytmu (vlož do promptu aj validuj kódom):**
  - po `trip` arci VŽDY nasleduje `home_interlude` (2–4 dni) — dáta ukazujú, že aftermath doma je najvýkonnejší obsah;
  - max 1 trip za ~10 dní; trip = 3–5 dní; nikdy 2 tripy za sebou;
  - `home_interlude` má vlastnú premisu (projekt, návšteva, event v Barcelone) — nikdy nie je „výplň";
  - striedaj typy — nikdy 3× rovnaký `arc_type` za sebou; nové mesto max 1× za 3–4 týždne, návratové mestá (2–3 „druhé domovy") buduj opakovane.
  - deterministickú časť validácie extrahuj ako pure `validateArcPlan(arc, previousArcs)` + vitest test.
- `maybeAutoPlanArc(characterId, date)` — ak neexistuje arc pokrývajúci `date + 2 dni`, zavolaj `planNextArc` a ulož so `status='planned'`. Volané zo story cronu → **plná automatizácia, žiadny manuálny krok**.

### 4.3 Integrácia do `lib/storyGeneration.ts` + `app/api/characters/story/route.ts`
Za flagom `arc_planner_v1` (pattern: rovnaký ako `life_layer` gating):
1. Pred story callom: `maybeAutoPlanArc` → `getActiveArc` → `getArcDayContext` → `arcContextBlock` vlož do system promptu HNEĎ za life context block.
2. `maybeCreateLifeEvent` z `lib/lifeState.ts` volaj **len keď** aktívny arc je `home_interlude` (mikro-eventy = malé beaty doma; tripy už nikdy nevznikajú náhodou z decku — `weekend_trip` položku z `EVENT_DECK` odstráň keď je flag on, t. j. filtruj v gate, nie zo súboru).
3. Po úspešnom uložení story day: zapíš `chs_story_days.arc_id`; ak `isLastDay`, arc `status='done'`.
4. `life_state.current_city` po parse **prepíš hodnotou z arcu** (diktát, nie dôvera LLM — rovnaký princíp ako `dictatedSexualEnergyLevel`).
5. Kontrakt: flag off ⇒ byte-identické správanie (unit test na assembly funkciu, ak je pure).

### 4.4 API + UI
- `app/api/characters/arcs/route.ts`: GET (zoznam + aktívny arc), POST `{action:'plan'}` (naplánuj ďalší), POST `{action:'replan', arc_id}` (zruš planned + nový), POST `{action:'cancel', arc_id}`. Auth: rovnaký guard ako ostatné routes (`lib/apiAuth.ts`).
- `/today` UI: nový panel **Arc** (komponent `components/today/ArcPanel.tsx`): názov, mesto, deň X/Y, fáza dňa, premisa, ďalší planned arc + tlačidlá Preplánuj / Zruš. Vizuálny vzor: existujúce panely na `/today`.

**Akceptácia F1:** flag off = žiadna zmena správania; flag on: story day má `arc_id`, `current_city` = mesto arcu, po trip arci sa automaticky naplánuje home_interlude; `validateArcPlan` + `getArcDayContext` + `arcContextBlock` majú testy; ArcPanel zobrazuje aktívny arc.

---

## 5. FÁZA 2 — Viditeľná serialita (0,5 dňa)

Cieľ: divák MUSÍ vidieť, že príbeh pokračuje — to je dôvod na follow.

Za flagom `serial_captions_v1` (vyžaduje `arc_planner_v1`):

1. **`episode_label`**: pri generovaní story day ulož `chs_story_days.episode_label` = `"${city} — day ${dayIndex}/${dayCount}"` (home_interlude: label z premisy, napr. „the bedroom project — part 2"). Zobraz v `/today` a `/publish` pri postoch (read-only text).
2. **Caption pravidlá** — do OUTPUT FORMAT bloku v story prompte (`app/api/characters/story/route.ts`) pridaj za flagom:
   ```
   SERIAL RULES (arc active):
   - ig_caption MUST anchor today in the arc naturally (e.g. "day 2 in lisbon and
     i'm not ok", "packing. again. you'll see why tomorrow") — never a generic caption.
   - if tomorrow continues the arc (not the last day): END the caption with a forward
     tease — one short clause that makes tomorrow a promise ("tomorrow: the boat.").
   - aftermath day: caption references the trip physically, not sentimentally.
   - hook_text (overlay): on arc days ALWAYS provide it, aligned with the arc
     ("lisbon, day 2", "she's back", "wait for tomorrow").
   ```
3. **Story slot ako teaser**: `story_bts` slot framing (v `lib/archetypeDeck.ts` alebo discovery framing) dostane za flagom dovetok: posledný story frame dňa vizuálne naznačuje zajtrajšok (zbalený kufor pri dverách, boarding pass na stole) — bez textu v obraze (generátory nevedia písať; pravidlo už existuje v `REEL_FORMATS` komentári).

**Akceptácia F2:** arc dni majú episode_label; caption obsahuje arc kotvu a (mimo posledného dňa) forward tease; flag off = pôvodné captiony.

---

## 6. FÁZA 3 — Storyboard Reels (dej vo videu; 2 dni, dve etapy)

Cieľ: reel nie je „jeden pohyb", ale mini-scéna s hook → build → payoff.

### Etapa 3a — 3-beatová réžia v jednom klipe (0,5 dňa, lacné, okamžité)
Za flagom `storyboard_reel_v1`:
- V `lib/dailyBatch.ts` (miesto, kde sa skladá `reel_video` framing) + `lib/promptDirector/videoSections.ts`: motion prompt pre reel_video sa štruktúruje ako 3 beaty s časovaním:
  ```
  BEAT 1 (0–2s, HOOK): ${hook — z reelFormat.coverCue + situation.magnetic_hook}
  BEAT 2 (2–5s, BUILD): ${vývoj — situation.activity v pohybe}
  BEAT 3 (5–8s, PAYOFF): ${payoff — reelFormat payoff / arc tease; končí frame-om vhodným na loop}
  ```
  Beaty odvoď deterministicky zo `situation` + `reelFormat` (pure funkcia `buildReelBeats(situation, reelFormat, arcCtx?)` v novom `lib/reelStoryboard.ts`, s testami). Kling 3 zvláda 8–10 s — over `duration` parameter vo `video-async` (dnes default 5 s) a pri flagu zvýš na 8–10 s.

### Etapa 3b — multi-klip storyboard so stitchom (1–1,5 dňa)
- **Schéma** (append migration):
  ```sql
  CREATE TABLE IF NOT EXISTS chs_storyboards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL,
    media_id uuid NOT NULL,              -- reel_video slot row v chs_media
    beats jsonb NOT NULL,                -- [{index, role:'hook'|'build'|'payoff', frame_prompt, motion_prompt, frame_url, clip_url, status}]
    stitched_url text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generating','ready','failed')),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- `lib/reelStoryboard.ts` rozšír: `buildStoryboard(situation, sceneBrief, reelFormat, arcCtx?)` → 3 beaty, každý s vlastným frame_promptom (Prompt Director image compile — rovnaká scéna/wardrobe/svetlo, iný framing: wide → medium → close/payoff) a motion_promptom.
- `app/api/characters/storyboard/route.ts`: POST `{mediaId, action:'generate'}` — vygeneruj 3 start framy (existujúca image pipeline), potom 3× Kling i2v 4–5 s (rozšír state machine vzor z `video-async/route.ts` — poll cez `higgsfield_job_id` JSON stav, beat po beate), potom stitch.
- **Stitch:** fal.ai ffmpeg compose endpoint (`fal-ai/ffmpeg-api/compose` — **over presný model id v fal docs pri implementácii**; fallback: `fal-ai/ffmpeg-api/merge-videos`). Vstup: 3 clip_url v poradí, výstup `stitched_url` → zapíš do `chs_media.media_url` reel_video slotu ⇒ zvyšok publish pipeline funguje bez zmeny.
- **UI**: `components/today/StoryboardCard.tsx` — 3 beaty vedľa seba (frame náhľad, motion text, per-beat Regeneruj), tlačidlo „Zlož reel". Zobrazuje sa namiesto klasickej reel karty keď storyboard existuje.
- **Cost guard:** storyboard reel = ~3× Kling cena. Default: storyboard len 1×/deň; na `peak` a `aftermath` dni arcu automaticky, inak single-shot 3a réžia. (Konštanta v `lib/reelStoryboard.ts`, nech sa dá ladiť.)

**Akceptácia F3:** 3a: reel prompt obsahuje 3 časované beaty (test na `buildReelBeats`); 3b: storyboard vygeneruje 3 klipy + stitched_url, publish reel použije stitched video; per-beat regenerácia funguje; flag off = dnešný single-shot flow.

---

## 7. FÁZA 4 — Fanvue arc funnel (1 deň)

Cieľ: prirodzená gradácia Instagram → Fanvue: každý arc má „privátne pokračovanie", nie náhodný lingerie post.

Za flagom `fanvue_arc_funnel_v1` (vyžaduje `arc_planner_v1`):

1. **`fanvue_hook` arcu riadi unlock drafty.** `lib/fanvueUnlock.ts` / `lib/fanvueContinuation.ts`: keď má dnešný deň arc s `fanvue_hook` a fáza je `peak` alebo `aftermath`, continuation draft sa generuje z arc hooku (logické privátne pokračovanie TEJ ISTEJ udalosti/miesta/outfitu — mechanizmus `fanvue_tension.continuation` už existuje, len ho nasmeruj na arc hook). Príklad: peak deň „večer na jachte" → unlock „the rest of that night, off the boat deck".
2. **Caption link drop na peak/aftermath:** v serial rules (F2) pridaj — na `peak` deň smie caption skončiť soft CTA v hlase Vivienne („the rest didn't make it here. you know where."), max 1× za arc (SCENARIO fáza 3 pravidlo: 1 link drop/týždeň — dodrž).
3. **Fanvue tracking link per arc:** `lib/fanvue.ts` rozšír o `createTrackingLink(name)` (Fanvue API `POST /tracking-links` — over presnú cestu v API docs; klient + OAuth už existujú). Pri aktivácii arcu vytvor link `arc-${slug}-${start_date}`, ulož `chs_arcs.tracking_link_url`. Story sticker / bio link flow (`/fanvue` stránka) ponúkne arc link namiesto generického.
4. **Sync klikov:** rozšír `app/api/fanvue/sync-snapshot/route.ts` (cron 19:45) — stiahni tracking-link stats, zapíš do `chs_arcs` (pridaj stĺpec `tracking_clicks int`) a agregovane do `chs_posts.engagement.fanvue_clicks` pre posty arcu (aproximatívna atribúcia: kliky arcu / posty arcu — poznač v kóde ako aproximáciu, CI business axis konečne dostane dáta).

**Akceptácia F4:** peak deň vygeneruje arc-viazaný unlock draft; arc má tracking link; sync zapisuje kliky; žiadny automatický Fanvue publish (approval-gate ostáva — publish stále len cez `/fanvue` UI).

---

## 8. FÁZA 5 — Arc analytics + uzavretie slučky (1 deň)

Za flagom `arc_analytics_v1`:

1. **Denný follower snapshot** (rieši dieru „IG nevracia follows pre reels"): nová tabuľka
   ```sql
   CREATE TABLE IF NOT EXISTS chs_account_snapshots (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     character_id uuid NOT NULL REFERENCES chs_characters(id) ON DELETE CASCADE,
     date date NOT NULL,
     ig_followers int, fanvue_followers int, fanvue_subscribers int,
     UNIQUE (character_id, date)
   );
   ```
   V `import-insights` crone (20:00) pridaj 1 call na IG Graph `GET /{ig-user-id}?fields=followers_count` a upsert; Fanvue čísla už tečú v `sync-snapshot` — zapisuj ich sem tiež.
2. **Per-arc výkon:** `lib/creativeIntelligence/arcPerformance.ts` — `getArcPerformance(characterId)`: pre každý done arc agreguj z `chs_posts` (join cez `chs_story_days.arc_id`): total/avg reach, saves, shares, delta followerov počas arcu (zo snapshotov), tracking_clicks. Pure agregácia nad načítanými riadkami → test.
3. **CI dimenzie:** `ContentDescriptor` (`lib/creativeIntelligence/types.ts`) + `performanceSnapshots.ts` doplň `arc_type: string | null`, `arc_phase: string | null`. Staré riadky = null (kontrakt „nikdy nefabulovať" ostáva).
4. **Spätná väzba do plánovača:** `planNextArc` dostane blok „ARC LEARNINGS" — top 3 arc typy/mestá/fázy podľa `getArcPerformance` (formát: „trip→Lisbon: avg reach 4.2k/post, +38 followers; aftermath days outperform peak 2.1×"). Žiadne dáta ⇒ blok sa vynechá.
5. **UI:** `/growth` alebo `dashboard/creative-intelligence` — sekcia „Arcs": tabuľka done arcov s reach/followers/clicks + porovnanie fáz.

**Akceptácia F5:** snapshoty pribúdajú denne; done arc má vypočítateľný výkon; plánovací prompt obsahuje learnings keď existujú; CI descriptor nesie arc dimenzie.

---

## 9. Poradie, odhady, riziká

| Poradie | Fáza | Effort | Prináša |
|---|---|---|---|
| 1 | F0 rekalibrácia + funnel základ | 0,5 d | odstráni rozpor DNA↔editorial; funnel má cieľ |
| 2 | F1 Arc Planner | 1,5–2 d | **hlavná páka** — dej, pohyb, dôvod na follow |
| 3 | F2 serialita | 0,5 d | dej sa stane viditeľným pre diváka |
| 4 | F3a beat réžia | 0,5 d | okamžite lepšia retencia reelov, lacné |
| 5 | F4 Fanvue funnel | 1 d | monetizácia + prvé business dáta |
| 6 | F3b storyboard stitch | 1–1,5 d | plnohodnotné mini-scény |
| 7 | F5 arc analytics | 1 d | slučka sa uzavrie — plánovanie z dát |

**Riziká / poctivé poznámky:**
- Kolaps dosahov po 27.7. môže mať aj algoritmickú/účtovú zložku (po virále IG často „resetne" distribúciu). Plán rieši obsahovú stránku — jedinú, ktorú vieme ovplyvniť. Kadenciu (2 reely/deň) nemeniť, účet nemazať, formáty striedať.
- Multi-klip konzistencia tváre medzi beatmi: všetky framy idú cez Soul ID / Prompt Director s tou istou scene brief — rovnaká garancia ako dnešné carousel sloty (5 konzistentných fotiek už systém robí). Rizikový je len strih pohybu — preto beat 1 = existujúci reel_start_frame a stitch je jednoduchá konkatenácia, nie prechody.
- fal ffmpeg endpoint id a Fanvue tracking-link endpoint treba overiť v aktuálnych docs pri implementácii (označené v texte).
- Flag disciplína je nedotknuteľná: každá fáza sa dá vypnúť per-character bez rollbacku DB.

## 10. Kontrolný zoznam pre implementačného agenta

1. Pracuj fázu po fáze, v poradí z §9. Jeden logický celok = jeden commit (`feat(arc-planner): …`).
2. Po každej fáze: `npm test && npm run lint && npm run build` — nič nemerguj červené.
3. Nové pure funkcie v `lib/` = vitest test v sesterskom `*.test.ts` (vzor: `lib/storyTier.test.ts`).
4. DDL len append do `supabase/migration.sql`, vždy `IF NOT EXISTS` / idempotentné.
5. Nikdy nemeniť: `app/api/publish/post-*`, `sign-upload`, `publish/cron` logiku, situačnú validáciu, Prompt Director výstupné formáty.
6. Nové flagy pridaj do `lib/featureFlags.ts` union typu; gating vzor kopíruj z `open_life_generation_v1` v `lib/storyGeneration.ts`.
7. Texty promptov po anglicky (konzistentné s existujúcimi), UI texty po slovensky (konzistentné s existujúcim UI).
8. Po dokončení F1 zapni `arc_planner_v1` pre Vivienne až po manuálnej kontrole prvého vygenerovaného arcu majiteľom (UPDATE feature_flags v Supabase — zapíš do docs ako manuálny krok).
