# Recovery reels — 5 briefov (SCHVÁLENÉ 2026-09-04)

Zdroj: [`lib/recovery/recoveryDays.ts`](../lib/recovery/recoveryDays.ts), prompty kompilované cez
[`lib/recovery/simpleReelCompiler.ts`](../lib/recovery/simpleReelCompiler.ts). Všetkých päť prejde
vlastnou validáciou (0 errors, 0 warnings) — `lib/recovery/recoveryDays.test.ts`, beží v CI.
Tento dokument je **generovaný zo zdroja**, nie prepísaný ručne.

## Schválené zmeny (2026-09-04)

| položka | predtým | teraz |
|---|---|---|
| `REEL_DURATION_GATE` | 5,5–7,5 s | **6,5–8,5 s** |
| povolené pásmo | 6–7 s | **6–8 s** |
| default | 7 s | **8 s** |
| Reel 1 / 2 / 3 / 4 / 5 | 7/6/7/6/7 s | **8 / 7 / 8 / 7 / 8 s** |
| Veo `durationSeconds` | 6 | **8** |
| recovery verdict | `avg_watch_time ≥ 4,5 s` | **ten istý prah + povinný metrický panel** |

Duration konštanty sú teraz na **jednom mieste** ([`lib/recovery/reelDuration.ts`](../lib/recovery/reelDuration.ts)).
Boli duplikované v compileri a vo validátore a posun pásma to hneď odhalil: validator začal
odmietať každý prompt, ktorý compiler vyrobil.

## Recovery verdict už nie je jedno číslo

Vetva v `recovery.json` zostáva ako **akcia**, ale nesmie sa čítať zo samotného `avg_watch_time`.
Report preto vynucuje povinný panel — reel je `measured` len keď má **všetky**:

`avg_watch_time_sec` · `actual_video_duration_sec` · `avg_watch_ratio` · `reach` · `saves` · `shares`

Panel sa číta z **toho istého horizontu**, z ktorého prišla KPI, takže čísla vedľa verdiktu
popisujú ten istý moment. Chýbajúca metrika sa vypíše menom (`#1 missing avg_watch_ratio`),
nie zamlčí. Nula je meranie, chýbajúca hodnota nie.

`avg_watch_ratio` odlišuje **„reel neudržal"** od **„reel bol len krátky"** — rozdiel, ktorý
`avg_watch_time` sám o sebe spraviť nevie, a presne ten dôvod, prečo deväť ~5,2 s reelov vyzeralo
ako kreatívne zlyhanie, hoci to bolo zlyhanie dĺžky. **Do CI scoringu nevstupuje nič z toho.**

---

## Prehľadová tabuľka — 5 recovery briefov

| # | objective | tier / scene | shot archetype | first-frame hook | one action | payoff 0–3 s | dur | speech | loop logic |
|---|---|---|---|---|---|---|---|---|---|
| **1** | Reprodukovať tvar najlepšieho reelu v okne, zámerne a nie náhodou. | `bedroom` · intimate / private + light motion | `light_motion` | Close-medium, tvár blízko kamery, pohľad mimo objektív — divák vidí, že sa o chvíľu pozrie naňho. | a very slight asymmetric smile starts, and her hand comes up to adjust a strand of hair and the thin gold chain at her collarbone | ~1,5 s: oči nájdu objektív + veľmi jemný asymetrický úsmev. To je celá odmena. | **8 s** | **nie** | Posledný frame = otvárací postoj a pohľad mimo objektív, takže slučka nemá šev. |
| **2** | Overiť, či wellness register drží pozornosť bez studiového vybavenia v zábere. | `terrace_rooftop` · wellness + gesture | `gesture_motion` | Otvorená strešná terasa, ranné slnko zboku, postava blízko kamery — svetlo a priestor, nie cvičebné náradie. | she tucks one strand of hair back behind her ear | ~1,5 s: oči na objektív, potom jedno zastrčenie prameňa vlasov za ucho. | **7 s** | **nie** | Vráti sa do rovnakého postoja a pohľadu mimo objektív. |
| **3** | Otestovať, či scéna so živým pozadím drží rovnako ako súkromný register — celý posledný obsah je samota. | `cafe_restaurant` · living social / candid moment | `interaction_object` | Kaviarenská terasa, teplá ochre fasáda za ňou, rozostrení ľudia v hĺbke — okamžite čitateľné miesto. | she lifts the cup, takes one slow sip, and sets it back down | ~2 s: oči na objektív a jeden pomalý dúšok z espressa, ktoré je v scéne uzamknuté. | **8 s** | **nie** | Šálka sa vráti na stôl do východiskovej polohy, pohľad ide mimo objektív. |
| **4** | Druhé čítanie smeru #1 v inej miestnosti a inom svetle — n=1 na smer nie je výsledok. | `living_room` · intimate variant — a second read on #1 | `light_motion` | Protisvetlo cez záclonu za ňou, obrys vysvietený — mäkký, okamžite čitateľný portrét. | her hand comes up and she adjusts the thin gold chain at her collarbone | ~1,5 s: oči na objektív, potom ruka k retiazke na kľúčnej kosti. | **7 s** | **nie** | Ruka klesne, pohľad ide mimo objektív — zhoda s prvým framom. |
| **5** | Zámerne mimo troch smerov — najbližší bod k vizuálnej motívovej vrstve, ktorá je ďalšia testovaná premenná pri výsledku 0/5. | `pool` · challenger — free attempt outside the three directions | `sitting_window` | Tyrkysová voda a tvrdé letné svetlo — jediný jasný, vysoko farebný frame v celej päťke. | she lifts one hand out of the water and lets it fall back | ~2 s: oči na objektív, potom ruka von z vody a späť. | **8 s** | **nie** | Ruka sa vráti do vody, pohľad mimo objektív. |

### Prečo má každý recovery potenciál — historická evidencia z DB

| # | source day / posted | views | reach | avg watch | actual duration | watch ratio | čo z toho vyplýva |
|---|---|---|---|---|---|---|---|
| **1** | Day 78 · 2026-08-17 | 312 | 209 | **6.28 s** | 8.13 s | **0.772** | Najvyšší watch time a najvyšší watch ratio v celom okne. Rovnaký tier, rovnaký light-motion register, eye-contact beat + jediné gesto rukou k retiazke. |
| **2** | Day 76 · 2026-08-15 | 218 | 187 | **4.92 s** | 8.13 s | **0.605** | Druhý najlepší wellness reel; jediná akcia (zdvihnutie retiazky) + návrat pohľadu na objektív. Deň 92 v tom istom tieri, ale s reformerom v scéne, spadol na 2,89 s — náradie ťahá prompt k objektom a fyzike, ktoré scéna neunesie. |
| **3** | Day 71 · 2026-08-10 | 511 | 445 | **6.36 s** | 8.13 s | **0.783** | Najviac views aj najvyšší watch ratio z celých 24 reelov. Ukazuje, že strop účtu je výrazne nad súčasnými číslami — nie je to problém dosahu, je to problém udržania. |
| **4** | Day 70 · 2026-08-09 | 241 | 155 | **5.83 s** | 8.13 s | **0.717** | Tretí najvyšší watch time, ten istý intimate_aesthetic tier ako #1 ale iná miestnosť. Dva nezávislé dôkazy, že register drží naprieč lokáciami — presne to, čo #4 testuje. |
| **5** | Day 74 · 2026-08-13 | 246 | 209 | **4.37 s** | 10.04 s | **0.435** | Jediný 10s reel v dátach. Watch 4,37 s tesne pod prahom pri najnižšom ratio z porovnateľných — dôkaz, že samotná dĺžka watch time negarantuje; ratio je to, čo treba zdvihnúť. |

Všetky čísla sú **namerané**, nie odhadnuté: views/reach/watch z Meta Insights API (sonda
2026-09-03), `actual duration` z MP4 hlavičky **publikovaného** súboru — Meta žiadne pole
s dĺžkou nevystavuje (`duration` aj `video_duration` vracajú „nonexisting field").

### Reel 1 — intimate / private + light motion *(firestarter)*

**Objective:** Reprodukovať tvar najlepšieho reelu v okne, zámerne a nie náhodou.

**Prečo tento smer:** The firestarter. Day 78 — the same tier, the same light-motion register, an eye-contact beat and a single hand gesture — is the best-performing reel in the whole window: 6.28s watch on an 8.13s file, ratio 0.772. This reproduces that shape deliberately instead of by accident.

**Scéna:** `bedroom` / `seated_still` · **8 s** · close-medium · archetype `light_motion`

**Objekty v scéne (uzavretý zoznam):** žiadne

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** Her apartment bedroom — she sits on the edge of a queen bed with a rumpled ivory linen duvet, a warm-taupe upholstered headboard behind her, a low cane bedside table to her right with one switched-on lamp giving a warm amber glow, a tall window with a half-drawn linen curtain to her left, warm wood floor and a soft rug at the bed's base. No desk, no chair, no second table, no wardrobe, no TV, no overhead lighting active.

**Wardrobe lock:** washed-cream ribbed cotton camisole (thin fixed straps, close to the body, no logo), soft charcoal knit lounge trousers (mid-rise, relaxed), bare feet, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, dark wavy hair loose past the shoulders, minimal makeup with a tinted lip

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts close to the lens, looking away to one side. Within the first second her eyes find the lens and stay there. A very slight asymmetric smile starts, and her hand comes up to adjust a strand of hair and the thin gold chain at her collarbone. She holds the look. The last frame matches the first so it loops seamlessly. 8s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

**Aby prekonal KPI 4,5 s** pri 8 s dĺžke potrebuje watch ratio **≥ 0.563**. Referenčný Day 78 mal 0.772.

---

### Reel 2 — wellness + gesture

**Objective:** Overiť, či wellness register drží pozornosť bez studiového vybavenia v zábere.

**Prečo tento smer:** Wellness is the tier of Day 76 (measured: 4.92s watch on 8.13s, ratio 0.605), the other clean performer. Gesture rather than the studio equipment: Day 92 showed the reformer pulls the prompt toward objects and physics that the scene cannot support.

**Scéna:** `terrace_rooftop` / `standing_still` · **7 s** · close-medium · archetype `gesture_motion`

**Objekty v scéne (uzavretý zoznam):** rolled yoga mat

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** Boutique hotel rooftop terrace — an open-air platform of warm poured concrete roughly 8m across, a low rendered-concrete parapet along the far edge at 1.0m, a city skyline of low-to-mid-rise rooftops receding into soft morning haze beyond it, a rolled yoga mat leaning against the parapet to her right. No chairs, no table, no lounger, no planters, no gym equipment, no signage.

**Wardrobe lock:** fitted ribbed sports bra in muted sage (wide underband, fully opaque, no logo), high-waisted full-length compression leggings in the same muted sage ribbed fabric, bare feet on warm concrete, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, sleek low ponytail slightly damp at the temples

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. She tucks one strand of hair back behind her ear. She holds the look. The last frame matches the first so it loops seamlessly. 7s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

**Aby prekonal KPI 4,5 s** pri 7 s dĺžke potrebuje watch ratio **≥ 0.643**. Referenčný Day 76 mal 0.605.

---

### Reel 3 — living social / candid moment

**Objective:** Otestovať, či scéna so živým pozadím drží rovnako ako súkromný register — celý posledný obsah je samota.

**Prečo tento smer:** The one direction with real ambient life in frame. Tests whether a candid, populated setting holds attention as well as the private register — the account's whole recent output is solitary, and a validator that only ever sees empty rooms cannot tell us if that is the constraint.

**Scéna:** `cafe_restaurant` / `eating_drinking` · **8 s** · close-medium · archetype `interaction_object`

**Objekty v scéne (uzavretý zoznam):** white ceramic espresso cup, saucer

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** A small neighbourhood café terrace in El Born, Barcelona — she sits at a round marble-topped table 50cm in front of her carrying one white ceramic espresso cup on a saucer, a bentwood chair beneath her, the aged ochre-yellow plaster facade of a four-storey building filling the midground 3m behind, a faded cream-and-sage canvas awning above casting one diagonal band of shade. A few blurred anonymous patrons sit at 6m depth in soft focus. No menus, no signage, no branded items, no second sharp face.

**Wardrobe lock:** thin-strap cream ribbed cotton top (fixed narrow straps, scoop neck, no logo), faded straight-leg mid-blue jeans (high-rise), tan leather flat sandals, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, dark wavy hair loose, soft everyday makeup

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. She lifts the cup, takes one slow sip, and sets it back down. She holds the look. The last frame matches the first so it loops seamlessly. 8s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

**Aby prekonal KPI 4,5 s** pri 8 s dĺžke potrebuje watch ratio **≥ 0.563**. Referenčný Day 71 mal 0.783.

---

### Reel 4 — intimate variant — a second read on #1

**Objective:** Druhé čítanie smeru #1 v inej miestnosti a inom svetle — n=1 na smer nie je výsledok.

**Prečo tento smer:** The same register as Reel 1 in a different room and a different light. If #1 works and #4 does not, the result is about that specific room; if both work, the register is what carries. n=1 on a direction is not a result.

**Scéna:** `living_room` / `seated_still` · **7 s** · close-medium · archetype `light_motion`

**Objekty v scéne (uzavretý zoznam):** low stack of books

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** The corner of her living room by the window — she sits on the floor with her back against a low pale-linen sofa, a tall window directly behind her with a sheer curtain fully drawn diffusing late-morning light, a deep-olive painted wall to the left carrying one framed print, warm oak floorboards, a low stack of books against the wall at floor level. No coffee table, no lamp, no plant, no TV, nothing between her and the camera.

**Wardrobe lock:** oversized washed-white cotton shirt worn open over a fitted deep-olive ribbed tank, soft cream knit shorts, bare feet, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, dark wavy hair loose and slightly undone, bare skin makeup with a tinted lip

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts seated, close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. Her hand comes up and she adjusts the thin gold chain at her collarbone. She holds the look. The last frame matches the first so it loops seamlessly. 7s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

**Aby prekonal KPI 4,5 s** pri 7 s dĺžke potrebuje watch ratio **≥ 0.643**. Referenčný Day 70 mal 0.717.

---

### Reel 5 — challenger — free attempt outside the three directions

**Objective:** Zámerne mimo troch smerov — najbližší bod k vizuálnej motívovej vrstve, ktorá je ďalšia testovaná premenná pri výsledku 0/5.

**Prečo tento smer:** Deliberately outside the tested set, and deliberately not a fourth variation on a quiet interior. A bright, high-colour, open-water frame — the closest thing in this set to the visual-motif layer that becomes the next tested variable if the prompt layer turns out not to have been the problem (see the 0-of-5 branch in recovery.json).

**Scéna:** `pool` / `seated_still` · **8 s** · close-medium · archetype `sitting_window`

**Objekty v scéne (uzavretý zoznam):** žiadne

<details><summary>Spatial setup + wardrobe lock</summary>

**Spatial setup:** A private plunge pool on a limestone terrace — she sits on the brushed-limestone coping at the near edge with her feet in the water, the turquoise-green mosaic-tile pool surface filling the lower midground, a 1m stone parapet to the left covered in bougainvillea casting hard broken shadows across the pale stone, open high-summer sky above. No chairs, no table, no sunbed, no umbrella, no towel rack, no signage.

**Wardrobe lock:** black high-waisted bikini (smooth matte fabric, full-coverage bandeau top, no logo), oversized white open-weave cotton shirt worn completely open over it, barefoot, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings under 12mm, wet-look dark hair pushed back, bare skin, no makeup beyond a tinted lip

</details>

**Kompilovaný motion prompt** — presne toto ide do generátora:

```
Close-medium on her, camera static at chest height. She starts seated, close to the lens, looking just off camera. Within the first second her eyes find the lens and stay there. She lifts one hand out of the water and lets it fall back. She holds the look. The last frame matches the first so it loops seamlessly. 8s, vertical 9:16.
```

**Negative prompt:** `no speech, no text, no captions, no watermark, no camera movement, no zoom, no cuts, no second person in frame, no face morphing`

**Validácia:** 0 errors, 0 warnings · klasifikácia scény: authored (nie odvodená)

**Aby prekonal KPI 4,5 s** pri 8 s dĺžke potrebuje watch ratio **≥ 0.563**. Referenčný Day 74 mal 0.435.

---
## Publish protokol

- **Publikuje sa ručne z mobilu, s trending audiom.** Graph API nevie pripojiť trending audio,
  takže pipeline zámerne končí na `ready`. V recovery je to výhoda, nie obmedzenie.
- **Rovnaký time slot pre všetkých 5** (±30 min). Čas nie je testovaná premenná.
- **Stories bežia ďalej v normálnom režime** — držia follower touch, kým je reel kadencia znížená.
- **Kadencia: 4–5 reelov týždenne**, nie denne.
- **Jedna premenná.** Menia sa iba motion/prompt. Captiony, publishing time, styling a hashtagy
  zostávajú presne také, aké sú.
- **QA gate pred schválením:** nameraná dĺžka v pásme (automaticky, server-side) + tri manuálne
  body — tvár/pohyb v prvom frame, eye contact do 1,5 s, žiadny pomalý establishing shot.
- Po publikovaní doplniť `platform_post_id` a `posted_at` do [`recovery.json`](../recovery.json).

## Dodržané pravidlá sprintu

| pravidlo | ako je vynútené |
|---|---|
| jedna okamžite čitateľná situácia | jeden micro-location lock v každom briefe; `location_class` je authored |
| jedna hlavná akcia | `auto_reel_single_action` — error pri troch alternatívach v jednej vete |
| payoff do 0–3 s | eye-contact beat je fixne v prvej sekunde, akcia hneď za ním |
| dĺžka len ak to dáva zmysel | schválené targety 8/7/8/7/8 s podľa počtu beatov. Compiler odmietne hodnotu mimo pásma 6–8 s, neoreže ju |
| žiadny random GRWM/ASMR/POV overlay | `pickReelFormat(day_number)` sa na tejto ceste nepoužíva vôbec; `format_coherence` navyše viaže formát na action class |
| žiadne generické props/physics | `scene_entities` je uzavretý zoznam; `prop_coherence` + physics scene-precondition |
| speech iba ak je speech hook | `speech_is_the_point: false` na všetkých piatich → `speech_gating` |
| prompt musí byť scene-aware | dvojvrstvový validator beží nad každým promptom; všetkých 5 má 0 errors |

## Rozhodovacie pravidlo

Zaregistrované vopred v [`recovery.json`](../recovery.json), asertované v CI. Primárna KPI
**watch time ≥ 4,5 s** (7d, fallback 72h); saves + shares sekundárne; views len kontext.
≥2 z 5 → smer funguje, `CI_SCORING_FROZEN` ostáva ďalších 14 dní · 1 z 5 → predĺžiť o 3 reels
v najsilnejšom smere · 0 z 5 → ďalšia premenná je vizuálna motívová vrstva.

**Nové v reporte:** povinný metrický panel (viď hore). `avg_watch_ratio` sa zbiera a zobrazuje pri
každom reeli aj v agregáte pod verdiktom, ale **nevstupuje do prahu ani do žiadneho CI scoringu** —
prah je stále avg watch time.
