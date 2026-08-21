# Prompt Quality & Luxury World — plán a roadmapa

**Dátum:** 2026-08-21 · **Autor analýzy:** Claude (Fable 5) · **Určené pre:** implementačného agenta (Haiku) + majiteľa
**Nadväzuje na:** `docs/PLAN-STORY-ENGINE.md` (Story Engine F0–F2 nasadené). Fázy implementuj v poradí, po každej `npm test && npm run lint && npm run build`.

---

## 1. Diagnóza (podložená reálnymi promptami z produkcie)

Analyzoval som skutočné prompty v `chs_media.higgsfield_prompt` (17.–22.8.) a celý kompilačný reťazec (`lib/promptDirector/*`, `lib/archetypeDeck.ts`, `lib/sceneBrief.ts`, `lib/higgsfieldSoul.ts`). Príčiny sú konkrétne a lokalizované:

### A. Zdvojená scéna — príčina nájdená (KRITICKÉ)

Reálny prompt reel_start_frame z 21.8. začína:

> „Vertical framing. **Same scene, light, wardrobe as the earlier shot. Subject anchored in the pose the motion continues from — caught mid-action.**"

Soul 2 žiadny „earlier shot" nemá — text číta doslovne ako zadanie zobraziť DVE scény/momenty v jednom obraze → zlepená/zdvojená kompozícia. Mechanizmus vzniku:

1. `lib/archetypeDeck.ts` slot.framing texty sú **réžijné meta-texty** písané pre človeka/LLM („Same scene… as carousel_2", „Reads as the opening line of a visual sentence", „the pose the reel_video motion continues from").
2. Legacy Nano Banana path ich prežuje cez LLM rewrite (paraphrase). **Prompt Director je deterministický** — posiela ich po regex sanitizácii priamo do Soul 2.
3. Sanitizer `TARGETED_FRAMING_REWRITES` v [lib/promptDirector/imageSections.ts](../lib/promptDirector/imageSections.ts) (~riadok 280) nahrádza `carousel_X` → **„the earlier shot"** — odstránil interné ID, ale vyrobil NOVÚ meta-referenciu, ktorú model renderuje.

### B. Genericita a slabá atmosféra — tri mechanizmy

1. **Fixné estetické stringy, identické každý deň** (`buildAestheticSection`/`buildRealismSection`): „candid social-media realism", „relaxed, natural body language", „natural skin texture realistic clothing folds natural phone exposure". Celý feed má rovnaký estetický podpis. Navyše „social-media/phone realism" je **priamo anti-luxusný** smer — tlačí každý obraz do lacnej phone-snap estetiky.
2. **Fragmentové lepenie bez interpunkcie**: `sectionToFull` v [modelProfiles.ts](../lib/promptDirector/modelProfiles.ts) robí `lines.join(" ")` → „…soft musculature Natural mid-step or ready-to-move pose." + surový enum leak „**golden_hour** mood" (s podčiarkovníkom). Slovný šalát znižuje spoľahlivosť interpretácie.
3. **Agresívne word budgety s front-truncation** (`SOUL2_WORD_BUDGET`: scéna 45 slov, z toho wardrobe 14; lighting 20; aesthetic 13): bohatý 120–160-slovný scene brief sa oreže na prvé klauzuly — atmosféra, hĺbka a materiálové detaily vypadnú ako prvé, vždy rovnakým spôsobom.

### C. Negatívny prompt sa zahadzuje

`buildNegatives()` poctivo skladá negatívy („no text", „identity drift", „no invented props"…), ale [lib/higgsfieldSoul.ts](../lib/higgsfieldSoul.ts) `generateSoulImage()` posiela len `prompt + aspect_ratio + resolution + enhance_prompt + custom_reference_id`. **`negativePrompt` z PromptPackage sa nikdy neodošle.** Chýba aj akákoľvek anti-diptych ochrana.

### D. Luxus nemá v pipeline žiadneho strážcu

- Prostredie vzniká reťazou: story LLM `location` (free text) → scene brief LLM → kompresia. **Nikde neexistuje doktrína kvality prostredia** — žiadna materiálová paleta, žiadne zákazy. Výsledok v produkcii: „warm concrete pavement", „galvanised buckets", generické „gym — mirrors".
- `luxury_seduction_v1` rieši outfit/pózu/status signál — ale NIE materiálovú kvalitu prostredia.
- Estetický smer „candid phone realism" (bod B1) aktívne bojuje proti editorial-luxury zámeru.

### E. Dva paralelné prompt svety

Legacy path (`lib/slotPrompts.ts`, LLM rewrite, pre Nano Banana) a Prompt Director (deterministický, pre Soul 2) žijú vedľa seba s prepínačom (commit d2309f8). Prompty z 19.–20.8. (krátke, konkrétne, jedna scéna — „Mid-shot, slight low angle. White linen dress. She glances left past camera, paper-wrapped ranunculus…") boli výrazne lepšie než deterministické z 21.–22.8. — dôkaz, že **jazykovo súvislý, konkrétny prompt funguje; fragmentová šablóna nie**.

### Čo je zdravé (nemeniť)

Vstupná dátová vrstva je bohatá a správna: situation planner (aktivita/dôvod/póza/energia), scene brief (spatial/wardrobe/light lock), styling deck, sacred details, Soul ID identita cez API parameter. Problém je výhradne v **poslednej míli — ako sa z faktov skladá text promptu — a v chýbajúcej doktríne sveta**.

---

## 2. Riešenie — tri vrstvy (implementovať všetky, v tomto poradí)

```
FAKTY (existujúce: scene brief + situation + styling + arc)
   │
   ├─ F1: LUXURY WORLD BIBLE (dátová doktrína sveta — materiály,
   │      lokácie, zákazy) → vstupuje do story/scene brief/negatívov
   ▼
F0: OPRAVENÝ DETERMINISTICKÝ COMPILER (hotfix — žiadne meta vety,
    čisté vety, negatívy sa posielajú)  ← fallback navždy
   ▼
F2: LLM PROMPT WRITER (finálny pass — z faktov napíše jeden súvislý
    60–110-slovný editorial prompt; validovaný proti lockom)
   ▼
F3: ESTETICKÁ VARIABILITA (rotácia fotografického štýlu, koniec
    fixných stringov)
```

Nové flagy do `lib/featureFlags.ts`: `prompt_writer_v1`, `luxury_world_v1`. (F0 je oprava chýb — bez flagu, správanie sa mení pre každého, kto má `prompt_director_v1`.)

---

## 3. FÁZA 0 — Hotfix deterministického compilera (0,5–1 deň) 🔴 najprv

Všetko v `lib/promptDirector/` + `lib/higgsfieldSoul.ts`. Cieľ: žiadna meta veta, žiadny fragmentový šalát, negatívy sa reálne posielajú.

### 0.1 Slot framing: nahradiť sanitizáciu čistými vizuálnymi konštantami
V [imageSections.ts](../lib/promptDirector/imageSections.ts) doplň `SOUL2_SLOT_FRAMING: Partial<Record<SlotName, string>>` — pre KAŽDÝ slot čistý vizuálny popis záberu (žiadne odkazy na iné sloty/video/overlay/„visual sentence"). Návrh hodnôt:

- `carousel_1`: "Wide establishing shot, subject small in a layered environment, off-center composition."
- `carousel_2`: "Medium shot, subject present in the space, natural stance."
- `carousel_3`: "Close detail shot of hands, fabric or surface texture, face out of frame."
- `carousel_4`: "Medium close-up, subject absorbed in the moment, not looking at camera."
- `carousel_5`: "Close-up on face, direct expressive moment, eyes carrying the emotion."
- `reel_start_frame`: "Vertical 9:16, single continuous scene, subject mid-action in a natural sustainable pose, face clearly visible, clean negative space in the top third."
- `story_bts`: "Vertical 9:16 candid frame, relaxed unposed moment, natural imperfect framing."

`buildCameraSection` použije `SOUL2_SLOT_FRAMING[slot] ?? sanitizeFramingForSoul2(framing)` (fallback pre neznáme sloty ostáva). `sanitizeFramingForSoul2` NEMAZAŤ (fallback + testy), ale:
- rewrite `carousel_X` → **odstrániť celú vetu** obsahujúcu odkaz (nie nahradiť „the earlier shot" — pridaj „earlier shot"/„previous shot"/„the shot" do `SOUL2_FORBIDDEN_TERMS`, sentence-filter ju zahodí),
- to isté pre „the pose the motion continues from" — pridaj „motion continues"/„continues from" do forbidden terms.

### 0.2 Identita: zrušiť meta vetu o Soul ID
`buildIdentitySection` pri existujúcom soulId vracia dnes „Same character identity as the Soul ID reference." — meta odkaz na referenciu. Nahradiť neutrálnym single-subject lockom: **"One woman alone in the frame."** (+ anatomy anchor riadky ako doteraz). Zároveň „soul id" pridať do forbidden terms.

### 0.3 Vetná skladba namiesto join(" ")
V [modelProfiles.ts](../lib/promptDirector/modelProfiles.ts) `sectionToFull`: každý line ukončiť bodkou ak nemá terminálnu interpunkciu, spájať medzerou → „…soft musculature. Natural mid-step pose." namiesto šalátu. (`sectionToConcise` pre video nechať.)

### 0.4 Enum leak
`buildAestheticSection`/`buildLightingSection`: `time_of_day` mapovať na prirodzený jazyk — `golden_hour` → „golden hour light", `blue_hour` → „blue hour dusk", `indoor_lamp` → „warm lamp-lit interior", `fluorescent` → „cool artificial light", ostatné bez podčiarkovníkov. Malá pure funkcia `humanizeTimeOfDay()` + test.

### 0.5 Posielať negatívy + anti-diptych
- [higgsfieldSoul.ts](../lib/higgsfieldSoul.ts) `generateSoulImage(opts)`: pridaj `negativePrompt?: string`; do request body pridaj pole pre negatívy — **over presný názov parametra v Higgsfield API docs** (kandidáti: `negative_prompt`; ak API negatívy nepodporuje, appenduj na koniec promptu blok „Avoid: …" a zdokumentuj to v kóde).
- `BASE_IMAGE_NEGATIVES` v [negativeBuilder.ts](../lib/promptDirector/negativeBuilder.ts) rozšíriť o anti-doubling: `"split frame", "diptych", "collage", "two panels", "duplicated person", "second copy of the same woman"`.
- Pretiahnuť `PromptPackage.negativePrompt` cez volajúce miesta (generate-media / generate-higgsfield / prompt-director-preview) až do `generateSoulImage`.

### 0.6 Word budgety uvoľniť
`SOUL2_WORD_BUDGET`: total 180 → **220**, scene 45 → **70** (spatial 28 → 45, wardrobe 14 → 20), lighting 20 → **25**. (Soul 2 znesie dlhší prompt; dnešné orezanie zabíja atmosféru. Presné čísla môžu byť iterované, toto je štartovací bod.)

**Akceptácia F0:** znovu vygenerovaný prompt pre reel_start_frame neobsahuje „earlier shot", „Soul ID", „motion continues"; každá veta končí interpunkciou; žiadne podčiarkovníky; negatívy sa posielajú (log/inspect request body); existujúce testy + nové testy na `humanizeTimeOfDay`, `SOUL2_SLOT_FRAMING` a rozšírené forbidden terms prechádzajú.

---

## 4. FÁZA 1 — Luxury World Bible (1 deň), flag `luxury_world_v1`

Dátová doktrína sveta Vivienne — jediný zdroj pravdy o tom, ako jej svet VYZERÁ. Nový modul `lib/luxuryWorld.ts`:

```ts
export const LUXURY_MATERIALS = [
  "travertine", "honed marble", "brushed brass", "aged oak", "walnut",
  "natural linen", "raw silk", "hand-glazed ceramic", "limestone",
  "boucle upholstery", "smoked glass", "patinated bronze",
];
export const LUXURY_ENVIRONMENT_DOCTRINE = `ENVIRONMENT QUALITY (mandatory):
Every location must read as genuinely premium — quiet, editorial luxury, never rented-Airbnb generic.
Surfaces and materials are named concretely (travertine, honed marble, aged oak, brushed brass, natural linen, limestone).
Interiors: architectural light, generous proportions, curated minimal objects, real plants or cut flowers, no clutter.
Exteriors: private terraces, infinity pool edges with stone coping, mature gardens, historic facades, coastal stone paths.
NEVER: bare concrete balconies, plastic furniture, cheap tiling, fluorescent corridors, cluttered counters,
visible cables, generic hotel-chain rooms, worn or stained surfaces, crowd-barrier railings.`;
export const LUXURY_NEGATIVES = [
  "cheap interior", "bare concrete balcony", "plastic furniture", "generic hotel room",
  "cluttered background", "worn surfaces", "fluorescent office lighting",
];
```

Zapojenie (všetko za flagom `luxury_world_v1`):
1. **Story prompt** ([app/api/characters/story/route.ts](../app/api/characters/story/route.ts) / `lib/storyGeneration.ts`): do system promptu blok `LUXURY_ENVIRONMENT_DOCTRINE` + pravidlo, že `location` musí byť konkrétna prémiová mikro-lokácia (materiál/architektonický detail v texte lokácie).
2. **Scene brief** ([lib/sceneBrief.ts](../lib/sceneBrief.ts)): doktrína do system promptu — `spatial_setup` musí menovať materiály z palety, zakázané prvky sa nesmú objaviť.
3. **Negatívy**: `contextualImageNegatives` pridá `LUXURY_NEGATIVES` keď je flag on.
4. **Arc planner** (`lib/arcPlanner.ts` — už nasadený): do plánovacieho promptu jedna veta, že `location_hint` musí byť premium anchor (hotel s menom typu prostredia, nie reťazec; „five-star" implicitne, žiadne brand names — konzistentné so `never_show` no-logos pravidlom).
5. **Migrácia `sacred_details.recurring_environment`** (append `supabase/migration.sql`): zpremiumniť existujúce položky — napr. „her Barcelona apartment — travertine floors, linen curtains, morning light, terrace with olive trees", „boutique pilates studio — pale oak, brass fittings, floor-to-ceiling windows", „historic-quarter café — marble tables, ceramic espresso cups". (UPDATE vzor ako Phase 0 Story Engine.)

**Akceptácia F1:** flag off = žiadna zmena; flag on: story location a scene brief spatial_setup obsahujú materiálový jazyk; negatívy obsahujú luxury zákazy; nový vygenerovaný deň nemá betón/plast/generické prostredie.

---

## 5. FÁZA 2 — LLM Prompt Writer (1 deň), flag `prompt_writer_v1` — kvalitatívny skok

Deterministický compiler (F0) zostáva ako skladač FAKTOV a večný fallback. Nad ním finálny lacný LLM pass, ktorý z faktov napíše jeden súvislý prompt — presne to, čo robí legacy Nano Banana path a čo dokázateľne dávalo najlepšie výstupy (prompty z 19.–20.8.).

Nový súbor `lib/promptDirector/promptWriter.ts`:

- `writeSoul2Prompt(pkg: PromptPackage, input: PromptDirectorInput): Promise<string>` — Claude call (`claude-sonnet-4-6`, max_tokens ~300):
  - **Vstup**: sekcie z PromptPackage (camera/pose/scene/lighting) ako fakty + luxury doktrína (F1) + žánrová príručka.
  - **Žánrová príručka** (konštanta v súbore): „Write like an editorial fashion photography brief: one continuous scene, one subject, present tense, concrete nouns, materials and light named precisely, 60–110 words, no lists, no meta language, no camera brand talk beyond one lens/exposure cue, end with one mood clause."
  - **Anti-invention pravidlo v prompte**: smie preformulovať, NESMIE pridať garment/prop/osobu/lokáciu, ktorá nie je vo faktoch.
- **Deterministická validácia výstupu** (pure funkcia `validateWrittenPrompt`, testovať): obsahuje aspoň jedno substantívum z `wardrobe_lock`; obsahuje environment anchor slovo zo `spatial_setup`; prejde `assertNoSoul2MetaLeakage` + forbidden terms; 40–130 slov; žiadne markdown/zoznamy. Pri zlyhaní 1 retry s chybou v prompte; potom **fallback na F0 deterministický výstup** (nikdy nezlyhá celá generácia).
- Zapojenie v mieste, kde sa dnes volá `compilePromptDirector` pre image (generate-media / generate-higgsfield / prompt-director-preview): ak `prompt_writer_v1` on → `positivePrompt = await writeSoul2Prompt(...)`, negatívy ostávajú z negativeBuilder. Ulož do `chs_media.higgsfield_prompt` finálny text (ako doteraz).
- Náklady: ~300 tokenov výstup × 3 sloty/deň — zanedbateľné.

**Akceptácia F2:** flag on: uložený prompt je súvislý text 60–110 slov bez sekciových fragmentov, validácia beží (unit testy na validateWrittenPrompt vrátane fail→fallback cesty); flag off: byte-identické F0 správanie.

---

## 6. FÁZA 3 — Estetická variabilita (0,5 dňa; súčasť `prompt_writer_v1`)

Zrušiť fixný estetický podpis:

1. `buildAestheticSection`: namiesto fixného „candid social-media realism" odvodiť smer z tieru + času + luxury flagu: intimate_aesthetic → „quiet editorial intimacy", lived_moments → „warm candid energy", luxe_car → „polished nocturnal editorial", wellness → „clean morning athleticism"… (mapa v kóde, test).
2. **Photography style deck** — malá rotácia (deterministicky per day_number, vzor `pickReelFormat`): 5–6 profilov typu „35mm editorial, shallow depth", „50mm natural light portrait", „medium-format look, soft grain", „golden backlight, lens flare restraint"… Prompt writer dostane dnešný profil ako mood/lens cue. Zabráni tomu, aby mal celý feed identický podpis.
3. „natural phone exposure" ponechať IBA pre `story_bts` (tam je phone-look zámer); feed/reel sloty dostávajú editorial realism cues.

---

## 7. Video poznámka (malé, popri F0)

Kling/Seedance prompty majú vlastné meta bloky („CRITICAL REALISM RULES (DO NOT BREAK)…" — 2233 znakov). Video modely instrukčný text tolerujú lepšie, ale: (a) skrátiť realism blok na ~5 riadkov, (b) zabezpečiť, že `stripPromptHeader` beží aj pre video path (v DB sú uložené prompty s „Model: Kling 🎬" hlavičkou — over, či sa hlavička strippe pred odoslaním do fal; ak nie, oprav). Nič viac v tejto iterácii.

---

## 8. Poradie, odhady, riziká

| Poradie | Fáza | Effort | Prináša |
|---|---|---|---|
| 1 | F0 hotfix compilera | 0,5–1 d | koniec zdvojených scén + čitateľné prompty + negatívy |
| 2 | F1 Luxury World Bible | 1 d | svet prestane byť náhodný/lacný |
| 3 | F2 Prompt Writer | 1 d | kvalitatívny skok jazyka promptov |
| 4 | F3 estetická variabilita | 0,5 d | koniec šablónového podpisu feedu |

**Riziká / poznámky:**
- Higgsfield API `negative_prompt` parameter treba overiť v docs; ak neexistuje, použiť „Avoid:" appendix (F0.5).
- Prompt writer nesmie nikdy zhodiť generovanie — fallback na deterministický výstup je povinný kontrakt.
- Word budgety (F0.6) sú štartovací bod — ladiť podľa reálnych výstupov, nie dogma.
- Legacy slotPrompts path (Nano Banana) nemeniť — funguje a je LLM-rewrite už dnes; tento plán rieši Soul 2 / director path. Dlhodobá konsolidácia dvoch svetov je mimo scope.

## 9. Kontrolný zoznam pre implementačného agenta

1. Fázy v poradí F0 → F1 → F2 → F3; jeden logický celok = jeden commit.
2. Po každej fáze: `npm test && npm run lint && npm run build`.
3. Nové pure funkcie = vitest testy (`humanizeTimeOfDay`, `validateWrittenPrompt`, aesthetic mapa, slot framing konštanty bez forbidden terms).
4. Flagy `luxury_world_v1`, `prompt_writer_v1` do `lib/featureFlags.ts`; gating vzor `prompt_director_v1`. F0 je bezflagová oprava.
5. DDL/UPDATE len append do `supabase/migration.sql`, idempotentne. **Migráciu spustiť v Supabase PRED deployom.**
6. Nedotýkať sa: `app/api/publish/post-*`, legacy `lib/slotPrompts.ts` obsahu (okrem prípadného exportu konštánt), `lib/situationPlanner.ts` validácií.
7. Claude cally cez `claudeWithRetry` s modelom `claude-sonnet-4-6` (jednotný štandard repa).
8. Overiť proti Higgsfield docs: negative_prompt parameter + prípadný vyšší quality tier `soul/v2` modelu; zistenia zapísať do kódu komentárom.
