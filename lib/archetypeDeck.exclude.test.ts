import { describe, it, expect, vi } from "vitest";

const rows = vi.hoisted(() => [
  { id: "walking_motion", family: "motion", guidance: "g", feed_cooldown: 7, reel_cooldown: 5, story_cooldown: 2, weight: 1 },
  { id: "ootd_stop", family: "motion", guidance: "g", feed_cooldown: 7, reel_cooldown: 5, story_cooldown: 2, weight: 1 },
  { id: "grwm_loading", family: "motion", guidance: "g", feed_cooldown: 7, reel_cooldown: 5, story_cooldown: 2, weight: 1 },
]);

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        gte: async () => ({ data: [] }),
        then: (res: (v: unknown) => void) => res({ data: table === "chs_shot_archetypes" ? rows : [], error: null }),
      };
      return b;
    },
  },
}));

import { pickArchetypesForBatch, DAILY_SLOTS } from "@/lib/archetypeDeck";

describe("pickArchetypesForBatch excludeArchetypeIds (Phase 2)", () => {
  const reel = DAILY_SLOTS.filter((s) => s.slot === "reel_video");

  it("never draws an excluded recipe archetype from the motion pool", async () => {
    for (let i = 0; i < 100; i++) {
      const m = await pickArchetypesForBatch({ characterId: "c", slots: reel, excludeArchetypeIds: ["ootd_stop", "grwm_loading"] });
      expect(m["reel_video"]).toBe("walking_motion");
    }
  });

  it("without the exclusion the recipe rows ARE in the pool (this is why the exclusion exists)", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add((await pickArchetypesForBatch({ characterId: "c", slots: reel }))["reel_video"]);
    expect(seen.has("ootd_stop")).toBe(true);
  });
});
