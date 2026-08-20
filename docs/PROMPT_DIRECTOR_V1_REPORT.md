# Prompt Director v1 — Implementation Report

Centrálny compiler, ktorý prevezme existujúci creative intent (SceneBrief → Styling → Archetype → Slot) a preloží ho do model-specific promptu pre Soul 2, Kling, Higgsfield, Seedance a Wan — bez zmeny story logiky, bez migrácie, za feature flagom.

**Stav:** Fázy A–D implementované lokálne. 820/820 testov, `tsc` čisto, `next lint` bez nových warningov, `next build` prechádza. **Nič nie je commitnuté ani pushnuté.** Flag `prompt_director_v1` je defaultne OFF na každej postave.

```
Story Generation → SceneBrief → Styling / Archetype / Slot → [Prompt Director v1] → PromptPackage → Soul2 / Kling / Higgsfield / Seedance / Wan
```

---

## Fázy A–D

| Fáza | Obsah | Status |
|---|---|---|
| **A** | Types, deterministický compiler, section buildery, negative builder, model profily, 24 testov | Hotovo |
| **B** | LLM performance transformer (abstract→observable mapa, auto-speech), content validator, camera-conflict resolver | Hotovo |
| **C** | Feature flag `prompt_director_v1`, A/B seam v `lib/dailyBatch.ts::runSlot()` + retry ceste | Hotovo |
| **D** | Persistencia (bez migrácie), dashboard toggle, live preview panel v `MediaCard` | Hotovo |

---

## 1. Zmapovanie dnešného flow

Repo má **dva paralelné prompt pipeline-y** — Prompt Director sa napája len na ten hlavný.

- **Pipeline A (denný batch, hlavný)** — `lib/dailyBatch.ts` → `lib/sceneBrief.ts` → `lib/stylingDeck.ts` + `lib/archetypeDeck.ts` → `lib/slotPrompts.ts` (`generateSlotPrompt()`, jeden Claude call na slot) → `chs_media.higgsfield_prompt` → samostatný krok `generate-media/route.ts`, ktorý o minúty/dni neskôr vyberie providera a pošle mu ten istý raw string.
- **Pipeline B (Fanvue continuation)** — `lib/situationPlanner.ts` → `lib/shotDirection.ts` → `lib/imagePromptCompiler.ts` / `lib/seedancePromptCompiler.ts`. Nedotknuté.

### Provider capabilities (overené v kóde, nie odhadnuté zo zadania)

| Provider | Realita v repe | V Prompt Directori |
|---|---|---|
| Higgsfield Soul V2 | len obrázky (`lib/higgsfieldSoul.ts`) | `soul2` · **live** |
| Kling | len video, bez natívneho audia (audio sa lepí druhým fal-ai/mmaudio callom), bez lipsync | `kling` · **live** |
| Seedance | video, reálny `generate_audio` boolean + audio hints, bez potvrdeného lipsyncu | `seedance` · **live** |
| "Higgsfield" video | v repe **neexistuje** — meno koliduje so Soul image modelom | `higgsfield` · nie je zapojený |
| Wan | v repe nie je vôbec | `wan` · nie je zapojený |

Toto je premietnuté do `MODEL_CAPABILITIES` s poľom `liveIntegration: boolean` — kód nikdy nepredstiera, že nepripojený model je live.

### Feature flagy a persistencia

`lib/featureFlags.ts` — jednoduchý `jsonb` stĺpec `chs_characters.feature_flags`, per-character, žiadny GrowthBook. `chs_media.visual_signature` (jsonb) sa už dnes additívne rozširuje — presne tento vzor som použil pre Prompt Director provenance, takže **žiadna migrácia**.

---

## 2. Zoznam menených a nových súborov

```
lib/promptDirector/                          nový modul (rovnaká konvencia ako lib/creativeIntelligence/)
  types.ts                                    PromptDirectorInput, VideoIntent, PromptPackage
  constants.ts                                PRIORITY_HIERARCHY, MODEL_CAPABILITIES, SOCIAL_REALISM_PROFILE
  helpers.ts                                  čisté pomocné funkcie
  imageSections.ts                            deterministické IMAGE sekcie (§7)
  videoSections.ts                            deterministické VIDEO/talking sekcie (§8–19)
  negativeBuilder.ts                          kontextový negative builder (§7G/§27)
  performanceTransformer.ts                   abstract→observable + auto-speech (Fáza B)
  validator.ts                                content validator + camera-conflict resolver
  modelProfiles.ts                            per-provider compiler (§20)
  compiler.ts                                 compilePromptDirector() orchestrátor
  index.ts                                    public API
  *.test.ts                                   ×5 súborov, 42 testov

app/api/characters/prompt-director-preview/route.ts   NOVÉ — live A/B preview endpoint
components/dashboard/PromptDirectorPanel.tsx           NOVÉ — preview panel (Fáza D)

lib/featureFlags.ts                           + "prompt_director_v1"
lib/dailyBatch.ts                             A/B seam v runSlot() + reconcileFailedSlots()
types/index.ts                                Media.visual_signature.prompt_director?: PromptPackage
components/dashboard/Dashboard.tsx            character-level toggle
components/dashboard/MediaCard.tsx            panel zapojený do ready aj pending stavu
```

Nič iné sa nemenilo. `lib/slotPrompts.ts`, `lib/sceneBrief.ts`, `lib/archetypeDeck.ts` — **0 zmenených riadkov**.

---

## 3. Výsledný interface

Presne podľa zadania — jediná odchýlka: `reference` a `identity` sú v `PromptPackageSections` naozaj oddelené kľúče, a `MODEL_CAPABILITIES` navyše nesie `liveIntegration`.

```ts
export type PromptDirectorTargetModel = "soul2" | "kling" | "higgsfield" | "seedance" | "wan";

export interface PromptDirectorInput {
  character: { id; name; visualBrief; sacredDetails; soulId? };
  sceneBrief: SceneBriefJson;       // z lib/sceneBrief.ts, beze zmeny
  slot: SlotSpec;                   // z lib/archetypeDeck.ts, beze zmeny
  archetypeId: string;
  archetypeGuidance: string;
  outputType: "image" | "video" | "talking_video";
  generationMode: "text_to_image" | "image_to_video" | "text_to_video";
  targetModel: PromptDirectorTargetModel;
  situationTranslation?: string;
  videoIntent?: VideoIntent;
  plannedVideoIntent?: VideoIntent;
  hasReferenceImage?: boolean;
}

export interface VideoIntent {
  mode: "motion_only" | "voice_over" | "talking_to_camera";
  durationSec?: number;
  action?: string;
  emotionalDelivery?: string;
  cameraBehavior?: string;
  timeline?: Array<{ startSec: number; endSec: number; action: string }>;
  speech?: {
    source: "none" | "auto" | "manual";
    text?: string; language?: string; tone?: string; pace?: string; voiceProfile?: string;
  };
}

export interface PromptPackage {
  model: string;
  positivePrompt: string;
  negativePrompt?: string;
  sections: PromptPackageSections;   // 19 kľúčov, presne podľa zadania §5
  metadata: {
    promptDirectorVersion: "v1";
    modelProfile: string;
    outputType: PromptDirectorOutputType;
    generationMode: PromptDirectorGenerationMode;
    validation?: { errors: string[]; warnings: string[] };
  };
}
```

`compilePromptDirector(input): Promise<PromptPackage>` je jediný verejný entry point.

---

## 4. Ako sa starý `slotPrompts.ts` zachová pri flag OFF

V `lib/dailyBatch.ts::runSlot()` je vetvenie:

```ts
const result: SlotGenerationResult = args.promptDirectorOn
  ? await generateSlotPromptViaDirector({ ... })   // NOVÁ cesta
  : await generateSlotPrompt({ ... });             // PÔVODNÁ cesta, nezmenené argumenty
```

`args.promptDirectorOn` sa resolvne raz za batch (`isFlagOn(character.feature_flags, "prompt_director_v1")`) presne tým istým vzorom ako `doctrine`/`discoveryMode`. Keď je flag OFF (default), `runSlot()` beží identicky ako predtým — voliteľný 3. parameter `mergeVisualSignature()` je `undefined`, takže funkcia vracia presne to, čo predtým. Celá existujúca test suite (814 testov pred Prompt Directorom) prešla nezmenená.

---

## 5. Kde presne Prompt Director vstupuje pri flag ON

V `runSlot()` (a v `reconcileFailedSlots()` pre retry) sa namiesto `generateSlotPrompt()` zavolá `generateSlotPromptViaDirector()`, ktorá:

1. zmapuje `slot.type` na `{outputType, generationMode, targetModel}` — foto → `image / text_to_image / soul2`, video slot → `video / image_to_video / kling`,
2. zavolá `compilePromptDirector()` s tým istým `sceneBriefJson` / `slot` / `archetypeId` / `character`,
3. výsledný `pkg.positivePrompt` sa uloží presne tam, kde predtým `result.prompt` — do `chs_media.higgsfield_prompt`,
4. celý `PromptPackage` sa additívne uloží do `chs_media.visual_signature.prompt_director`.

Výber providera pri samotnej generácii (`generate-media/route.ts`) som **nezmenil** — Prompt Director zatiaľ len nahrádza tvorbu promptu, nie voľbu providera (pozri „Čo chýba" nižšie).

---

## 6. Model profily

| Model | Poradie sekcií | Verbosity | Poznámka |
|---|---|---|---|
| `soul2` | reference → identity → scene → camera → lighting → appearance → realism → imperfections | full | žiadny speech/audio/motion |
| `kling` | reference → identity → camera → humanMovement → environmentMovement → stability | concise | scene/lighting/appearance zámerne vynechané — zdrojový frame ich už nesie; speech/audio capability-gated preč |
| `higgsfield` *(stub)* | identity → scene → camera → expression → humanMovement → stability | full | compiluje sa, ale nič naň nevolá reálne API |
| `seedance` | reference → identity → scene → camera → humanMovement → environmentMovement → timeline → speech → lipSync → audio → stability | full | jediný model, kde speech/audio skutočne prejde do finálneho promptu |
| `wan` *(stub)* | reference → identity → humanMovement → camera → stability | concise | zámerne najstriktnejší |

Kapacitné hradlo v `compilePositivePrompt()` je **záväzné, nie len poradie** — ak `capability.supportsSpeech === false`, sekcie `speech`/`lipSync` sa nevypíšu do promptu vôbec, nech je v `sections` čokoľvek (overené testom).

---

## 7–9. Fixture outputy

Bežia ako skutočné testy — `lib/promptDirector/fixtures.test.ts`, spúšťa ich `npm test`. Nižšie tri reprezentatívne; zvyšné tri (full-body lifestyle, motion-only reel, auto-speech reel) bežia rovnako.

### Fixture 1 — extreme close-up portrait (soul2 · image)

```
Model: Soul 2 🖼️ Image Prompt

Character visual brief: late-20s woman, dark wavy hair, athletic build...
Anatomy anchor (hands): feminine hands, slim fingers, smooth skin...
Use the provided image as strict identity reference. Preserve exact facial identity...
Spatial setup: Her kitchen — pale oak counter along the window wall...
Framing: Emotional close on face... Shot size: close, face fills a large part of frame.
...
natural skin texture ... visible pores subtle skin redness ... subtle facial asymmetry ...
subtle sensor noise natural HDR behavior slight exposure inconsistency phone lens distortion

NEGATIVE: beauty filter, plastic skin, ... no studio lighting, no fake depth of field, no glam look
```

✓ silná identita · skin realism · asymetria · close camera · žiadny motion/audio blok

### Fixture 3 — walking Reel, image-to-video (kling · video)

```
Model: Kling 🎬 Video Prompt

Use the supplied image as the exact starting frame, Preserve identity, clothing, visible
accessories, starting pose, lighting, environment and camera orientation from that frame,
Describe only what changes after frame 0 — do not re-describe the starting frame itself.

Preserve exact facial identity throughout the entire shot, Stable facial structure, same
hairstyle, same body proportions, No face morphing, no identity drift.

static camera, Framing: 5-9 seconds, 9:16. Motion continues from the reel_start_frame pose.

natural blinking, subtle breathing, minor posture shifts, small head adjustments, she walks
toward the camera along the sidewalk, glancing up once, Natural walking rhythm, realistic arm
swing, small vertical body movement, natural clothing response.

Feet contact ground realistically, weight transfers naturally, fabric responds to movement.

No face morphing, no body morphing, No environment jump, no random camera reframing.

NEGATIVE: face morphing, identity drift, robotic movement, jerky head movement, body warping,
environment changes, temporal flicker
```

✓ scéna/svetlo/wardrobe sa nepreopisujú — start frame ich nesie · physics layer len pretože akcia obsahuje "walk"

### Fixture 4 — talking bathroom selfie, custom česká veta (seedance · talking_video)

```
Model: Seedance 2.0 🎬 Video Prompt

Use the supplied image as the exact starting frame. Preserve identity, clothing, visible
accessories, starting pose, lighting, environment and camera orientation from that frame.
Describe only what changes after frame 0 — do not re-describe the starting frame itself.

Preserve exact facial identity throughout the entire shot. Stable facial structure, same
hairstyle, same body proportions. No face morphing, no identity drift.

static camera Framing: Talking selfie, face to camera, phone held at arm's length.

Movement: natural blinking subtle breathing minor posture shifts small head adjustments

EXACT SPOKEN LINE — DO NOT CHANGE WORDING:
"Teď ti ukážu, jak to udělat." Language: cs Tone: warm, direct

Lipsync: Priority: realistic facial integrity > natural articulation > perfect phoneme sync.
No oversized mouth opening, no lip inflation, no teeth distortion, no face morphing, no
exaggerated vowel shapes.

smartphone microphone bathroom reverb no artificial studio polish

No face morphing, no body morphing. No environment jump, no random camera reframing.

NEGATIVE: face morphing, identity drift, robotic movement, jerky head movement, body warping,
environment changes, temporal flicker, lip morphing, teeth distortion, oversized mouth
movement, robotic speech, unnatural articulation
```

✓ text presne "Teď ti ukážu, jak to udělat." · čeština · face behavior · lipsync priority · bathroom ambience

### Zvyšné 3 fixtures

- **Fixture 2 — full-body lifestyle (soul2):** wardrobe/scene prítomné, **bez** "visible pores" a **bez** imperfections blocku (environment family ho vynecháva).
- **Fixture 5 — motion-only Reel (kling):** žiadny `speech`/`audio` blok, jednoduchá akcia ("she lifts the necklace briefly and lets it fall back"), identity-stability prítomná.
- **Fixture 6 — auto-speech Reel (seedance):** `speechSource: "auto"` vygeneruje krátku repliku cez `generateAutoSpeech()` (mockovaný Claude call v teste), overuje sa dĺžka pod limitom daným trvaním klipu a absencia hashtag/caption-speak.

---

## 10. Deterministic vs. LLM

**Deterministic — žiadny network call:**
- identity lock, sacred details, wardrobe lock, reference lock
- negative rules, video specs, priority hierarchy
- provider capability gating (speech/audio/lipsync)
- camera-conflict resolution
- exact speech text (manual mode)
- lipsync priority text, physics-layer detekcia (regex "walk"/"drink")
- abstract→observable mapa — 20 termínov (confident, playful, sensual…) rieši bežný prípad úplne bez LLM

**LLM — cez `claudeWithRetry`:**
- `refineAbstractTermWithClaude()` — len pre mood slová MIMO deterministickú mapu (compiler ho defaultne nevolá)
- `generateAutoSpeech()` — jediné miesto, kde compiler skutočne robí network call, len pri `speech.source === "auto"`

Testy nikdy nevolajú skutočné API — rovnaká konvencia ako `lib/sceneBrief.test.ts`/`lib/slotPrompts.test.ts`; fixture 6 mockuje `claudeWithRetry` cez `vi.mock`.

---

## 11. Test / typecheck / lint / build výsledky

Spustené po Fáze A–C aj znova po Fáze D (UI) — oba behy čisté.

| Príkaz | Výsledok |
|---|---|
| `npx vitest run` | ✓ 36 files · 820 tests |
| `npx tsc --noEmit` | ✓ exit 0 |
| `npx next lint` | ✓ 0 nových warningov |
| `npx next build` | ✓ 61/61 stránok |

Lint warningy, ktoré build hlási, sú všetky v súboroch nesúvisiacich s touto zmenou (existovali už pred ňou).

---

## Fáza D — UI toggle + preview panel

Doplnené na dodatočnú žiadosť po prvom reporte.

**Čo pribudlo:**

- `app/api/characters/prompt-director-preview/route.ts` — POST endpoint: zoberie `mediaId`, dotiahne rovnaký SceneBrief/slot/archetype/character z DB a zavolá `compilePromptDirector()` naživo, **bez zápisu do DB** a bez nutnosti mať flag zapnutý na postave — presne pre A/B porovnanie na tom istom SceneBriefe.
- `components/dashboard/PromptDirectorPanel.tsx` — collapsible panel: Model / Video Mode / Speech (None · Auto s Language+Tone · Manual s textarea na presný text) → *Compile Preview* → štruktúrované sekcie (Reference/Scene/Camera/Lighting/Realism/Motion/Speech/Lipsync/Audio/Negatives) + finálny provider prompt + porovnanie so starým promptom + *Použiť tento prompt*.
- `MediaCard.tsx` — panel zapojený do oboch stavov; v pending stave nová `customPromptOverride` state posiela vybraný prompt priamo do prvej generácie, v ready stave predvyplní existujúci regen textarea.
- `Dashboard.tsx` — character-level toggle „Prompt Director v1" vedľa „Growth mode", rovnaký PATCH vzor ako `discovery_mode`.

**Overenie:** SSR render `/` (Dashboard toggle) aj `/today` (panel v `MediaCard`) cez lokálny dev server → status 200, žiadne "application error"/hydration chyby v HTML, oba prvky sa reálne renderujú vedľa existujúceho UI. Interaktívne preklikanie (klik na toggle, Compile Preview proti reálnym DB dátam) neprebehlo — bez prehliadača na klikanie v tomto prostredí; otestuje sa naživo v produkcii, preto neboli pridané žiadne nové testovacie závislosti (repo dnes testuje výhradne cez vitest v Node prostredí, 0 testov pre komponenty/routes).

---

## Zámerne mimo v1

- **Výber providera pri reálnej generácii** (`generate-media/route.ts`) stále rozhoduje o `model` ad-hoc a nečíta `PromptPackage.model` — Prompt Director zatiaľ len mení text promptu, nie voľbu providera.
- **higgsfield** a **wan** profily sa kompilujú, ale nemajú živé API volanie v tomto repe — pripravené na deň, keď pribudnú.
- Žiadne testy pre novú UI vrstvu (API route, React komponenty) — vedomé rozhodnutie, repo nemá React test infra a testovanie prebehne naživo.

---

*Character Studio · Prompt Director v1 · lokálna implementácia, žiadny commit, žiadny push, žiadna produkčná migrácia.*
