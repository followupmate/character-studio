import { describe, it, expect, afterEach } from "vitest";
import { DAILY_SLOTS, selectArchetypesForSlots, type Archetype } from "@/lib/archetypeDeck";
import { isCiScoringFrozen } from "@/lib/ciScoringFrozen";

// RECOVERY phase 2 acceptance test.
//
// "Visibly different output" is not an acceptance criterion, so this is: run the real selector
// 200x dry (no DB, no writes) with CI_SCORING_FROZEN semantics on, and assert the distribution.
// The pool is the LIVE chs_shot_archetypes deck as it exists in production today — 15 rows, all
// weight 1, verified 2026-09-03 — not a reduced fixture, because the whole point of the freeze is
// that selection reaches all 15 again instead of the 3 the published reels had collapsed to.
const LIVE_POOL: Archetype[] = [
  { id: "wide_interior", family: "environment" },
  { id: "wide_nature", family: "environment" },
  { id: "wide_street", family: "environment" },
  { id: "interaction_object", family: "subject" },
  { id: "over_shoulder", family: "subject" },
  { id: "sitting_window", family: "subject" },
  { id: "walking_solitude", family: "subject" },
  { id: "emotional_close", family: "detail" },
  { id: "fabric_texture", family: "detail" },
  { id: "hands_object", family: "detail" },
  { id: "gesture_motion", family: "motion" },
  { id: "light_motion", family: "motion" },
  { id: "walking_motion", family: "motion" },
  { id: "creator_process", family: "bts" },
  { id: "setup_shot", family: "bts" },
].map((a) => ({ ...a, guidance: "", feed_cooldown: 7, reel_cooldown: 5, story_cooldown: 2, weight: 1 } as Archetype));

const DRY_RUNS = 200;
const MAX_SHARE = 0.15;

// A dry run reserves nothing and logs nothing, so there is no usage history to cool down against —
// each of the 200 runs is an independent "what would a fresh batch pick" draw.
const noCooldown = () => false;

function runDistribution(opts: { frozen: boolean; preferredShotStyle?: string | null }) {
  const counts = new Map<string, number>();
  let draws = 0;
  for (let i = 0; i < DRY_RUNS; i++) {
    const picked = selectArchetypesForSlots({
      archetypes: LIVE_POOL,
      slots: DAILY_SLOTS,
      isInCooldown: noCooldown,
      frozen: opts.frozen,
      preferredShotStyle: opts.preferredShotStyle,
    });
    for (const id of Object.values(picked)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      draws++;
    }
  }
  return { counts, draws };
}

describe("CI_SCORING_FROZEN", () => {
  const original = process.env.CI_SCORING_FROZEN;
  afterEach(() => {
    if (original === undefined) delete process.env.CI_SCORING_FROZEN;
    else process.env.CI_SCORING_FROZEN = original;
  });

  it("defaults to false and only reads the literal string 'true'", () => {
    delete process.env.CI_SCORING_FROZEN;
    expect(isCiScoringFrozen()).toBe(false);
    process.env.CI_SCORING_FROZEN = "false";
    expect(isCiScoringFrozen()).toBe(false);
    process.env.CI_SCORING_FROZEN = "1";
    expect(isCiScoringFrozen()).toBe(false);
    process.env.CI_SCORING_FROZEN = "true";
    expect(isCiScoringFrozen()).toBe(true);
    process.env.CI_SCORING_FROZEN = "TRUE";
    expect(isCiScoringFrozen()).toBe(true);
  });

  it("reaches every one of the 15 archetypes across 200 dry runs", () => {
    const { counts } = runDistribution({ frozen: true });
    const missing = LIVE_POOL.filter((a) => !counts.has(a.id)).map((a) => a.id);
    expect(missing, `archetypes never selected in ${DRY_RUNS} runs: ${missing.join(", ")}`).toEqual([]);
    expect(counts.size).toBe(15);
  });

  it("gives no single archetype more than 15% of all draws", () => {
    const { counts, draws } = runDistribution({ frozen: true });
    const over = [...counts.entries()]
      .map(([id, n]) => ({ id, share: n / draws }))
      .filter((r) => r.share > MAX_SHARE);
    expect(
      over,
      `over the ${MAX_SHARE * 100}% cap: ${over.map((o) => `${o.id} ${(o.share * 100).toFixed(1)}%`).join(", ")}`
    ).toEqual([]);
  });

  it("ignores the CI preferredShotStyle nudge while frozen", () => {
    // Unfrozen, a preferredShotStyle of "Walking" gives walking_motion a 1.5x bonus inside the
    // motion family; frozen, walking_motion must sit level with its two siblings.
    const frozen = runDistribution({ frozen: true, preferredShotStyle: "Walking" });
    const motionDraws = ["gesture_motion", "light_motion", "walking_motion"]
      .reduce((sum, id) => sum + (frozen.counts.get(id) ?? 0), 0);
    const walkingShare = (frozen.counts.get("walking_motion") ?? 0) / motionDraws;
    // Uniform over 3 motion archetypes = 1/3; a 1.5x bonus would push it to ~0.43.
    expect(walkingShare).toBeGreaterThan(0.22);
    expect(walkingShare).toBeLessThan(0.45);
  });

  it("still honours craft constraints — cooldowns are not a performance signal", () => {
    // emotional_close is excluded from carousel_3 by the deck itself. The freeze must not turn the
    // pool into a free-for-all that ignores per-slot exclusions.
    for (let i = 0; i < 50; i++) {
      const picked = selectArchetypesForSlots({
        archetypes: LIVE_POOL,
        slots: DAILY_SLOTS,
        isInCooldown: noCooldown,
        frozen: true,
      });
      expect(picked.carousel_3).not.toBe("emotional_close");
      // and no archetype is used twice inside one batch
      const ids = Object.values(picked);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
