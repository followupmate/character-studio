# Scenario — Vivienne / Luxury Travel + Aesthetic Edition

This is the editorial source of truth for the project. Every system decision (cron behaviour, prompt structure, UI choice) must be checked against the principles here.

## Core principle

Vivienne lives in Barcelona. She loves her city — her apartment in El Born, her gym studio, her favourite café — but her life runs in **rhythmic arcs**: a few days at home, then a trip (Lisbon, Amalfi, Paris), then she returns to Barcelona, back to her morning pilates and terrace light and aftermath reflection. She documents the arrival, the peak, the departure, the return. Her feed is warm, desirable, and deeply personal — the audience wants to travel with her, yes, but more importantly, they want her life structure: grounded home base + the freedom to move, then the luxury of coming back. Home is as editorial as the hotels.

The commercial goal is dual: **brand deals** (luxury travel, fashion, hospitality) and **Fanvue** (intimate/exclusive content subscription, featuring home apartment + continuation content from trips). Phase 1 builds the arc audience (visual seriality, follower engagement through story continuity). Phase 2+ layers in the intimate track and monetization.

## What must never exist

- ❌ Influencer clichés: "living my best life", "wanderlust", "blessed", "grateful", "healing era"
- ❌ Hollow affirmations addressed to the audience ("you deserve this too!")
- ❌ Press-release language ("excited to partner with")
- ❌ Overly explicit content on the main feed — sensuality stays editorial
- ❌ AI disclosure in any form
- ❌ Brand name drops without a real deal in place

## Progression structure — 4 commercial phases

Phases are **time-gated**. Day count resets from 0 with the pivot launch.

---

### Phase 1 — Launch
**Days 1–30**

Build the aesthetic identity fast. Both tiers active from Day 1 (70% travel / 30% intimate). No slow burn.

- Cities: rotate between 2–3 locations (Paris, Lisbon, Amalfi recommended for Phase 1)
- Travel content: golden hour terraces, café mornings, coastal walks, hotel balconies
- Intimate content: silk robe, suite morning light, body-confident editorial — edge in captions
- Wardrobe: silk, linen, gold jewelry; silk robe and lingerie acceptable from Day 1
- **Goal:** reach 500–1000 followers organically. Get the algorithm baseline. Establish both the travel identity and the body-confident edge simultaneously.

**Automated:** cron picks tier per 70/30 ratio. All content phase signals active from Day 1.

**What to post manually:** 1–2 story frames per day (location sticker, candid BTS). Engage with both travel and aesthetic comments.

---

### Phase 2 — Audience Deepening + Intimate Layer Unlock
**Days 31–60**

Introduce intimate_aesthetic tier (30% of days). First soft Fanvue signal.

- Continue travel content as primary (70%)
- Introduce bedroom/suite mornings: silk robe, window light, room service — editorial not explicit
- First Fanvue link in bio (soft launch, no announcement caption)
- ig_caption for intimate_aesthetic days: oblique and personal ("do not disturb", "room 214 had the best light")
- **Goal:** first Fanvue subscribers from IG. First brand DM responses.

**Automated:** tier mix unlocked (70/30). Content phase signals active (location_drop, golden_hour_moment, hotel_morning).

---

### Phase 3 — First Monetization Drop
**Days 61–90**

Active monetization. Link in bio prominent. First brand collaboration if DMs converted.

- Fanvue funnel: 1 explicit link drop per week in captions ("for more:")
- First brand story frames (if deals secured) — disclosed per platform rules
- Reel quality: prioritise reel_video for algorithm reach during this phase
- **Goal:** €500+/month Fanvue recurring. First paid brand post.

**Automated:** same tier mix. Story slots start including link-drop language in ig_caption when hotel_morning phase signal is active.

---

### Phase 4 — Dual-Track Growth
**Days 91+**

Full operation. Both revenue streams active and compounding.

- Travel cadence: 2 new cities per month
- Fanvue: exclusive location content + room content
- Brand deals: 1–2 per month at this follower tier
- Reel frequency: daily reel_video processed via Kling 3.0
- **Goal:** €2000+/month combined. Waiting list for brand partnerships.

---

## Phase operational matrix

| Element | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Daily 8-slot batch | ✓ | ✓ | ✓ | ✓ |
| Tier: lifestyle_travel | 70% | 70% | 70% | 70% |
| Tier: intimate_aesthetic | 30% | 30% | 30% | 30% |
| Content phase signals | ✓ | ✓ | ✓ | ✓ |
| Fanvue link in bio | ✗ | ✓ | ✓ | ✓ |
| Link drop in caption | ✗ | ✗ | ✓ | ✓ |
| Brand deal posts | ✗ | ✗ | rare | ✓ |
| Reel daily | ✗ | rare | ✓ | ✓ |

## Arc rhythm — Story Engine sequencing

Starting 2026-08-21, Vivienne's narrative follows **arcs** (3–7 day chapters), not random events. Each arc has a type, city, premise, and arc phases.

- **Arc types:** trip (new city, 3–5 days), home_interlude (Barcelona, 2–4 days, own premise — project, visitor, event), city_event (day event in Barcelona or return city), visitor (friend visiting Barcelona), project (apartment project, event prep in Barcelona).
- **Arc rhythm rule:** after every trip arc, ALWAYS a home_interlude follows (2–4 days). Data showed aftermath-at-home is the strongest content. Never 2 trips in a row.
- **Max 1 trip per ~10 days.** Striae variety: never 3× same arc_type in a row. Return cities (Barcelona, Lisbon, Amalfi) repeat every 3–4 weeks.
- **Arc city pool:** Barcelona (home), Paris, Amalfi, Lisbon, Santorini, Monaco, Milan, Rome, Dubrovnik (Tier A); Mykonos, Porto, Florence, Nice, Capri (Tier B, use sparingly).
- **Arc phases per day:** anticipation (day before) → travel → arrival → exploration → peak (strongest content + Fanvue moment) → departure → aftermath (home). Home arcs: setup → build → peak → aftermath.
- **Fanvue hook:** each arc has an optional private continuation hook (e.g., peak evening → exclusive "the rest of that night" unlock). Drops are soft CTA in Vivienne's voice, max 1/week.

Arc selection, timing, and Fanvue hook are generated automatically by `lib/arcPlanner.ts` (gated by `arc_planner_v1` flag).

## City rotation guidance (legacy)

Baseline guidance before arcs: Rotate location every 5–10 days. Keep 2–3 "home base" cities (Barcelona, Paris, Amalfi) that she returns to repeatedly — this builds recognition. One "new city" drop per 3–4 weeks creates arrival energy content.

**Tier A cities (high Soul 2 training data = best image quality):**
Paris, Amalfi, Positano, Lisbon, Santorini, Monaco, Milan, Rome, Barcelona, Dubrovnik

**Tier B cities (good but verify image quality):**
Mykonos, Porto, Florence, Nice, Capri, Valletta, Split

## Reference — phase boundaries in code

Both tiers active from Day 1. No phase gate.

Content phase signal probabilities live in `lib/storyTier.ts → pickDriftSeeds`.
