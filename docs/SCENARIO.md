# Scenario — Vivienne / Drift Edition

This is the editorial source of truth for the project. Every system decision (cron behaviour, prompt structure, UI choice) must be checked against the principles here.

## Core principle

This is **not serial fiction**. There is no plot, no protagonist arc, no reveal. Vivienne is not a character moving through a story; she is a **stable presence in a slowly-destabilising world**.

The progression is not narrative. It is **atmospheric erosion**: reality itself becomes incrementally less coherent over time. The audience's emotional investment grows with the world, not with the character.

The product is the mystery. Explanation destroys the product.

## What must never exist

The moment any of these appear, the project is dead:

- ❌ Reveals or explanations
- ❌ "She is AI" / "It's a simulation" disclosure
- ❌ A villain or antagonist
- ❌ An ending, season finale, resolution
- ❌ ARG-style puzzles inviting audience to "solve" anything
- ❌ Classical 3-act structure
- ❌ Backstory dumps
- ❌ Direct address to camera ("guys, today I…")
- ❌ Influencer voice patterns

If the audience asks "are you AI?" → comment about weather instead. If they ask "what's the lore?" → "the train was on time." If they ask "what year is it?" → silence.

## Progression structure — 5 atmospheric phases

Phases are **time-gated, not event-gated**. They unfold whether or not anything "happens".

### Phase 1 — Accepted Reality
**Days 1–30 · Month 1**

The audience learns the rhythm.

- Grounded routine 80% / cinematic melancholy 20%
- Mandarins, Shinagawa station, escalators, empty corridors
- **No drift seeds active**
- **No Marseille Stranger**
- Comments handled with extreme restraint (`i thought so too`, `the train was on time`)

**Purpose:** make the account feel safe, slow, predictable. Build the algorithmic-fatigue-relief audience. Establish that this account is not asking anything of the viewer.

**Automated:** cron picks tier 80/20, drift seed probability = 0.

### Phase 2 — Recurring Dislocation
**Days 31–90 · Months 2–3**

Reality begins to softly loop.

- Same station, same hour, same silhouette recurring across days
- Timestamp mismatches first appear (`04:17` in caption while video is daylight)
- Marseille Stranger first emerges as a vague background figure
- Impossible weather memories surface ("yesterday's rain" with dry ground)
- Vivienne never acknowledges — that is what unsettles

**Audience reaction:** micro-paranoia. Viewers ask each other in comments: "Did anyone notice the time?" Vivienne responds with strict micro-validation, never explanation.

**Automated:** tier mix unchanged (80/20). Drift seeds enabled with low probability per `lib/storyTier.ts`. Marseille Stranger asymmetric recurrence (cluster after first sighting, hard gap after 3 in 14 days).

### Phase 3 — Infrastructural Unease
**Days 91–180 · Months 4–6**

The city begins to have its own will.

- Metro announcements that repeat at impossible moments
- Vending machine that "reacts"
- Split-flap boards that freeze mid-rotation
- Ferry horns at hours when no ferry is running
- Same passers-by appearing at distant locations

Still **not sci-fi**. Still **not horror**. Systemic strangeness without explanation.

**Audience reaction:** systemic tension. Comments shift from "What is this account?" to "What is this place?"

**Automated:** new drift seed type `infrastructure_glitch` introduced. Marseille Stranger more frequent. Operator (manual) injects ~1 Failed Fragment per 14 days.

### Phase 4 — Memory Erosion
**Days 181–365 · Months 7–12**

The strongest phase. Vivienne begins to **mis-remember reality** without commentary, without correction.

- "it rained all morning" caption on a dry, sunlit video
- Reference to a person/place that doesn't appear in any frame
- Timestamps that don't match what the audience already learned
- A casual mention of "yesterday" describing something that happened the week before

The audience never gets confirmation that anything is wrong.

**Automated:** memory contradiction drift seeds. Failed Fragments cadence: ~1 per 10 days. Comment voice now openly evasive.

### Phase 5 — Environmental Consciousness
**Day 365+**

Vivienne becomes less the centre, more the presence. The city itself begins to feel like the subject.

- Full days without her appearing
- Long static shots of empty trains, empty platforms, empty corridors with environmental audio only
- The Ghost Stream events (~quarterly, manual): 4-hour live stream of an empty night train, auto-deleted afterwards
- Social Contamination active: manual ghost comments on unrelated brutalist-architecture videos, ferry videos, ambient channels

Open-ended endgame. There is no closure. The account can run for years in this state.

## Phase operational matrix

| Element | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|
| Daily 8-slot batch | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tier mix 80/20 grounded/cinematic | ✓ | ✓ | ✓ | ✓ | ✓ |
| Drift seeds | ✗ | ✓ | ✓ | ✓ | ✓ |
| Marseille Stranger | ✗ | ✓ | ✓✓ | ✓✓ | ✓✓ |
| Timestamp mismatch | ✗ | ✓ | ✓ | ✓ | ✓ |
| Impossible weather memory | ✗ | ✓ | ✓ | ✓ | ✓ |
| Infrastructure glitch (new seed) | ✗ | ✗ | ✓ | ✓ | ✓ |
| Memory contradiction (new seed) | ✗ | ✗ | ✗ | ✓ | ✓ |
| Failed Fragments (manual) | ✗ | ✗ | rare | ✓ | ✓ |
| Ghost Comments (manual) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Ghost Stream events (manual) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Full days without subject | ✗ | ✗ | ✗ | rare | ✓ |

## Automated vs manual — what lives where

The repo handles **all daily automated content**: batch generation, story chapters, scene briefs, slot prompts, queue, scheduling, dispatch. This runs hands-off.

The operator handles **all intentional strangeness**: Failed Fragments, ghost comments under unrelated videos, geotag anomalies, ghost streams. Automating these destroys them — strangeness must feel like a glitch a real person noticed, not a feature on a cron.

## Drift "plot" — the actual progression

The only real story is **audience attachment growth over time**. The progression is measured by:

- Day 7: viewer recognises the station
- Day 14: viewer waits for 04:17 to appear in a caption
- Day 30: viewer can name three of her objects without being told
- Day 60: viewer asks in comments "is that the same man?"
- Day 100: viewer feels uneasy about Tuesday
- Day 200: viewer says they dreamed of the platform
- Day 365: viewer cannot remember when they started following

That is the story. Nothing else.

## Reference — phase boundaries in code

```
lib/storyTier.ts → PHASE_1_LAST_DAY = 30
                  PHASE_2_LAST_DAY = 90  (planned)
                  PHASE_3_LAST_DAY = 180 (planned)
                  PHASE_4_LAST_DAY = 365 (planned)
```

Phase 2+ drift seed probabilities and new seed types will be added when those days arrive. Phase 1 is the only enforced gate today.
