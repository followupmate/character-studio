# Recovery reels — 5 pripravených dní na review

**Stav: NEGENEROVANÉ, NEPUBLIKOVANÉ.** Tento dokument je to, čo treba odsúhlasiť predtým,
než sa minie prvý kredit. Zdroj: [`lib/recovery/recoveryDays.ts`](../lib/recovery/recoveryDays.ts),
prompty sú kompilované cez [`lib/recovery/simpleReelCompiler.ts`](../lib/recovery/simpleReelCompiler.ts)
a všetkých päť prejde vlastnou validáciou (0 errors, 0 warnings) — viď
`lib/recovery/recoveryDays.test.ts`, beží v CI.

## Publish protokol

- **Publikuje sa ručne z mobilu, s trending audiom.** Graph API nevie pripojiť trending
  audio, takže pipeline zámerne končí na `ready`. V recovery je to výhoda, nie obmedzenie:
  trending audio je distribučná páka, ktorú auto-publish nemá.
- **Rovnaký time slot pre všetkých 5** (±30 min). Čas nie je testovaná premenná.
- **Stories bežia ďalej v normálnom režime** — držia follower touch, kým je reel kadencia
  znížená. V recovery sa nemenia.
- **Kadencia: 4–5 reelov týždenne**, nie denne.
- **Jedna premenná.** Menia sa iba motion/prompt. Captiony, publishing time, styling a
  hashtagy zostávajú presne také, aké sú.
- **QA gate pred schválením:** nameraná dĺžka v pásme 5,5–7,5 s (automaticky, server-side)
  + tri manuálne body v review UI — tvár/pohyb v prvom frame, eye contact do 1,5 s, žiadny
  pomalý establishing shot.
- Po publikovaní doplniť `platform_post_id` a `posted_at` do
  [`recovery.json`](../recovery.json) — bez toho ich `/api/recovery/report` nevie nájsť.

## Spoločný tvar

Jedna situácia → jedna okamžite čitateľná akcia → jedna mikroodmena do 2–3 s.
Referencia je Day 78 (watch 6,02 s): žena sedí na posteli → pohľad klesne → oči sa vrátia
na kameru → dotkne sa retiazky → loop. Celý prompt. Nie pätnásť pravidiel navrch.

Každý prompt: close alebo close-medium, statická kamera, eye contact do prvej sekundy,
jedna akcia, explicitný loop, 6–7 s, bez speech, bez textu, bez veľkého camera move,
a bez boilerplate vrstiev (depth doctrine, generic micro-motion, physics, environment,
audio) — tie sú preč, nie prepísané.

---

### Reel 1 — intimate / private + light motion *(firestarter)*

**Prečo tento smer:** The firestarter. Day 78 — the same tier, the same light-motion register, an eye-contact beat and a single hand gesture — is the best-performing reel in the whole window at 6.02s watch. This reproduces that shape deliberately instead of by accident.

**Scéna:** `bedroom` / `seated_still` · 6s · close-medium · objekty v scéne: žiadne

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** Her apartment bedroom — she sits on the edge of a queen bed with a rumpled ivory linen duvet, a warm-taupe upholstered headboard behind her, a low cane bedside table to her right with one switched-on lamp giving a warm amber glow, a tall window with a half-drawn linen curtain to her left, warm wood floor and a soft rug at the bed's base. No desk, no chair, no second table, no wardrobe, no TV, no overhead lighting active.

**Wardrobe lock:** washed-cream ribbed cotton camisole (thin fixed straps, close to the body, no logo), soft charcoal knit lounge trousers (mid-rise, relaxed), bare feet, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, dark wavy hair loose past the shoulders, minimal makeup with a tinted lip

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts close to the lens, looking away to one side. Within the first second her eyes find the lens and stay there. A very slight asymmetric smile starts, and her hand comes up to adjust a strand of hair and the thin gold chain at her collarbone. She holds the look. The last frame matches the first so it loops seamlessly. 6s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

---

### Reel 2 — wellness + gesture

**Prečo tento smer:** Wellness is the tier of Day 76 (watch 5.01s), the other clean performer. Gesture rather than the studio equipment: Day 92 showed the reformer pulls the prompt toward objects and physics that the scene cannot support.

**Scéna:** `terrace_rooftop` / `standing_still` · 6s · close-medium · objekty v scéne: rolled yoga mat

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** Boutique hotel rooftop terrace — an open-air platform of warm poured concrete roughly 8m across, a low rendered-concrete parapet along the far edge at 1.0m, a city skyline of low-to-mid-rise rooftops receding into soft morning haze beyond it, a rolled yoga mat leaning against the parapet to her right. No chairs, no table, no lounger, no planters, no gym equipment, no signage.

**Wardrobe lock:** fitted ribbed sports bra in muted sage (wide underband, fully opaque, no logo), high-waisted full-length compression leggings in the same muted sage ribbed fabric, bare feet on warm concrete, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, sleek low ponytail slightly damp at the temples

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. She tucks one strand of hair back behind her ear. She holds the look. The last frame matches the first so it loops seamlessly. 6s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

---

### Reel 3 — living social / candid moment

**Prečo tento smer:** The one direction with real ambient life in frame. Tests whether a candid, populated setting holds attention as well as the private register — the account's whole recent output is solitary, and a validator that only ever sees empty rooms cannot tell us if that is the constraint.

**Scéna:** `cafe_restaurant` / `seated_still` · 7s · close-medium · objekty v scéne: white ceramic espresso cup, saucer

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** A small neighbourhood café terrace in El Born, Barcelona — she sits at a round marble-topped table 50cm in front of her carrying one white ceramic espresso cup on a saucer, a bentwood chair beneath her, the aged ochre-yellow plaster facade of a four-storey building filling the midground 3m behind, a faded cream-and-sage canvas awning above casting one diagonal band of shade. A few blurred anonymous patrons sit at 6m depth in soft focus. No menus, no signage, no branded items, no second sharp face.

**Wardrobe lock:** thin-strap cream ribbed cotton top (fixed narrow straps, scoop neck, no logo), faded straight-leg mid-blue jeans (high-rise), tan leather flat sandals, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, dark wavy hair loose, soft everyday makeup

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts seated, close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. Her hand comes up and she adjusts the thin gold chain at her collarbone. She holds the look. The last frame matches the first so it loops seamlessly. 7s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

---

### Reel 4 — intimate variant — a second read on #1

**Prečo tento smer:** The same register as Reel 1 in a different room and a different light. If #1 works and #4 does not, the result is about that specific room; if both work, the register is what carries. n=1 on a direction is not a result.

**Scéna:** `living_room` / `seated_still` · 6s · close-medium · objekty v scéne: low stack of books

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** The corner of her living room by the window — she sits on the floor with her back against a low pale-linen sofa, a tall window directly behind her with a sheer curtain fully drawn diffusing late-morning light, a deep-olive painted wall to the left carrying one framed print, warm oak floorboards, a low stack of books against the wall at floor level. No coffee table, no lamp, no plant, no TV, nothing between her and the camera.

**Wardrobe lock:** oversized washed-white cotton shirt worn open over a fitted deep-olive ribbed tank, soft cream knit shorts, bare feet, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, dark wavy hair loose and slightly undone, bare skin makeup with a tinted lip

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts seated, close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. She shifts her weight once and settles deeper into the seat. She holds the look. The last frame matches the first so it loops seamlessly. 6s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

---

### Reel 5 — challenger — free attempt outside the three directions

**Prečo tento smer:** Deliberately outside the tested set, and deliberately not a fourth variation on a quiet interior. A bright, high-colour, open-water frame — the closest thing in this set to the visual-motif layer that becomes the next tested variable if the prompt layer turns out not to have been the problem (see the 0-of-5 branch in recovery.json).

**Scéna:** `pool` / `seated_still` · 7s · close-medium · objekty v scéne: žiadne

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** A private plunge pool on a limestone terrace — she sits on the brushed-limestone coping at the near edge with her feet in the water, the turquoise-green mosaic-tile pool surface filling the lower midground, a 1m stone parapet to the left covered in bougainvillea casting hard broken shadows across the pale stone, open high-summer sky above. No chairs, no table, no sunbed, no umbrella, no towel rack, no signage.

**Wardrobe lock:** black high-waisted bikini (smooth matte fabric, full-coverage bandeau top, no logo), oversized white open-weave cotton shirt worn completely open over it, barefoot, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, wet-look dark hair pushed back, bare skin, no makeup beyond a tinted lip

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts seated, close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. She tucks one strand of hair back behind her ear. She holds the look. The last frame matches the first so it loops seamlessly. 7s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

---
## Čo sa NEROBÍ

- Žiadne auto-publish. `ready` → manuál.
- Neoptimalizuje sa na tri prežívajúce archetypy. Rozdiely medzi archetypmi sú menšie než
  šum medzi dňami (`walking_motion`: 337, 227, 243, 265 — stred poľa; najlepší post vôbec
  bol `gesture_motion`), takže sa optimalizuje na vlastnosti, ktoré odlišujú víťazov,
  a pool zostáva široký.
- Nemení sa styling, caption, čas ani hashtagy.

## Rozhodovacie pravidlo

Zaregistrované vopred v [`recovery.json`](../recovery.json), nie po sprinte. Primárna KPI je
**watch time ≥ 4,5 s** (7d, fallback 72h); saves + shares sekundárne; views len kontext.
Po piatich reeloch: ≥2 z 5 → smer funguje, pokračovať a nechať `CI_SCORING_FROZEN` zapnuté
ďalších 14 dní · 1 z 5 → predĺžiť o 3 reels v najsilnejšom smere, nič iné nemeniť ·
0 z 5 → prompt vrstva nebola (jediný) problém, ďalšia testovaná premenná je vizuálna
motívová vrstva, opäť cez simple compiler.
